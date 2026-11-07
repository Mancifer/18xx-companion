import type { AreaText } from "../../contract/domain";
import type { OperatingMessages } from "../../contract/messages/operating";
import { money, paymentLabel } from "./helpers";

/** Spanish operating-round messages, moved verbatim from the domain (feature 014). */

export const operating: AreaText<OperatingMessages> = {
  keptTrain: () => "Este tren no se vende ni se entrega.",
  trainNotAvailable: ({ type, phase }) => `Los trenes ${type} no están disponibles hasta la fase ${phase}.`,
  trainOrder: ({ type }) => `Aún quedan trenes ${type} en el banco.`,
  trainLimit: ({ count, limit, merger }) =>
    merger ? `La corporación tendría ${count} trenes; el límite es ${limit}.` : `Con este tren tendría ${count}; el límite es ${limit}.`,
  tradeIn: (p) => {
    switch (p.kind) {
      case "notAccepted":
        return `Un ${p.type ?? ""} no se compra entregando un ${p.tradeIn ?? ""}.`;
      case "variantOnly":
        return `El precio de entrega solo vale para el ${p.variant ?? ""}.`;
      case "rusts":
        return `El ${p.tradeIn ?? ""} se oxida con esta compra: no se puede entregar.`;
      case "notHeld":
        return `La compañía no tiene un ${p.tradeIn ?? ""} para entregar.`;
    }
  },
  leadoffTrain: () => "Esta compañía no compra el tren de salida: ya tiene el suyo.",
  "payout.national": () => "El banco nacional usa su propio pago",
  "payout.noChoice": () => "En este juego no se elige cómo pagar",
  "payout.noHalf": () => "Esta partida no permite pagar la mitad",
  "payout.modeNotAllowed": () => "Modo de pago no permitido",
  "payout.unknownPart": ({ part }) => `Parte de ingresos desconocida: ${part}`,
  notFloated: () => "La compañía no está flotada.",
  forcedWithhold: () => "En administración: retiene todos los ingresos.",
  "train.unknownType": ({ type }) => `No hay trenes ${type} en este juego`,
  "train.noSeller": () => "Falta la compañía que vende",
  "train.selfPurchase": () => "Una compañía no se compra un tren a sí misma",
  "train.noneAt": ({ type, from, seller }) => `No hay un tren ${type} en ${from === "bank" ? "el banco" : from === "pool" ? "el pool" : seller}`,
  "private.alreadyCompanys": () => "La compañía ya es dueña de esa privada",
  privatePrice: ({ min, max }, ctx) => `El precio debe estar entre ${money(min, ctx)} y ${money(max, ctx)}.`,
  "train.notHeld": () => "La compañía no tiene ese tren",
  "train.noReserve": () => "Este juego no tiene trenes de reserva",
  "train.supplyChange": ({ op, type }) => `No se puede ${op === "add" ? "añadir" : "quitar"} un ${type}`,
  treasuryTradeTwice: () => "Esta compañía ya emitió o recompró una acción en esta ronda de operaciones.",
  "redeem.noneInPool": () => "No hay acciones de la compañía en el pool",
  "redeem.onlyInPool": ({ left }) => `Solo hay ${left} en el pool`,
  "payment.noAbility": () => "La compañía no tiene esa habilidad",
  paymentAmount: ({ payment }, ctx) => `Falta el importe de ${paymentLabel(payment, ctx)}.`,
  playerCount: ({ min, max, count }, ctx) => `${ctx.game.name} se juega con ${min}–${max} jugadores; hay ${count}.`,
  duplicateAlias: ({ aliases }) => `Alias repetidos: ${aliases}. La voz preguntará.`,
  "receivership.already": () => "Ya está en administración",
  "player.unknown": () => "Jugador desconocido",
  "bankruptcy.already": () => "Ya está en quiebra",
};
