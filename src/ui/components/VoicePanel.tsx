import { useContext } from "react";
import { useServices } from "../../app/AppProvider";
import { SETTINGS_CHANGED, VoiceDepsContext } from "../../app/useVoice";
import { useSession } from "../../app/useSession";
import { speechAvailable } from "../../voice/speech";
import { APP_VERSION } from "../../app/version";
import type { VoiceController, VoicePhase } from "../../app/voiceController";
import type { Action } from "../../domain/actions/schemas";
import { buildExport } from "../../persistence/exportImport";
import { downloadBlob, downloadJson } from "../useExport";
import { ClarifyButtons } from "./ClarifyButtons";
import { ConfirmationCard } from "./ConfirmationCard";
import { UndoRangeSheet } from "./UndoRangeSheet";
import { useLang, useText } from "../../app/language";
import { useMessageText } from "../useMessage";

/**
 * Dev only (T137, research R18): saves the recognizer's transcript, a fixture of the session and
 * the confirmed (or to-be-entered) action as a candidate eval case. Feature 015 (research R11):
 * with "Grabar clips de control" on, it also saves the hold's audio as `candidate-<stamp>.<ext>`
 * for the audio check set (constitution VII's dev exception).
 */
function SaveForEval({ transcript, action, controller }: { transcript: string; action: Action | null; controller: VoiceController }) {
  const { sessions } = useServices();
  const { meta } = useSession();
  const { lang } = useLang();
  const t = useText().components.voicePanel;
  if (!import.meta.env.DEV) return null;
  return (
    <button
      onClick={() =>
        void buildExport(sessions, meta.id, { appVersion: APP_VERSION }).then((fixture) => {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const clip = controller.lastClip;
          const audio = clip ? `candidate-${stamp}.${clip.extension}` : undefined;
          if (clip && audio) downloadBlob(audio, clip.blob);
          downloadJson(`candidate-${stamp}.json`, {
            transcript,
            expect: action,
            fixture,
            savedAt: new Date().toISOString(),
            ...(clip && audio ? { audio, engine: clip.engine, lang, durationMs: clip.durationMs } : {}),
          });
        })
      }
    >
      {t.saveForEval}
    </button>
  );
}

/**
 * Feature 015 (FR-016): after a Groq failure, where the browser recognizes speech itself, turn
 * Whisper off in one tap. A setting change only: nothing is dispatched, so no history entry.
 */
function UseBrowserRecognition({ controller }: { controller: VoiceController }) {
  const { settings } = useServices();
  const deps = useContext(VoiceDepsContext);
  const t = useText().components.voicePanel;
  if (!speechAvailable(deps.recognizer)) return null;
  return (
    <button
      onClick={() =>
        void settings.set({ whisper: false }).then(() => {
          window.dispatchEvent(new Event(SETTINGS_CHANGED));
          controller.cancel();
        })
      }
    >
      {t.useBrowser}
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
  const text = useText();
  const t = text.components.voicePanel;
  const { lang } = useLang();
  const reasonText = useMessageText();
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
          extra={<SaveForEval transcript={result.transcript} action={result.action} controller={controller} />}
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
        <section className="voice-card" role="dialog" aria-label={t.answer}>
          <p className="muted transcript">«{result.transcript}»</p>
          <p className="voice-summary">{result.answer.text[lang]}</p>
          <button className="primary" onClick={cancel}>
            {t.ok}
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
        <section className="voice-card" role="dialog" aria-label={t.notUnderstood}>
          <p className="voice-summary">{t.notUnderstood}</p>
          {/* Feature 015: a speech-to-text failure has no transcript to show. */}
          {result.transcript ? <p className="transcript">«{result.transcript}»</p> : null}
          <p className="muted">{reasonText(result.reason)}</p>
          <div className="row">
            <button onClick={cancel}>{text.common.close}</button>
            <SaveForEval transcript={result.transcript} action={null} controller={controller} />
            {result.reason.code === "voice.transcription" ? <UseBrowserRecognition controller={controller} /> : null}
            <span className="spacer" />
            <button
              className="primary"
              onClick={() => {
                cancel();
                onManual(result.hint);
              }}
            >
              {t.manual}
            </button>
          </div>
        </section>
      );
  }
}
