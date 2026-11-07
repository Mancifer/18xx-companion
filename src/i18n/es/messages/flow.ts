import type { AreaText } from "../../contract/domain";
import type { FlowMessages } from "../../contract/messages/flow";
import { domain } from "../domain";
import { exportPreviewOf } from "../../shared";
import { company, money } from "./helpers";

/** Spanish flow messages, moved verbatim from the domain (feature 014). */
export const flow: AreaText<FlowMessages> = {
  "compound.invalidStep": ({ index }) => `Acción ${index} no válida`,
  "compound.nested": () => "Una acción compuesta no puede anidar otra",
  "compound.gameEndStep": ({ index }) => `Acción ${index}: terminar o reabrir la partida va en una entrada aparte`,
  "compound.notOffered": ({ index }) => `Acción ${index}: no disponible en este juego`,
  "compound.stepUnavailable": ({ index, reason }) => `Acción ${index}: ${reason}`,
  gameOver: () => "La partida terminó.",
  export: (p, ctx) => domain.exportInfo(exportPreviewOf(p, ctx), ctx.game),
  "round.onlySR": () => "Solo en la ronda de acciones",
  "round.srEnded": () => "Ya se aplicó el fin de la ronda de acciones",
  newSet: () => "Las ORs de este set ya se jugaron: empieza un set nuevo sin ronda de acciones.",
  "round.onlyOR": () => "Solo en la ronda de operaciones",
  noRunRecorded: (p, ctx) =>
    p.ran
      ? `No se registró la operación de ${company(p.company, ctx)}: cuenta como que no corrió y su acción baja.`
      : `No se registró la operación de ${company(p.company, ctx)}: cuenta como que operó.`,
  setComplete: () => "Fin de las rondas de operaciones.",
  alreadyEnded: () => domain.gameEnd.alreadyEnded,
  noEndCondition: () => domain.gameEnd.noEndCondition,
  "game.notEnded": () => domain.gameEnd.notEnded,
  "phase.unknown": ({ phase }) => `Fase desconocida: ${phase}`,
  bankBroken: () => "El banco se queda sin dinero (banca quebrada).",
  insufficientCash: ({ have }, ctx) => `Solo tiene ${money(have, ctx)}; quedará en negativo.`,
  phaseStarter: ({ phase, type }, ctx) =>
    `La fase ${domain.phaseName(ctx.game, phase)} empezó con un ${type}: la fase y los trenes oxidados no cambian solos. Si hace falta, corregilos en Fase (control de turno).`,
  notOnSale: ({ type }) => `El ${type} ya no se vende en esta fase.`,
  refundOffSupply: () => "La devolución se registra, aunque el tren no vuelve a la oferta.",
  "correct.noDestination": () => "Falta a dónde va el tren",
  "correct.noDestinationOnAdd": () => "Al dar un tren no hay destino",
  "correct.noneInSupply": ({ type }) => `No quedan trenes ${type} en la oferta`,
  "correct.noPool": () => "En este juego los trenes no van al pool",
  "market.noCell": () => "Esa casilla no existe",
  "action.notInGame": () => "No disponible en este juego",
  "action.unknown": () => "Acción desconocida",
  "company.noneOperating": () => "No hay compañía operando: elige una",
  "company.unknown": (p) => `Compañía desconocida: ${p.company}`,
  outOfTurn: (p, ctx) => `${company(p.company, ctx)} opera fuera de turno (le toca a ${company(p.current, ctx)}).`,
};
