import type { CompanyDef } from "../../domain/games/schema";

/**
 * A company's short name over its color: color is never the only cue (FR-101). `name` overrides
 * the full name in the tooltip (a major merged into its second identity).
 */
export function CompanyBadge({ company, size = "md", name }: { company: CompanyDef; size?: "sm" | "md" | "lg"; name?: string }) {
  return (
    <span
      className={`company-badge company-badge-${size}`}
      style={{ background: company.color, color: company.textColor }}
      title={name ?? company.name}
    >
      {company.shortName}
    </span>
  );
}
