import type { CompanyDef, GameDefinition } from "../../domain/games/schema";
import { holderName } from "../../domain/i18n/es";
import { parseHolder, type HolderRef, type Player } from "../../domain/types";

/**
 * A company's short name over its color: color is never the only cue (FR-101). `name` overrides
 * the full name in the tooltip (a major merged into its second identity). `label` replaces the
 * short name where a sentence names the company in full; `inline` sizes it to running text
 * (feature 013).
 */
export function CompanyBadge({
  company,
  size = "md",
  name,
  label,
}: {
  company: CompanyDef;
  size?: "inline" | "sm" | "md" | "lg";
  name?: string;
  label?: string;
}) {
  return (
    <span
      className={`company-badge company-badge-${size}`}
      style={{ background: company.color, color: company.textColor }}
      title={name ?? company.name}
    >
      {label ?? company.shortName}
    </span>
  );
}

/** A company named by id inside running text: its badge, or the bare id if the game doesn't know it. */
export function CompanyName({ game, id, size = "inline" }: { game: GameDefinition; id: string; size?: "inline" | "sm" }) {
  const company = game.companies.find((c) => c.id === id);
  return company ? <CompanyBadge company={company} size={size} /> : <>{id}</>;
}

/** `holderName` with a company (or its IPO) shown as its badge; the words are the same. */
export function HolderName({ holder, game, players }: { holder: HolderRef; game: GameDefinition; players: readonly Player[] }) {
  const h = parseHolder(holder);
  if (h.kind === "company") return <CompanyName game={game} id={h.id} />;
  if (h.kind === "ipo") {
    return (
      <>
        la IPO de <CompanyName game={game} id={h.id} />
      </>
    );
  }
  return <>{holderName(holder, game, players)}</>;
}
