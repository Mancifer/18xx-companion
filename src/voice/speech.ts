/**
 * Web Speech push-to-talk (research R7): `interimResults` and `continuous` while the button is
 * held; release stops and resolves with the final transcript.
 */

export interface SpeechResultLike {
  readonly length: number;
  readonly [index: number]: { readonly transcript: string } | undefined;
}

export interface SpeechEventLike {
  readonly results: { readonly length: number; readonly [index: number]: SpeechResultLike | undefined };
}

export interface RecognizerLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognizerFactory = () => RecognizerLike | undefined;

type RecognizerCtor = new () => RecognizerLike;

/** The browser's recognizer (`SpeechRecognition` or `webkitSpeechRecognition`), if any. */
export const browserRecognizer: RecognizerFactory = () => {
  const w = globalThis as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : undefined;
};

export function speechAvailable(factory: RecognizerFactory): boolean {
  const w = globalThis as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return factory === browserRecognizer ? Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition) : true;
}

function textOf(event: SpeechEventLike): string {
  let text = "";
  for (let i = 0; i < event.results.length; i++) text += event.results[i]?.[0]?.transcript ?? "";
  return text.trim();
}

/** One hold of the mic button. */
export class SpeechCapture {
  private recognizer: RecognizerLike | undefined;
  private text = "";
  private ended: Promise<string> | undefined;

  constructor(
    private readonly factory: RecognizerFactory,
    private readonly lang: string,
  ) {}

  /** Starts listening; `onInterim` receives the live transcript. False when unavailable. */
  start(onInterim: (text: string) => void): boolean {
    const r = this.factory();
    if (!r) return false;
    this.recognizer = r;
    this.text = "";
    r.lang = this.lang;
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (event) => {
      this.text = textOf(event);
      onInterim(this.text);
    };
    this.ended = new Promise<string>((resolve) => {
      r.onend = () => resolve(this.text);
      r.onerror = () => resolve(this.text);
    });
    r.start();
    return true;
  }

  /** Stops and resolves with the final transcript. */
  stop(): Promise<string> {
    if (!this.recognizer || !this.ended) return Promise.resolve("");
    this.recognizer.stop();
    return this.ended;
  }

  cancel(): void {
    this.recognizer?.abort();
  }
}
