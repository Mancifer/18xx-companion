/**
 * Push-to-talk audio recording for Whisper (feature 015, research R3–R5, data-model §3). The
 * browser media APIs come in through `MediaDeps`, so tests use fakes (jsdom has none of them).
 */

export interface TrackLike {
  stop(): void;
}

export interface StreamLike {
  getTracks(): readonly TrackLike[];
}

export interface RecorderLike {
  readonly mimeType: string;
  start(): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onstart: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface RecorderCtor {
  new (stream: StreamLike, options?: { mimeType?: string }): RecorderLike;
  isTypeSupported(type: string): boolean;
}

export interface AnalyserLike {
  fftSize: number;
  getFloatTimeDomainData(array: Float32Array): void;
}

export interface AudioContextLike {
  createMediaStreamSource(stream: StreamLike): { connect(node: AnalyserLike): unknown };
  createAnalyser(): AnalyserLike;
  close(): Promise<void>;
}

export type AudioContextCtor = new () => AudioContextLike;

export interface MediaDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<StreamLike>;
  readonly MediaRecorder: RecorderCtor;
  /** Optional: without it there is no level cue and no speech gate (every recording is sent). */
  readonly AudioContext?: AudioContextCtor;
}

/** Why the microphone couldn't be used (research R4). */
export type MicErrorKind = "denied" | "noDevice" | "other";

export class MicError extends Error {
  override readonly name = "MicError";
  constructor(
    readonly kind: MicErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** getUserMedia's DOMException name → why (research R4). */
function micErrorOf(error: unknown): MicError {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return new MicError("denied", name);
  if (name === "NotFoundError" || name === "OverconstrainedError") return new MicError("noDevice", name);
  return new MicError("other", name || "getUserMedia failed");
}

/** The browser's own media APIs, or undefined where it can't record (feature 015 availability). */
export function browserMediaDeps(): MediaDeps | undefined {
  const g = globalThis as unknown as {
    navigator?: { mediaDevices?: { getUserMedia?: (c: MediaStreamConstraints) => Promise<StreamLike> } };
    MediaRecorder?: RecorderCtor;
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const devices = g.navigator?.mediaDevices;
  const getUserMedia = devices?.getUserMedia;
  if (!devices || !getUserMedia || !g.MediaRecorder) return undefined;
  const AudioContext = g.AudioContext ?? g.webkitAudioContext;
  return {
    getUserMedia: (constraints) => getUserMedia.call(devices, constraints),
    MediaRecorder: g.MediaRecorder,
    ...(AudioContext ? { AudioContext } : {}),
  };
}

export type AudioExtension = "webm" | "ogg" | "mp4";

/** Native containers Groq accepts, in order of preference (research R3). */
const TYPES: readonly { mimeType: string; extension: AudioExtension }[] = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  { mimeType: "audio/mp4", extension: "mp4" },
];

export function pickMimeType(Recorder: RecorderCtor): { mimeType: string; extension: AudioExtension } | undefined {
  return TYPES.find((t) => Recorder.isTypeSupported(t.mimeType));
}

export const MAX_RECORDING_MS = 30_000;
export const FRAME_MS = 50;
/** RMS → the 0–1 level cue: normal speech is around 0.05–0.3 RMS. */
export const LEVEL_GAIN = 5;

export interface Recording {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly extension: AudioExtension;
  readonly durationMs: number;
  readonly frameMs: number;
  /** RMS per frame, for the speech gate. */
  readonly levels: readonly number[];
  /** The 30 s limit stopped it (FR-008). */
  readonly cut: boolean;
}

export interface RecorderHandlers {
  onStarted(): void;
  onLevel(level: number): void;
  onLimit(): void;
}

export type RecorderState = "idle" | "acquiring" | "recording" | "stopped";

/**
 * One push-to-talk recording (data-model §3). Every exit stops every track and closes the audio
 * context before the next state (FR-013).
 */
export class AudioRecorder {
  state: RecorderState = "idle";
  private stream: StreamLike | undefined;
  private recorder: RecorderLike | undefined;
  private context: AudioContextLike | undefined;
  private sampler: ReturnType<typeof setInterval> | undefined;
  private limitTimer: ReturnType<typeof setTimeout> | undefined;
  private chunks: Blob[] = [];
  private levels: number[] = [];
  private startedAt = 0;
  private stoppedAt = 0;
  private cut = false;
  private stopping: Promise<Recording> | undefined;
  private type: { mimeType: string; extension: AudioExtension } | undefined;

  constructor(
    private readonly media: MediaDeps,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Resolves once recording has started (or was cancelled while acquiring); rejects with a MicError. */
  async start(handlers: RecorderHandlers): Promise<void> {
    this.type = pickMimeType(this.media.MediaRecorder);
    if (!this.type) throw new MicError("other", "no supported audio type");
    this.state = "acquiring";
    let stream: StreamLike;
    try {
      stream = await this.media.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      this.state = "stopped";
      throw micErrorOf(error);
    }
    this.stream = stream;
    // Cancelled while the permission prompt was open: free the microphone at once.
    if (!this.stillAcquiring()) {
      this.release();
      return;
    }
    const recorder = new this.media.MediaRecorder(stream, { mimeType: this.type.mimeType });
    this.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    await new Promise<void>((resolve) => {
      recorder.onstart = () => resolve();
      recorder.start();
    });
    // Cancelled before the recorder's start event: stop it too (the tracks already are).
    if (!this.stillAcquiring()) {
      recorder.onstop = null;
      recorder.stop();
      return;
    }
    this.state = "recording";
    this.startedAt = this.now();
    this.startLevels(stream, handlers);
    this.limitTimer = setTimeout(() => {
      this.cut = true;
      handlers.onLimit();
      void this.stop();
    }, MAX_RECORDING_MS);
    handlers.onStarted();
  }

  private startLevels(stream: StreamLike, handlers: RecorderHandlers): void {
    const Ctx = this.media.AudioContext;
    if (!Ctx) return;
    try {
      const context = new Ctx();
      this.context = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      this.sampler = setInterval(() => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const v of buffer) sum += v * v;
        const rms = Math.sqrt(sum / buffer.length);
        this.levels.push(rms);
        handlers.onLevel(Math.min(1, rms * LEVEL_GAIN));
      }, FRAME_MS);
    } catch {
      // No level cue; the recording itself still works.
    }
  }

  /** `state` changes across awaits (a cancel); TypeScript's narrowing can't see that. */
  private stillAcquiring(): boolean {
    return this.state === "acquiring";
  }

  /** Ends the recording; the same promise for the limit's own stop and a later release. */
  stop(): Promise<Recording> {
    if (this.stopping) return this.stopping;
    const recorder = this.recorder;
    const type = this.type;
    if (this.state !== "recording" || !recorder || !type) return Promise.reject(new Error("not recording"));
    this.stoppedAt = this.now();
    this.stopTimers();
    this.stopping = new Promise<Recording>((resolve) => {
      recorder.onstop = () => {
        this.release();
        resolve({
          blob: new Blob(this.chunks, { type: type.mimeType }),
          mimeType: type.mimeType,
          extension: type.extension,
          durationMs: this.stoppedAt - this.startedAt,
          frameMs: FRAME_MS,
          levels: [...this.levels],
          cut: this.cut,
        });
      };
      recorder.stop();
    });
    return this.stopping;
  }

  /** Drops the recording and frees the microphone, whatever the state. */
  cancel(): void {
    this.stopTimers();
    if (this.recorder && this.state === "recording") {
      this.recorder.onstop = null;
      try {
        this.recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    this.release();
  }

  private stopTimers(): void {
    if (this.sampler !== undefined) clearInterval(this.sampler);
    if (this.limitTimer !== undefined) clearTimeout(this.limitTimer);
    this.sampler = undefined;
    this.limitTimer = undefined;
  }

  /** Stops every track and closes the context (FR-013). */
  private release(): void {
    this.state = "stopped";
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
  }
}
