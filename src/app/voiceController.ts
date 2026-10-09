import type { Action } from "../domain/actions/schemas";
import { runPipeline } from "../domain/actions/pipeline";
import { summaryEs } from "../domain/i18n/es";
import { bankFlows } from "../domain/ledger/flows";
import type { Interpreter } from "../voice/interpreter";
import { resolveError, resolveResponse, type ResolveContext, type VoiceResult } from "../voice/resolve";
import { snapshotAndTranscript } from "../voice/snapshot";
import { SpeechCapture, type RecognizerFactory } from "../voice/speech";
import type { VoiceSession } from "../voice/tools";

/**
 * Push-to-talk → interpret → card (FR-060–FR-075). Nothing changes until the user confirms; an
 * unconfirmed proposal lives only in memory and is gone after a reload.
 */

export type VoicePhase =
  | { readonly phase: "idle" }
  | { readonly phase: "listening"; readonly interim: string }
  | { readonly phase: "interpreting"; readonly transcript: string }
  | { readonly phase: "result"; readonly result: VoiceResult; readonly clarification?: string };

export interface VoiceEffects {
  readonly dispatch: (action: unknown, options: { source: "voice"; transcript: string }) => Promise<{ ok: boolean }>;
  readonly revert: () => Promise<{ ok: boolean }>;
  readonly amend: (groupId: string, action: unknown) => Promise<{ ok: boolean }>;
}

export interface VoiceEnvironment {
  readonly recognizer: RecognizerFactory;
  readonly lang: string;
  readonly interpreter: Interpreter;
  readonly context: () => ResolveContext & VoiceSession;
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

export class VoiceController {
  private state: VoicePhase = { phase: "idle" };
  private readonly listeners = new Set<() => void>();
  private capture: SpeechCapture | undefined;
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

  /** Mic button pressed. */
  press(): void {
    if (this.state.phase === "listening" || this.state.phase === "interpreting") return;
    const pending = this.state.phase === "result" ? this.state : undefined;
    this.capture = new SpeechCapture(this.env.recognizer, this.env.lang);
    const started = this.capture.start((interim) => {
      if (this.state.phase === "listening") this.set({ phase: "listening", interim });
    });
    if (!started) return;
    this.pendingBeforeListen = pending;
    this.set({ phase: "listening", interim: "" });
  }

  private pendingBeforeListen: Extract<VoicePhase, { phase: "result" }> | undefined;

  /** Mic button released: the final transcript goes to the interpreter. */
  async release(): Promise<void> {
    if (this.state.phase !== "listening" || !this.capture) return;
    const transcript = await this.capture.stop();
    this.releasedAt = this.env.now?.() ?? Date.now();
    const pending = this.pendingBeforeListen;
    this.pendingBeforeListen = undefined;
    if (!transcript) {
      this.set(pending ?? { phase: "idle" });
      return;
    }
    // "sí" / "confirmar" with a card on screen confirms it without a round trip (FR-062).
    if (pending && YES.has(normalize(transcript)) && pending.result.kind !== "notUnderstood") {
      this.set(pending);
      await this.confirm();
      return;
    }
    await this.interpret(transcript, undefined, pending);
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
      result = { kind: "notUnderstood", transcript, reasonEs: "No hay nada que confirmar." };
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
        summaryEs: summaryEs(run.action, ctx, run.events),
        flows: bankFlows(run.events),
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
      ok = (await effects.revert()).ok;
    } else if (result.kind === "amend") {
      ok = (await effects.amend(result.groupId, result.action)).ok;
    } else {
      ok = true;
    }
    if (ok) this.set({ phase: "idle" });
    return ok;
  }

  cancel(): void {
    this.capture?.cancel();
    this.pendingBeforeListen = undefined;
    this.set({ phase: "idle" });
  }
}
