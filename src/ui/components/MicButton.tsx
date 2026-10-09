import type { VoiceAvailability } from "../../app/useVoice";
import type { VoicePhase } from "../../app/voiceController";

/**
 * Hold to talk (FR-070, research R7): pointer down starts listening, release sends. Large and
 * thumb-reachable; when voice is unavailable it says why (FR-075).
 */
export function MicButton({
  phase,
  availability,
  onPress,
  onRelease,
}: {
  phase: VoicePhase;
  availability: VoiceAvailability;
  onPress: () => void;
  onRelease: () => void;
}) {
  const listening = phase.phase === "listening";
  const busy = phase.phase === "interpreting";
  return (
    <div className="mic-area">
      {listening ? (
        <p className="mic-transcript" aria-live="polite">
          {phase.interim || "Escuchando…"}
        </p>
      ) : null}
      {busy ? (
        <p className="mic-transcript" aria-live="polite">
          «{phase.transcript}» · interpretando…
        </p>
      ) : null}
      {!availability.ok ? <p className="mic-reason muted">{availability.reasonEs}</p> : null}
      <button
        className={`mic-button${listening ? " listening" : ""}`}
        aria-label={listening ? "Suelta para enviar" : "Mantén pulsado para hablar"}
        aria-pressed={listening}
        disabled={!availability.ok || busy}
        title={availability.ok ? undefined : availability.reasonEs}
        onPointerDown={(e) => {
          // Keep the release on this button even if the finger slides off it.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Not every environment supports pointer capture.
          }
          onPress();
        }}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
        onContextMenu={(e) => e.preventDefault()}
      >
        🎤
      </button>
    </div>
  );
}
