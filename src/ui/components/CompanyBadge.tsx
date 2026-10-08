import type { CompanyDef } from "../../domain/games/schema";

/** A company's short name over its color: color is never the only cue (FR-101). */
export function CompanyBadge({ company, size = "md" }: { company: CompanyDef; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`company-badge company-badge-${size}`}
      style={{ background: company.color, color: company.textColor }}
      title={company.name}
    >
      {company.shortName}
    </span>
  );
}
