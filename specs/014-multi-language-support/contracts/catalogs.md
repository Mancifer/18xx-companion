# Contract: Text Catalogs and Language Functions

Feature 014. The shapes that application code depends on. Signatures are given as TypeScript
types. Bodies are left to implementation.

Layout: one folder per language (`src/i18n/es/`, `src/i18n/en/`) plus shared contracts in
`src/i18n/contract/` ([research R2](../research.md#r2-where-the-catalogs-live)).

## Language module (`src/i18n/lang.ts`)

```ts
type Lang = "en" | "es";
const LANGUAGES: readonly { readonly id: Lang; readonly nativeName: string }[];
const DEFAULT_LANG: Lang; // "en"
function isLang(value: unknown): value is Lang;
/** First entry's primary subtag "es" → "es"; anything else, or an empty list → "en" (FR-002). */
function detectLanguage(preferred: readonly string[]): Lang;
/**
 * Languages voice is offered in (FR-014e, constitution 2.1.0). Read from the build setting
 * VITE_VOICE_LANGUAGES (comma-separated, e.g. "es,en"); unset or invalid → ["es"].
 * Unknown entries are dropped; "es" is always included.
 */
function voiceLanguages(): readonly Lang[];
function voiceEnabled(lang: Lang): boolean;
```

## Domain catalog (`src/i18n/contract/domain.ts`, `src/i18n/<lang>/domain.ts`, `src/i18n/<lang>/messages/*.ts`, `src/i18n/render.ts`)

```ts
interface DomainText {
  readonly lang: Lang;
  // Labels
  readonly status: Readonly<Record<CompanyStatus, string>>;
  readonly roundLabel: (turn: TurnLabelInput) => string;            // "OR 2.1", "Privates" / "Privadas"
  readonly cycleRoundLabel: (game: GameDefinition, turn: TurnLabelInput) => string | undefined;
  readonly roundTitle: (game: GameDefinition, turn: TurnLabelInput) => string;
  readonly holderName: (holder: HolderRef, game: GameDefinition, players: readonly Player[]) => string;
  readonly endTriggerLabels: Readonly<Record<EndTriggerType, string>>;
  readonly counterLabels: Readonly<Record<string, string>>;
  // Sentences built from actions and events (take a SummaryContext, may insert mention markers)
  readonly summary: (action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]) => string;
  readonly proposalSummary: (action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]) => string;
  readonly effects: (events: readonly PrimitiveEvent[], ctx: SummaryContext) => string[];
  readonly undone: (groups: readonly Summarized[], ctx: SummaryContext) => string;
  readonly movementLine: (m: Movement, ctx: SummaryContext) => string | undefined;
  readonly balanceLine: (b: BalanceChange, ctx: SummaryContext) => string;
  readonly exportInfo: (preview: ExportPreview) => string;
  // Fixed text groups moved from es.ts (INCOME_ES, UNDO_RANGE_ES, GAME_END_ES, …)
  readonly income: IncomeText;
  readonly undoRange: UndoRangeText;
  readonly gameEnd: GameEndText;
  // Messages (data-model §4): one entry per code
  readonly messages: { readonly [Code in MessageCode]: (params: MessageParams<Code>, ctx: MessageContext) => string };
  readonly systemNotes: Readonly<Record<SystemNoteKey, string>>;
}

const DOMAIN_TEXT: Readonly<Record<Lang, DomainText>>;
function domainText(lang: Lang): DomainText;

function formatMoney(amount: number, game: Pick<GameDefinition, "currency">, lang: Lang): string;
function renderMessage(message: Message, ctx: MessageContext, lang: Lang): string;
function renderWarning(warning: Warning, ctx: MessageContext, lang: Lang): string; // data-model §4 rule
function renderNote(text: string, game: GameDefinition, lang: Lang): string;      // data-model §5 rule
```

Rules:
- **The contract owns the codes.** `MessageCode` is a closed union, and `MessageParams<Code>` gives
  each code's param shape. Both are declared in `src/i18n/contract/messages/<area>.ts`, one map
  per area (`stock`, `operating`, `flow`, `mechanics`, `game`, `store`, `import`, `voice`) of
  `code → param type`, and combined in `contract/domain.ts`. A language implements every code of
  every area, and can't add or drop one: its area module is typed
  `{ [C in AreaCode]: (params: MessageParams<C>, ctx: MessageContext) => string }`.
- **Constructors**: domain code builds messages with typed constructors,
  `warning(ctx, code, params, severity?)` and `unavailable(code, params)`.
  - `warning()` also fills `messageEs` with `DOMAIN_TEXT.es.messages[code](params, ctx)`, so the
    stored warning keeps today's Spanish text (data-model §4).
  - `ctx` comes first because every call site already has an `ActionContext`.
  - `unavailable()` needs no context, because it stores nothing.
- **Spanish output is byte-identical**: for every input the current `es.ts` handles, `DOMAIN_TEXT.es`
  returns exactly the same string. The existing `summaries.test.ts`, `snapshots.test.ts` and
  `mentions.test.ts` cases are the proof. They are kept and pinned to `"es"`.
- **Mention markers**: when `ctx.marks` is set, both languages insert markers around company
  mentions in the same places, keeping feature 013's plain/marked equivalence property in both.
- **Pure functions**: catalog functions take no hidden state and read no globals.

## Game text (`src/i18n/contract/games.ts`, `src/i18n/<lang>/games/*.ts`, `src/i18n/gameText.ts`)

```ts
interface GameText {
  readonly option: (optionId: string) => string;
  readonly choice: (optionId: string, value: string) => string;
  readonly revenuePart: (partId: string) => string;
  readonly payment: (paymentId: string) => string;
  readonly ruleText: (ruleId: string, field: string) => string;
  readonly note: (slot: string) => string | undefined;
}
function gameText(game: GameDefinition, lang: Lang): GameText;
```

- Order of preference: the pack in `lang`, then the pack in `en`, then the definition's own
  string (data-model §6).
- Custom games always get their own strings.

## UI catalog (`src/i18n/contract/ui.ts`, `src/i18n/<lang>/ui/*.ts`)

```ts
interface UiText {
  readonly common: { readonly confirm: string; readonly edit: string; readonly cancel: string; readonly close: string; /* … */ };
  readonly home: { /* … */ };
  readonly newSession: { /* … */ };
  readonly table: { /* … */ };
  readonly history: { /* … */ };
  readonly market: { /* … */ };
  readonly results: { /* … */ };
  readonly settings: {
    readonly language: string;              // section label
    readonly voiceRegion: string;
    readonly regions: Readonly<Record<string, string>>; // BCP 47 tag → region name, in this language
    /* … */
  };
  readonly sheets: { /* one group per sheet */ };
  readonly components: { /* one group per component */ };
}
const UI_TEXT: Readonly<Record<Lang, UiText>>;
```

- Groups follow the file layout under `src/ui/`, so each component reads one group. Each group is
  its own file in `src/i18n/<lang>/ui/`.
- Every `aria-label`, `placeholder`, `title` and visually hidden text is in the catalog, with
  nothing left in JSX.
- **Spanish text is unchanged**: the existing UI tests, pinned to Spanish, find every element by
  the same text and role names as today.

## React hooks (`src/app/language.tsx`)

```ts
interface LanguageValue { readonly lang: Lang; readonly setLang: (next: Lang) => Promise<void> }
function LanguageProvider(props: { initial: Lang; children: ReactNode }): JSX.Element;
function useLang(): LanguageValue;
function useText(): UiText;            // UI_TEXT[lang]
function useDomainText(): DomainText;  // DOMAIN_TEXT[lang]
```

- `AppProvider` computes `initial` from the saved settings and `detectLanguage` before its first
  render.
- `setLang` follows data-model §3.

## Voice catalog (`src/i18n/contract/voice.ts`, `src/i18n/<lang>/voice.ts`)

```ts
interface VoiceText {
  readonly systemPrompt: (session: VoiceSession) => string;
  readonly toolDescriptions: Readonly<Record<string, { readonly description: string; readonly params: Readonly<Record<string, string>> }>>;
  readonly snapshot: SnapshotText;   // line templates used by snapshotAndTranscript
  readonly queryAnswer: (answer: QueryAnswer, ctx: MessageContext) => string;
  readonly providerError: Readonly<Record<ProviderErrorKind, string>>;
  readonly notUnderstood: string;    // "No entendí" / "I didn't understand"
  readonly noKey: string;
}
const VOICE_TEXT: Readonly<Record<Lang, VoiceText>>;
```

- `systemPrompt`, `buildToolSpecs` and `snapshotAndTranscript` read `session.lang`.
- Tool names, parameter names, JSON schema types and enum values are the same in both languages
  (FR-014b). Only descriptions differ.
- **The Spanish prompt is byte-identical to today's**: `systemPrompt` with `lang: "es"` and the
  Spanish tool specs must match the current snapshots in `tests/voice/__snapshots__`.
