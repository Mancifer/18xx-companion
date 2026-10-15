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
      // An issue or redemption: a company's own shares between its treasury and the pool, in an OR.
      let turn = state.turn;
      const own = `company:${event.company}`;
      const trade = (event.from === own && event.to === "pool") || (event.from === "pool" && event.to === own);
      if (turn.round === "OR" && trade) {
        const trades = turn.treasuryTradesThisOR ?? {};
        turn = { ...turn, treasuryTradesThisOR: { ...trades, [event.company]: (trades[event.company] ?? 0) + 1 } };
      }
      return { ...state, holdings, presidency, soldThisSR, turn };
    }

    case "marketMove": {
      const current = state.companies[event.company];
      if (!current) return state;
      // Only an end step produces these moves, so they also mark the round as ended (research R2).
      const ended = event.reason === "soldOut" || event.reason === "poolPenalty" ? withRoundEnded(state) : state;
      // "restack" re-enters the same cell, so the company goes to the bottom of its stack (R2).
      if (cellEquals(current.position, event.to) && event.reason !== "restack") {
        return withCompany(ended, event.company, { ...current, position: event.to });
      }
      let maxStack = -1;
      for (const [id, c] of Object.entries(state.companies)) {
        if (id !== event.company && cellEquals(c.position, event.to)) maxStack = Math.max(maxStack, c.stackOrder);
      }
      return withCompany(ended, event.company, {
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
      // Pending capital is only paid by an SR end step (research R2).
      return withCompany(event.capitalPending === false ? withRoundEnded(state) : state, event.company, next);
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

function withRoundEnded(state: SessionState): SessionState {
  return state.turn.roundEnded ? state : { ...state, turn: { ...state.turn, roundEnded: true } };
}

export function advanceTurn(state: SessionState, e: Extract<PrimitiveEvent, { t: "turnAdvance" }>): SessionState {
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
  if (orChanged) {
    const { treasuryTradesThisOR: _trades, ...rest } = turn;
    turn = { ...rest, operatedThisOR: [], loansThisOR: {} };
  }
  const srChanged = turn.round !== prev.round || turn.srNumber !== prev.srNumber;
  const soldThisSR = srChanged ? {} : state.soldThisSR;
  if (srChanged || orChanged) {
    const { roundEnded: _cleared, ...rest } = turn;
    turn = rest;
  }
  if (e.roundEnd !== undefined) turn = { ...turn, roundEnded: true };

  return { ...state, turn, soldThisSR };
}
