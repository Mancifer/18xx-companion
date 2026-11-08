import { useContext, useEffect, useRef, useState } from "react";
import { useServices } from "../../app/AppProvider";
import { useLang, useText } from "../../app/language";
import { useHasSession } from "../../app/useSession";
import { SETTINGS_CHANGED } from "../../app/useVoice";
import { LANGUAGES, voiceEnabled, whisperOffered, type Lang } from "../../i18n/lang";
import type { Settings as StoredSettings } from "../../persistence/settingsRepo";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../../voice/providers";
import { useNav } from "../nav";
import { VoiceDepsContext, voiceAvailability } from "../../app/useVoice";
import { canRecordAlongsideRecognizer } from "../../voice/engine";
import { pickMimeType } from "../../voice/recorder";
import { usePlainMessageText } from "../useMessage";

interface Draft {
  provider: ProviderId;
  /** Every provider's key and model: switching the control swaps the visible pair (US3). */
  apiKeys: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
  rememberKey: boolean;
  /** The speech region of the display language (feature 014, FR-014a). */
  voiceLocale: string;
  /** Feature 015: the Whisper toggle and the Groq key, independent of each other (FR-003). */
  whisper: boolean;
  groqKey: string;
  /** Dev builds only (research R11): save each hold's audio for the audio check set. */
  checkClips: boolean;
}

/** Feature 015: the shape of a Groq key, like the providers' keyPlaceholder (not translated). */
const GROQ_KEY_PLACEHOLDER = "gsk_…";

const perProvider = (value: (id: ProviderId) => string) =>
  Object.fromEntries(PROVIDER_IDS.map((id) => [id, value(id)])) as Record<ProviderId, string>;

const draftOf = (s: StoredSettings, lang: Lang): Draft => ({
  provider: s.provider,
  apiKeys: perProvider((id) => s.apiKeys[id] ?? ""),
  models: perProvider((id) => s.models[id]),
  rememberKey: s.rememberKey,
  voiceLocale: s.voiceLocales[lang],
  whisper: s.whisper,
  groqKey: s.groqKey ?? "",
  checkClips: s.checkClips,
});

/**
 * The display language (feature 014, contracts/ui.md), then the provider, per-provider key and
 * model and the voice region (FR-076; feature 005), with the privacy notes. The language applies
 * at once and saves on its own; the provider section keeps its draft until "Guardar".
 */
export function Settings() {
  const { settings } = useServices();
  const { go } = useNav();
  const hasSession = useHasSession();
  const text = useText();
  const t = text.settings;
  const { lang, setLang } = useLang();
  const [draft, setDraft] = useState<Draft | null>(null);
  const regionLang = useRef<Lang>(lang);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const voiceDeps = useContext(VoiceDepsContext);
  const plainText = usePlainMessageText();

  useEffect(() => {
    void settings.get().then((s) => setDraft(draftOf(s, lang)));
    // Loaded once: a language switch must not reset the unsaved fields (FR-003).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // A language switch shows that language's saved region; the key and model drafts stay.
  useEffect(() => {
    if (regionLang.current === lang) return;
    regionLang.current = lang;
    void settings.get().then((s) => setDraft((d) => (d ? { ...d, voiceLocale: s.voiceLocales[lang] } : d)));
  }, [lang, settings]);

  const edit = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  /** One set() with the provider, every key and every model, then the voice layer reloads. */
  const save = async () => {
    if (!draft) return;
    const next = await settings.set({
      provider: draft.provider,
      rememberKey: draft.rememberKey,
      apiKeys: draft.apiKeys,
      voiceLocales: { [lang]: draft.voiceLocale },
      models: draft.models,
      // Feature 015: the toggle and the key are saved side by side; neither changes the other.
      whisper: draft.whisper,
      groqKey: draft.groqKey,
      ...(import.meta.env.DEV ? { checkClips: draft.checkClips } : {}),
    });
    setDraft(draftOf(next, lang));
    setSaved(true);
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  };

  /**
   * The engine choice (browser or Whisper) saves at once, like the language: Guardar is far below
   * it on a phone, and a lost change keeps sending audio to Groq. Only the choice is saved; the
   * other drafts wait (FR-003).
   */
  const saveWhisper = async (whisper: boolean) => {
    setDraft((d) => (d ? { ...d, whisper } : d));
    await settings.set({ whisper });
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  };

  const provider = PROVIDERS[draft?.provider ?? "anthropic"];
  // Feature 015 (contracts/ui.md §1): the engine choice only where Whisper is offered; Whisper disabled where
  // the browser can't record. The reason line follows the draft, so it updates as the user edits.
  const offered = whisperOffered(lang);
  const media = voiceDeps.media?.();
  const canRecord = voiceDeps.transcriber !== undefined && media !== undefined && pickMimeType(media.MediaRecorder) !== undefined;
  const whisperOn = offered && draft?.whisper === true;
  const availability = draft
    ? voiceAvailability(
        voiceDeps,
        {
          provider: draft.provider,
          apiKeys: Object.fromEntries(Object.entries(draft.apiKeys).filter(([, k]) => k.trim() !== "")),
          models: draft.models,
          rememberKey: draft.rememberKey,
          voiceLocales: { en: "en-US", es: "es-ES", [lang]: draft.voiceLocale },
          whisper: draft.whisper,
          ...(draft.groqKey.trim() ? { groqKey: draft.groqKey.trim() } : {}),
          checkClips: false,
        },
        lang,
      )
    : undefined;
  const regions = Object.entries(t.regions).map(([id, label]) => ({ id, label }));
  const locales =
    draft && !regions.some((l) => l.id === draft.voiceLocale) ? [...regions, { id: draft.voiceLocale, label: draft.voiceLocale }] : regions;

  /**
   * Feature 016: the Groq key, where to get one and the billing note, as one block after the
   * region. Shown whichever engine is chosen, and where Whisper isn't offered (015 FR-003).
   */
  const groqKey = draft ? (
    <div className="settings-field">
      <label htmlFor="settings-groq-key">{t.whisper.key}</label>
      <input
        id="settings-groq-key"
        type={showKey ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        placeholder={GROQ_KEY_PLACEHOLDER}
        value={draft.groqKey}
        onChange={(e) => edit({ groqKey: e.target.value })}
      />
      <p className="muted">
        <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
          {t.whisper.getKey}
        </a>
      </p>
      {offered ? <p className="muted">{t.whisper.billing}</p> : null}
    </div>
  ) : null;
  const notes = t.notes[provider.id];

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label={text.common.back} onClick={() => go({ name: hasSession ? "table" : "home" })}>
          ←
        </button>
        <h1 className="topbar-center">{t.title}</h1>
      </header>
      {draft ? (
        <>
          <div className="screen-body settings-body">
            <section className="stack" aria-labelledby="settings-group-language">
              <h2 id="settings-group-language">{t.groups.language}</h2>
              <div className="row segmented" role="radiogroup" aria-label={t.language}>
                {LANGUAGES.map((l) => (
                  <button key={l.id} role="radio" lang={l.id} aria-checked={lang === l.id} onClick={() => void setLang(l.id)}>
                    {l.nativeName}
                  </button>
                ))}
              </div>
            </section>

            <section className="stack" aria-labelledby="settings-group-ai">
              <h2 id="settings-group-ai">{t.groups.ai}</h2>
              <span className="label" id="settings-provider">
                {t.provider}
              </span>
              <div className="row segmented" role="radiogroup" aria-labelledby="settings-provider">
                {PROVIDER_IDS.map((id) => (
                  <button key={id} role="radio" aria-checked={draft.provider === id} onClick={() => edit({ provider: id })}>
                    {PROVIDERS[id].label}
                  </button>
                ))}
              </div>
              {notes.limits ? <p className="muted">{notes.limits}</p> : null}
              <label htmlFor="settings-key">{t.keyOf(provider.shortLabel)}</label>
              <div className="row">
                <input
                  id="settings-key"
                  className="spacer"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={provider.keyPlaceholder}
                  value={draft.apiKeys[draft.provider]}
                  onChange={(e) => edit({ apiKeys: { ...draft.apiKeys, [draft.provider]: e.target.value } })}
                />
                <button onClick={() => setShowKey((v) => !v)}>{showKey ? t.hide : t.show}</button>
              </div>
              <p className="muted">{t.keyHelp[provider.id]}</p>
              <label>
                {t.model}
                <input
                  spellCheck={false}
                  placeholder={provider.defaultModel}
                  value={draft.models[draft.provider]}
                  onChange={(e) => edit({ models: { ...draft.models, [draft.provider]: e.target.value } })}
                />
              </label>
            </section>

            <section className="stack" aria-labelledby="settings-group-speech">
              <h2 id="settings-group-speech">{t.groups.speech}</h2>
              {availability && !availability.ok && voiceEnabled(lang) ? (
                <p className="muted settings-group-status" role="status">
                  {plainText(availability.reason)}
                </p>
              ) : null}
              {offered ? (
                // Feature 016: the engine is a choice of two, saved at once like the language.
                <>
                  <span className="label" id="settings-engine">
                    {t.whisper.engine}
                  </span>
                  <div className="row segmented" role="radiogroup" aria-labelledby="settings-engine">
                    <button role="radio" aria-checked={!draft.whisper} onClick={() => void saveWhisper(false)}>
                      {t.whisper.engineBrowser}
                    </button>
                    <button role="radio" aria-checked={draft.whisper} disabled={!canRecord} onClick={() => void saveWhisper(true)}>
                      {t.whisper.engineWhisper}
                    </button>
                  </div>
                  {canRecord ? (
                    <p className="muted">{t.whisper.help}</p>
                  ) : (
                    <p className="muted" role="note">
                      {t.whisper.unsupported}
                    </p>
                  )}
                </>
              ) : null}
              {voiceEnabled(lang) ? (
                <label>
                  {t.region}
                  <select value={draft.voiceLocale} onChange={(e) => edit({ voiceLocale: e.target.value })}>
                    {locales.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label} ({l.id})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="muted" role="note">
                  {t.voiceUnavailable}
                </p>
              )}
              {/* The Groq key stays editable whichever engine is chosen (015 FR-003). */}
              {groqKey}
            </section>

            <section className="stack" aria-labelledby="settings-group-privacy">
              <h2 id="settings-group-privacy">{t.groups.privacy}</h2>
              <p className="muted">{whisperOn ? t.audioWhisper : t.audio}</p>
              <p className="muted">
                {t.sent[0]}
                <strong>{provider.label}</strong>
                {t.sent[1]}
              </p>
              {notes.data ? <p className="muted">{notes.data}</p> : null}
              <label className="checkbox">
                <input type="checkbox" checked={!draft.rememberKey} onChange={(e) => edit({ rememberKey: !e.target.checked })} />
                {t.noRemember}
              </label>
            </section>

            {import.meta.env.DEV && voiceEnabled(lang) ? (
              <section className="stack" aria-labelledby="settings-group-dev">
                <h2 id="settings-group-dev">{t.groups.dev}</h2>
                <label className="checkbox">
                  <input type="checkbox" checked={draft.checkClips} onChange={(e) => edit({ checkClips: e.target.checked })} />
                  {t.whisper.checkClips}
                </label>
                {!canRecordAlongsideRecognizer() ? (
                  <p className="muted" role="note">
                    {t.whisper.checkClipsAndroid}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
          {/* Feature 016 (US5): always in reach. Language and the engine choice still save at once. */}
          <div className="settings-footer row">
            <button className="primary" onClick={() => void save()}>
              {text.common.save}
            </button>
            {saved ? (
              <span className="muted" role="status">
                {t.saved}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
