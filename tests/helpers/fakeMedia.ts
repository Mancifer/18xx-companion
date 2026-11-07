import type {
  AnalyserLike,
  AudioContextLike,
  MediaDeps,
  RecorderLike,
  StreamLike,
  TrackLike,
} from "../../src/voice/recorder";

/**
 * Feature 015 (T005): fakes for the browser media APIs jsdom lacks. Whisper code takes them
 * through `MediaDeps`, so tests drive a recording without a microphone.
 */

export class FakeTrack implements TrackLike {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

export class FakeStream implements StreamLike {
  readonly tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

/** A recorder whose `start` and `stop` events fire on the next microtask, like the real one. */
export class FakeMediaRecorder implements RecorderLike {
  /** The MIME types `isTypeSupported` accepts; tests replace it. */
  static supported = new Set<string>(["audio/webm;codecs=opus"]);
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type);
  }

  readonly mimeType: string;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(
    readonly stream: StreamLike,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
    queueMicrotask(() => this.onstart?.());
  }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
}

/** Plays `levels` one per read: every sample of the frame equals the level, so its RMS is the level. */
export class FakeAnalyser implements AnalyserLike {
  fftSize = 2048;
  private i = 0;
  constructor(private readonly levels: readonly number[]) {}
  getFloatTimeDomainData(array: Float32Array) {
    const level = this.levels[Math.min(this.i, this.levels.length - 1)] ?? 0;
    this.i += 1;
    array.fill(level);
  }
}

export class FakeAudioContext implements AudioContextLike {
  static instances: FakeAudioContext[] = [];
  static levels: readonly number[] = [0.2];
  closed = false;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource() {
    return { connect: () => undefined };
  }
  createAnalyser() {
    return new FakeAnalyser(FakeAudioContext.levels);
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

export type MicFailure = "NotAllowedError" | "NotFoundError" | "OverconstrainedError" | "SecurityError" | "AbortError";

export interface FakeMediaOptions {
  /** `getUserMedia` rejects with a DOMException of this name. */
  readonly fail?: MicFailure;
  /** Analyser levels, one per ~50 ms frame (default: a steady 0.2, i.e. speech). */
  readonly levels?: readonly number[];
  /** MIME types the recorder supports (default: webm/opus). */
  readonly supported?: readonly string[];
  /** Holds `getUserMedia` until `grant()` is called (the permission prompt is open). */
  readonly manualGrant?: boolean;
  /** No AudioContext: no levels, no speech gate. */
  readonly noAudioContext?: boolean;
}

export interface FakeMedia {
  readonly deps: MediaDeps;
  readonly streams: FakeStream[];
  readonly calls: MediaStreamConstraints[];
  /** Resolves a held `getUserMedia` (with `manualGrant`). */
  grant(): void;
  /** Every track of every stream was stopped. */
  allStopped(): boolean;
}

export function fakeMediaDeps(options: FakeMediaOptions = {}): FakeMedia {
  FakeMediaRecorder.supported = new Set(options.supported ?? ["audio/webm;codecs=opus"]);
  FakeMediaRecorder.instances = [];
  FakeAudioContext.instances = [];
  FakeAudioContext.levels = options.levels ?? [0.2];
  const streams: FakeStream[] = [];
  const calls: MediaStreamConstraints[] = [];
  let grant: () => void = () => undefined;
  const deps: MediaDeps = {
    getUserMedia: (constraints) => {
      calls.push(constraints);
      if (options.fail) return Promise.reject(new DOMException("mic", options.fail));
      const stream = new FakeStream();
      streams.push(stream);
      if (!options.manualGrant) return Promise.resolve(stream);
      return new Promise((resolve) => {
        grant = () => resolve(stream);
      });
    },
    MediaRecorder: FakeMediaRecorder,
    ...(options.noAudioContext ? {} : { AudioContext: FakeAudioContext }),
  };
  return {
    deps,
    streams,
    calls,
    grant: () => grant(),
    allStopped: () => streams.every((s) => s.tracks.every((t) => t.stopped)),
  };
}
