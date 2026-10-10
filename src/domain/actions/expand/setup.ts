import type { PrimitiveEvent } from "../../events/types";
import { warning, type HandlerMap } from "../context";
import type { Warning } from "../schemas";

/** Lower-case, accent-free form used to compare aliases (data-model §2). */
export function normalizeAlias(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("es");
}

export const setupHandlers: HandlerMap = {
  createSession: {
    validate: (ctx, a) => {
      const warnings: Warning[] = [];
      const { min, max } = ctx.game.playerCount;
      if (a.players.length < min || a.players.length > max) {
        warnings.push(
          warning("playerCount", `${ctx.game.name} se juega con ${min}–${max} jugadores; hay ${a.players.length}.`),
        );
      }
      const seen = new Map<string, string>();
      const owners: [string, string][] = [
        ...a.players.flatMap((p) => [p.name, ...p.aliases].map((alias): [string, string] => [alias, p.name])),
        ...ctx.game.companies.flatMap((c) => [c.shortName, ...c.aliases].map((alias): [string, string] => [alias, c.shortName])),
      ];
      const duplicates = new Set<string>();
      for (const [alias, owner] of owners) {
        const key = normalizeAlias(alias);
        if (key === "") continue;
        const first = seen.get(key);
        if (first !== undefined && first !== owner) duplicates.add(`"${alias}" (${first} / ${owner})`);
        else seen.set(key, owner);
      }
      if (duplicates.size > 0) {
        warnings.push(warning("duplicateAlias", `Alias repetidos: ${[...duplicates].join(", ")}. La voz preguntará.`, "info"));
      }
      return warnings;
    },
    expand: (ctx, a) => {
      const events: PrimitiveEvent[] = [];
      const cash = ctx.game.startingCash[String(a.players.length)] ?? 0;
      if (cash > 0) {
        for (const p of a.players) events.push({ t: "moneyTransfer", from: "bank", to: `player:${p.id}`, amount: cash });
      }
      // National companies with a price track start floated at the track's first space.
      for (const c of ctx.game.companies) {
        if (c.kind === "national" && ctx.game.market.tracks?.[c.id]) {
          events.push({ t: "companyStatus", company: c.id, status: "floated" });
          events.push({ t: "marketMove", company: c.id, to: { index: 0 }, reason: "par" });
        }
      }
      const schedule = ctx.game.roundSchedule;
      // A fixed schedule that opens with a stock round (RotLA "SR1") starts there.
      const firstSR = schedule.type === "fixed" ? /^SR(\d+)$/.exec(schedule.sequence[0] ?? "") : null;
      events.push(
        firstSR
          ? { t: "turnAdvance", round: "SR", srNumber: Number(firstSR[1]), scheduleIndex: 0, phase: ctx.state.turn.phase }
          : schedule.type === "fixed"
            ? { t: "turnAdvance", round: "PRIVATES", scheduleIndex: 0, phase: ctx.state.turn.phase }
            : { t: "turnAdvance", round: "PRIVATES", phase: ctx.state.turn.phase },
      );
      return events;
    },
  },
};
