import type { Action } from "../domain/actions/schemas";
import { runPipeline } from "../domain/actions/pipeline";
import { moneyFlows } from "../domain/ledger/flows";
import type { Interpreter } from "../voice/interpreter";
import { message } from "../i18n/contract/domain";
import { notUnderstood, resolveError, resolveResponse, type ResolveContext, type VoiceResult } from "../voice/resolve";
import { snapshotAndTranscript } from "../voice/snapshot";
import type { SpeechCaptureSession, SpeechEngine } from "../voice/engine";
import type { VoiceSession } from "../voice/tools";

/**
 * Push-to-talk → interpret → card (FR-060–FR-075). Nothing changes until the user confirms; an
 * unconfirmed proposal lives only in memory and is gone after a reload.
 */

/** Feature 015: a brief line, not an error: nothing was heard, or the 30 s limit cut the recording. */
export type VoiceHint = "empty" | "cut";

export type VoicePhase =
  | { readonly phase: "idle"; readonly hint?: VoiceHint }
  /** `level` (0–1) comes from Whisper's recorder; the browser engine sends `interim` text instead. */
  | { readonly phase: "listening"; readonly interim: string; readonly level?: number }
  /** Feature 015: Whisper, between release and the transcript; cancellable (FR-007). */
  | { readonly phase: "transcribing" }
  | { readonly phase: "interpreting"; readonly transcript: string }
  | { readonly phase: "result"; readonly result: VoiceResult; readonly clarification?: string; readonly hint?: VoiceHint };

export interface VoiceEffects {
  readonly dispatch: (action: unknown, options: { source: "voice"; transcript: string }) => Promise<{ ok: boolean }>;
  /** Undoes the newest entry (feature 010). */
  readonly undoLast: () => Promise<{ ok: boolean }>;
  /** Undoes back to an entry, after the range sheet was confirmed. */
  readonly undoTo: (groupId: string, options: { confirmed: true }) => Promise<{ ok: boolean }>;
}

export interface VoiceEnvironment {
  /** The speech engine for the next press (feature 015): read when the button is pressed. */
  readonly engine: SpeechEngine;
  readonly lang: string;
  readonly interpreter: Interpreter;
  readonly context: () => ResolveContext & VoiceSession;
  /** Feature 015: Whisper's vocabulary hint, built when a recording is sent. */
  readonly hint?: () => string;
  readonly effects: VoiceEffects;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
}

const YES = new Set(["si", "sí", "confirmar", "confirma", "confirmo", "vale", "ok", "dale"]);
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[¡!¿?.,]/g, "")
    .trim();

/** Feature 015, dev builds only (research R11): the last hold's audio, for "Guardar para eval". */
export interface CheckClip {
  readonly blob: Blob;
  readonly extension: string;
  readonly engine: "browser" | "whisper";
  readonly durationMs: number;
}

export class VoiceController {
  /** Dev builds only (constitution VII's exception); set by useVoice, read by SaveForEval. */
  lastClip: CheckClip | undefined;
  private state: VoicePhase = { phase: "idle" };
  private readonly listeners = new Set<() => void>();
  private capture: SpeechCaptureSession | undefined;
  /** The engine of the hold in progress, picked at press (feature 015). */
  private captureEngine: SpeechEngine | undefined;
  /** Bumped by every press and cancel: an outcome from an older hold is ignored. */
  private generation = 0;
  /** The hold in progress is being released (a `limit` and the pointer-up can both release). */
  private releasing = false;
  private cut = false;
  private releasedAt = 0;

  constructor(private readonly env: VoiceEnvironment) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): VoicePhase => this.state;

  private set(next: VoicePhase): void {
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** Mic button pressed. "listening" shows once the engine reports `started` (feature 015). */
  press(): void {
    const busy = this.state.phase === "listening" || this.state.phase === "transcribing" || this.state.phase === "interpreting";
    if (busy || this.capture) return;
    const pending = this.state.phase === "result" ? this.state : undefined;
    const engine = this.env.engine;
    const capture = engine.open({
      lang: this.env.lang,
      displayLang: this.env.context().lang ?? "es",
      hint: () => this.env.hint?.() ?? "",
    });
    this.generation += 1;
    if (import.meta.env.DEV) this.lastClip = undefined;
    this.capture = capture;
    this.captureEngine = engine;
    this.releasing = false;
    this.cut = false;
    this.pendingBeforeListen = pending;
    const started = capture.start((update) => {
      if (this.capture !== capture) return;
      if (update.kind === "started") this.set({ phase: "listening", interim: "" });
      else if (update.kind === "interim" && this.state.phase === "listening") this.set({ phase: "listening", interim: update.text });
      else if (update.kind === "level" && this.state.phase === "listening") this.set({ ...this.state, level: update.level });
      else if (update.kind === "limit") {
        this.cut = true;
        void this.release();
      }
      // The microphone failed before starting: show why at once (FR-017).
      else if (update.kind === "failed") void this.finish();
    });
    if (!started) {
      this.capture = undefined;
      this.captureEngine = undefined;
      this.pendingBeforeListen = undefined;
    }
  }

  private pendingBeforeListen: Extract<VoicePhase, { phase: "result" }> | undefined;

  /** Mic button released: the final transcript goes to the interpreter. */
  async release(): Promise<void> {
    const capture = this.capture;
    if (!capture || this.releasing) return;
    // Released before the engine was live (a tap, or the permission prompt still open): quietly.
    if (this.state.phase !== "listening") {
      const pending = this.pendingBeforeListen;
      this.dropCapture();
      capture.cancel();
      this.set(pending ?? { phase: "idle" });
      return;
    }
    // Feature 015 (analyze A2): measured from the release, so Whisper's transcription counts.
    this.releasedAt = this.env.now?.() ?? Date.now();
    await this.finish();
  }

  /** Collects the engine's outcome for the hold in progress, then the usual path (FR-011). */
  private async finish(): Promise<void> {
    const capture = this.capture;
    if (!capture || this.releasing) return;
    this.releasing = true;
    const generation = this.generation;
    const whisper = this.captureEngine?.id === "whisper";
    if (whisper && this.state.phase === "listening") this.set({ phase: "transcribing" });
    const outcome = await capture.stop();
    if (generation !== this.generation) return;
    const pending = this.pendingBeforeListen;
    const cut = this.cut;
    this.dropCapture();
    if (outcome.kind === "error") {
      this.set({ phase: "result", result: resolveError(outcome.error, "") });
      return;
    }
    if (outcome.kind === "empty") {
      // The browser engine behaves as before (no hint); Whisper says it heard nothing (FR-009).
      const hint = whisper && outcome.reason !== "cancelled" ? ({ hint: "empty" } as const) : {};
      this.set(pending ? { ...pending, ...hint } : { phase: "idle", ...hint });
      return;
    }
    const transcript = outcome.text;
    // "sí" / "confirmar" with a card on screen confirms it without a round trip (FR-062).
    if (pending && YES.has(normalize(transcript)) && pending.result.kind !== "notUnderstood") {
      this.set(pending);
      await this.confirm();
      return;
    }
    await this.interpret(transcript, undefined, pending);
    if (cut && this.state.phase === "result" && generation === this.generation) this.set({ ...this.state, hint: "cut" });
  }

  private dropCapture(): void {
    this.capture = undefined;
    this.captureEngine = undefined;
    this.pendingBeforeListen = undefined;
    this.releasing = false;
  }

  async interpret(transcript: string, clarification?: string, pending?: Extract<VoicePhase, { phase: "result" }>): Promise<void> {
    this.set({ phase: "interpreting", transcript });
    const ctx = this.env.context();
    let result: VoiceResult;
    try {
      const message = await this.env.interpreter(
        ctx,
        snapshotAndTranscript({ ...ctx, transcript, ...(clarification !== undefined ? { clarification } : {}) }),
      );
      result = resolveResponse(message, ctx, transcript);
    } catch (error) {
      result = resolveError(error, transcript);
    }
    if (result.kind === "confirm") {
      if (pending && pending.result.kind !== "notUnderstood") {
        this.set(pending);
        await this.confirm();
        return;
      }
      result = notUnderstood(transcript, message("voice.nothingToConfirm", {}));
    }
    // Undoing the newest entry needs no confirmation, as by touch (feature 010, US1-5).
    if (result.kind === "undo") {
      await this.env.effects.undoLast();
      this.set({ phase: "idle" });
      return;
    }
    this.env.log?.(`voz: ${(this.env.now?.() ?? Date.now()) - this.releasedAt} ms hasta la tarjeta`);
    this.set({ phase: "result", result, ...(clarification !== undefined ? { clarification } : {}) });
  }

  /** The user tapped a clarification option: resolve again with it (research R8). */
  async choose(option: { label: string; value: string }): Promise<void> {
    if (this.state.phase !== "result" || this.state.result.kind !== "clarification") return;
    await this.interpret(this.state.result.transcript, `${option.label} (${option.value})`);
  }

  /** Replace the proposal's action after an edit on the card; re-validated like any action. */
  edit(action: Action): void {
    if (this.state.phase !== "result" || this.state.result.kind !== "proposal") return;
    const ctx = this.env.context();
    const run = runPipeline(ctx, action);
    if (run.kind !== "ok") return;
    this.set({
      phase: "result",
      result: {
        ...this.state.result,
        actions: [run.action],
        action: run.action,
        events: run.events,
        warnings: run.warnings,
        flows: moneyFlows(run.events),
      },
    });
  }

  async confirm(): Promise<boolean> {
    if (this.state.phase !== "result") return false;
    const { result } = this.state;
    const { effects } = this.env;
    let ok: boolean;
    if (result.kind === "proposal") {
      ok = (await effects.dispatch(result.action, { source: "voice", transcript: result.transcript })).ok;
    } else if (result.kind === "undo") {
      ok = (await effects.undoLast()).ok;
    } else if (result.kind === "undoTo") {
      ok = (await effects.undoTo(result.groupId, { confirmed: true })).ok;
    } else {
      ok = true;
    }
    if (ok) this.set({ phase: "idle" });
    return ok;
  }

  /** Closes the card, or stops listening or transcribing (feature 015: aborts the upload). */
  cancel(): void {
    const capture = this.capture;
    this.generation += 1;
    this.dropCapture();
    capture?.cancel();
    this.set({ phase: "idle" });
  }
}
