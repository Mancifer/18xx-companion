import { cellEquals, parseHolder, type CompanyId } from "../types";
import type { PrimitiveEvent } from "./types";
import type { CompanyRecord, SessionState, TurnState } from "./state";

/**
 * Pure reducer (contracts/events.md). It never rejects an event: validation happens before
 * append, and replay of a stored log must always succeed. Meaningless events still apply
 * arithmetically and surface through the invariant checks.
 */
export function reduce(state: SessionState, event: PrimitiveEvent): SessionState {
  switch (event.t) {
    case "moneyTransfer": {
      const money = { ...state.money };
      money[event.from] = (money[event.from] ?? 0) - event.amount;
      money[event.to] = (money[event.to] ?? 0) + event.amount;
      return { ...state, money };
    }

    case "shareTransfer": {
      const holdings = { ...state.holdings };
      const from = { ...holdings[event.from] };
      const to = { ...holdings[event.to] };
      from[event.company] = (from[event.company] ?? 0) - event.units;
      holdings[event.from] = from;
      // `to` is read after `from` is written so a self-transfer nets to zero.
      const toAfter = event.from === event.to ? { ...holdings[event.to] } : to;
      toAfter[event.company] = (toAfter[event.company] ?? 0) + event.units;
      holdings[event.to] = toAfter;
      const presidency = event.presidency ? { ...state.presidency, [event.company]: event.to } : state.presidency;

      let soldThisSR = state.soldThisSR;
      const seller = parseHolder(event.from);
      if (state.turn.round === "SR" && seller.kind === "player" && event.to === "pool") {
        const already = soldThisSR[seller.id] ?? [];
        if (!already.includes(event.company)) {
          soldThisSR = { ...soldThisSR, [seller.id]: [...already, event.company] };
        }
      }
      return { ...state, holdings, presidency, soldThisSR };
    }

    case "marketMove": {
      const current = state.companies[event.company];
      if (!current) return state;
      if (cellEquals(current.position, event.to)) {
        return withCompany(state, event.company, { ...current, position: event.to });
      }
      let maxStack = -1;
      for (const [id, c] of Object.entries(state.companies)) {
        if (id !== event.company && cellEquals(c.position, event.to)) maxStack = Math.max(maxStack, c.stackOrder);
      }
      return withCompany(state, event.company, {
        ...current,
        position: event.to,
        stackOrder: maxStack + 1,
      });
    }

    case "companyStatus": {
      const current = state.companies[event.company];
      if (!current) return state;
      const next: CompanyRecord = {
        ...current,
        status: event.status,
        ...(event.parPrice !== undefined ? { parPrice: event.parPrice } : {}),
        ...(event.floatConfirmed !== undefined ? { floatConfirmed: event.floatConfirmed } : {}),
        ...(event.capitalPending !== undefined ? { capitalPending: event.capitalPending } : {}),
      };
      return withCompany(state, event.company, next);
    }

    case "assetTransfer": {
      const assets = { ...state.assets, [event.asset]: event.to };
      let turn = state.turn;
      const receiver = parseHolder(event.to);
      if (event.asset.startsWith("loan:") && receiver.kind === "company") {
        turn = {
          ...turn,
          loansThisOR: { ...turn.loansThisOR, [receiver.id]: (turn.loansThisOR[receiver.id] ?? 0) + 1 },
        };
      }
      return { ...state, assets, turn };
    }

    case "turnAdvance":
      return advanceTurn(state, event);

    case "counterChange": {
      const subjectCounters = { ...state.counters[event.subject] };
      subjectCounters[event.key] = (subjectCounters[event.key] ?? 0) + event.delta;
      const counters = { ...state.counters, [event.subject]: subjectCounters };
      let turn = state.turn;
      const subject = parseHolder(event.subject);
      if (event.key === "runs" && event.delta > 0 && subject.kind === "company") {
        if (!turn.operatedThisOR.includes(subject.id)) {
          turn = { ...turn, operatedThisOR: [...turn.operatedThisOR, subject.id] };
        }
      }
      return { ...state, counters, turn };
    }

    case "note":
      return state;
  }
}

export function reduceAll(state: SessionState, events: readonly PrimitiveEvent[]): SessionState {
  return events.reduce(reduce, state);
}

function withCompany(state: SessionState, id: CompanyId, record: CompanyRecord): SessionState {
  return { ...state, companies: { ...state.companies, [id]: record } };
}

function advanceTurn(state: SessionState, e: Extract<PrimitiveEvent, { t: "turnAdvance" }>): SessionState {
  const prev = state.turn;
  const next: TurnState = {
    ...prev,
    ...(e.round !== undefined ? { round: e.round } : {}),
    ...(e.srNumber !== undefined ? { srNumber: e.srNumber } : {}),
    ...(e.scheduleIndex !== undefined ? { scheduleIndex: e.scheduleIndex } : {}),
    ...(e.orSet !== undefined ? { orSet: e.orSet } : {}),
    ...(e.orIndex !== undefined ? { orIndex: e.orIndex } : {}),
    ...(e.orsInSet !== undefined ? { orsInSet: e.orsInSet } : {}),
    ...(e.operatingOrder !== undefined ? { operatingOrder: e.operatingOrder } : {}),
    ...(e.phase !== undefined ? { phase: e.phase } : {}),
  };
  let turn: TurnState = next;
  if (e.company !== undefined) {
    const { currentCompany: _dropped, ...rest } = next;
    turn = e.company === null ? rest : { ...rest, currentCompany: e.company };
  }

  // Derived per-round sets (data-model §5).
  const orChanged = turn.round !== prev.round || turn.orSet !== prev.orSet || turn.orIndex !== prev.orIndex;
  if (orChanged) turn = { ...turn, operatedThisOR: [], loansThisOR: {} };
  const srChanged = turn.round !== prev.round || turn.srNumber !== prev.srNumber;
  const soldThisSR = srChanged ? {} : state.soldThisSR;

  return { ...state, turn, soldThisSR };
}
