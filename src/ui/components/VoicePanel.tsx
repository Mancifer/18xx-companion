import { useServices } from "../../app/AppProvider";
import { useSession } from "../../app/useSession";
import { APP_VERSION } from "../../app/version";
import type { VoiceController, VoicePhase } from "../../app/voiceController";
import type { Action } from "../../domain/actions/schemas";
import { buildExport } from "../../persistence/exportImport";
import { downloadJson } from "../useExport";
import { ClarifyButtons } from "./ClarifyButtons";
import { ConfirmationCard } from "./ConfirmationCard";
import { UndoRangeSheet } from "./UndoRangeSheet";

/**
 * Dev only (T137, research R18): saves the recognizer's transcript, a fixture of the session and
 * the confirmed (or to-be-entered) action as a candidate eval case.
 */
function SaveForEval({ transcript, action }: { transcript: string; action: Action | null }) {
  const { sessions } = useServices();
  const { meta } = useSession();
  if (!import.meta.env.DEV) return null;
  return (
    <button
      onClick={() =>
        void buildExport(sessions, meta.id, { appVersion: APP_VERSION }).then((fixture) => {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          downloadJson(`candidate-${stamp}.json`, { transcript, expect: action, fixture, savedAt: new Date().toISOString() });
        })
      }
    >
      Guardar para eval
    </button>
  );
}

/** The card for whatever voice came back with (FR-060, FR-062, FR-073, FR-074, FR-075). */
export function VoicePanel({
  controller,
  phase,
  onManual,
}: {
  controller: VoiceController;
  phase: VoicePhase;
  onManual: (hint: string | undefined) => void;
}) {
  const { meta } = useSession();
  if (phase.phase !== "result") return null;
  const { result } = phase;
  const cancel = () => controller.cancel();

  switch (result.kind) {
    case "proposal":
      return (
        <ConfirmationCard
          proposal={result}
          onConfirm={() => void controller.confirm()}
          onCancel={cancel}
          onEdit={(a) => controller.edit(a)}
          extra={<SaveForEval transcript={result.transcript} action={result.action} />}
        />
      );
    case "clarification":
      return (
        <ClarifyButtons
          question={result.question}
          options={result.options}
          onChoose={(o) => void controller.choose(o)}
          onCancel={cancel}
        />
      );
    case "query":
      return (
        <section className="voice-card" role="dialog" aria-label="Respuesta">
          <p className="muted transcript">«{result.transcript}»</p>
          <p className="voice-summary">{result.answer.textEs}</p>
          <button className="primary" onClick={cancel}>
            Vale
          </button>
        </section>
      );
    case "undoTo":
      // Only "Deshacer N" undoes; closing the sheet any other way changes nothing (FR-005).
      return (
        <UndoRangeSheet
          range={result.range}
          ctx={{ game: meta.game, players: meta.players }}
          transcript={result.transcript}
          onConfirm={() => controller.confirm()}
          onClose={cancel}
        />
      );
    case "undo":
    case "confirm":
      return null;
    case "notUnderstood":
      return (
        <section className="voice-card" role="dialog" aria-label="No entendí">
          <p className="voice-summary">No entendí</p>
          <p className="transcript">«{result.transcript}»</p>
          <p className="muted">{result.reasonEs}</p>
          <div className="row">
            <button onClick={cancel}>Cerrar</button>
            <SaveForEval transcript={result.transcript} action={null} />
            <span className="spacer" />
            <button
              className="primary"
              onClick={() => {
                cancel();
                onManual(result.hint);
              }}
            >
              Hacerlo a mano
            </button>
          </div>
        </section>
      );
  }
}
