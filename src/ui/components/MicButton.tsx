import type { CSSProperties } from "react";
import type { VoiceAvailability } from "../../app/useVoice";
import type { VoiceHint, VoicePhase } from "../../app/voiceController";
import { useText } from "../../app/language";
import { message } from "../../i18n/contract/domain";
import { usePlainMessageText } from "../useMessage";

/** Feature 015: the brief hint line's message. */
export const hintMessage = (hint: VoiceHint) => message(hint === "cut" ? "voice.cut" : "voice.heardNothing", {});

/**
 * Hold to talk (FR-070, research R7): pointer down starts listening, release sends. Large and
 * thumb-reachable; when voice is unavailable it says why (FR-075). Feature 015: with Whisper, a
 * ring whose thickness follows the input level while listening (no live text), then
 * "Transcribiendo…" with Cancelar until the transcript arrives (FR-007).
 */
export function MicButton({
  phase,
  availability,
  onPress,
  onRelease,
  onCancel,
}: {
  phase: VoicePhase;
  availability: VoiceAvailability;
  onPress: () => void;
  onRelease: () => void;
  onCancel?: () => void;
}) {
  const t = useText().components.mic;
  const plainText = usePlainMessageText();
  const reason = availability.ok ? undefined : plainText(availability.reason);
  const listening = phase.phase === "listening";
  const transcribing = phase.phase === "transcribing";
  const busy = phase.phase === "interpreting" || transcribing;
  const level = listening ? phase.level : undefined;
  const style = level !== undefined ? ({ "--mic-level": level.toFixed(2) } as CSSProperties) : undefined;
  // Feature 016 (research R4): a disabled mic does no work on a tap (the Firefox for Android lag).
  const disabled = !availability.ok || busy;
  return (
    <div className="mic-area">
      {listening ? (
        <p className="mic-transcript" aria-live="polite">
          {phase.interim || t.listening}
        </p>
      ) : null}
      {transcribing ? (
        <div className="row mic-transcribing">
          <p className="mic-transcript" aria-live="polite">
            {t.transcribing}
          </p>
          <button className="mic-cancel" onClick={onCancel}>
            {t.cancel}
          </button>
        </div>
      ) : null}
      {phase.phase === "interpreting" ? (
        <p className="mic-transcript" aria-live="polite">
          «{phase.transcript}»{t.interpreting}
        </p>
      ) : null}
      {(phase.phase === "idle" || phase.phase === "result") && phase.hint ? (
        <p className="mic-hint" role="status">
          {plainText(hintMessage(phase.hint))}
        </p>
      ) : null}
      {reason !== undefined ? <p className="mic-reason muted">{reason}</p> : null}
      <button
        className={`mic-button${listening ? " listening" : ""}${level !== undefined ? " level" : ""}`}
        style={style}
        aria-label={listening ? t.release : t.hold}
        aria-pressed={listening}
        disabled={disabled}
        title={reason}
        onPointerDown={(e) => {
          if (disabled) return;
          // Keep the release on this button even if the finger slides off it.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Not every environment supports pointer capture.
          }
          onPress();
        }}
        onPointerUp={disabled ? undefined : onRelease}
        onPointerCancel={disabled ? undefined : onRelease}
        onContextMenu={(e) => e.preventDefault()}
      >
        🎤
      </button>
    </div>
  );
}
