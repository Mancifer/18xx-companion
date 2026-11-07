/**
 * Feature 014 (data-model §6): a built-in game's display text in one language, by the ids the
 * definition gives each element. Sessions keep a copy of their definition, so text is looked up
 * by id rather than read from that copy; a custom game has no pack and shows its own text.
 */
export interface GameTextPack {
  /** By option id: its label and, by choice value, the choice labels. */
  readonly options?: Readonly<Record<string, { readonly label: string; readonly choices?: Readonly<Record<string, string>> }>>;
  /** By revenue part id. */
  readonly revenueParts?: Readonly<Record<string, string>>;
  /** By payment id (company traits). */
  readonly payments?: Readonly<Record<string, string>>;
  /** By custom rule id, then by the text field of its config. */
  readonly rules?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Schedule notes, by slot ("OR3.1"). */
  readonly notes?: Readonly<Record<string, string>>;
  /** Phase display names, by phase id. */
  readonly phases?: Readonly<Record<string, string>>;
}

/** Every built-in game's pack in one language, by game id. */
export type GameTextPacks = Readonly<Record<string, GameTextPack>>;
