import type { CertificateStatus } from "../../domain/actions/limits";
import type { CompanyDef } from "../../domain/games/schema";
import type { CompanyId } from "../../domain/types";
import { useText } from "../../app/language";

export interface DonutArc {
  readonly company: CompanyId;
  readonly length: number;
  readonly exempt: boolean;
}

/**
 * Feature 016 (US7, FR-029/FR-030): the donut's arcs in certificates. The ring is the limit, or
 * the player's total when there is no limit or the total doesn't fit in it. Counted arcs come
 * first, in row order; the exempt ones follow.
 */
export function donutArcs(status: CertificateStatus): { scale: number; arcs: DonutArc[] } {
  const arc = (counts: boolean) =>
    status.rows.filter((r) => r.counts === counts).map((r) => ({ company: r.company, length: r.certificates, exempt: !counts }));
  return { scale: Math.max(status.limit ?? 0, status.total), arcs: [...arc(true), ...arc(false)] };
}

/** Circumference 100, so arc lengths are percentages of the ring. */
const R = 15.9155;
const GAP = 1;

/**
 * The certificate donut (contracts/ui.md §6): one arc per company in its color, an empty track for
 * the room left under the limit, and the counted total in the middle. One accessible name; the
 * drawing itself is decorative (FR-033).
 */
export function CertDonut({ status, companies }: { status: CertificateStatus; companies: readonly CompanyDef[] }) {
  const t = useText().table.playerTile;
  const { scale, arcs } = donutArcs(status);
  const gap = arcs.length > 1 ? GAP : 0;
  let start = 0;
  const level = status.level === "under" ? "" : ` ${status.level}`;
  return (
    <svg className={`cert-donut${level}`} viewBox="0 0 36 36" role="img" aria-label={t.certLabel(status.counted, status.limit, status.level)}>
      <g aria-hidden="true">
        <circle className="cert-donut-track" cx="18" cy="18" r={R} />
        {scale > 0
          ? arcs.map((a) => {
              const company = companies.find((c) => c.id === a.company);
              const share = (a.length * 100) / scale;
              const len = Math.max(0, share - gap);
              const offset = 25 - start;
              start += share;
              return (
                <circle
                  key={a.company}
                  className={`cert-donut-arc${a.exempt ? " exempt" : ""}`}
                  cx="18"
                  cy="18"
                  r={R}
                  stroke={company?.color}
                  strokeDasharray={`${len} ${100 - len}`}
                  strokeDashoffset={offset}
                />
              );
            })
          : null}
      </g>
      <text className="cert-donut-count" x="18" y="18" aria-hidden="true">
        {status.counted}
      </text>
    </svg>
  );
}
