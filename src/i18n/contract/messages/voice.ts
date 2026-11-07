/**
 * Feature 014 (contracts/catalogs.md): the voice message codes and their params. Every language
 * implements each code; params hold raw ids, amounts and counts, never names or formatted money.
 */

type None = Record<string, never>;

export interface VoiceMessages {
  /** The model refused, ran out of tokens, or sent a broken call. */
  readonly "voice.refused": None;
  readonly "voice.truncated": None;
  readonly "voice.incomplete": None;
  readonly "voice.noOrder": None;
  readonly "voice.badQuestion": None;
  readonly "voice.badQuery": None;
  readonly "voice.notGame": None;
  /** "no, eran 260": the app no longer corrects entries (feature 010, FR-008). */
  readonly "voice.correctByUndo": None;
  readonly "voice.unknownEntity": None;
  readonly "voice.noEntry": None;
  readonly "voice.nothingToConfirm": None;
  readonly "voice.unexpected": None;
  /** A provider or SDK failure, by kind (auth, permission, model, rateLimit, timeout, connection, service). */
  readonly "voice.provider": { readonly kind: string };
  /** Why the mic is unavailable (FR-075). `provider` is the provider's short label. */
  readonly "voice.noSpeech": None;
  readonly "voice.offline": None;
  readonly "voice.noKey": { readonly provider: string };
}
