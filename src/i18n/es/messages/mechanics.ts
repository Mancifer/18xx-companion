import type { AreaText } from "../../contract/domain";
import type { MechanicsMessages } from "../../contract/messages/mechanics";
import { company, money, player } from "./helpers";

/** Spanish custom-rule messages, moved verbatim from the domain (feature 014). */
export const mechanics: AreaText<MechanicsMessages> = {
  notMergerRound: () => "No es la ronda de fusiones.",
  unknownIdentity: () => "Esta corporación no tiene segunda identidad.",
  presidencyTie: (p, ctx) =>
    `Empate a ${p.units}: preside ${player(p.president, ctx)} (presidencia de ${company(p.minor, ctx)}, que opera antes).`,
  "merge.sameMinor": () => "Elige dos minors distintas",
  "merge.notFloated": () => "Solo se fusionan dos minors en juego",
  "merge.intoNotUnstarted": () => "La corporación debe estar sin abrir",
  "merge.notDue": () => "No toca ronda de fusiones",
  "landmark.notOnMarket": () => "La compañía no está en el mercado",
  landmarkUsed: ({ landmark }) => (landmark === "rock" ? "Esta compañía ya usó la formación rocosa." : "Esta compañía ya tiene el tren del cañón."),
  cliffTwice: () => "Esta compañía ya usó el acantilado en esta ronda de operaciones.",
  trainNotOwned: () => "La compañía no tiene ese tren.",
  "landmark.noRustedTrain": () => "No hay un tren oxidado fuera del juego",
  canyonEarly: ({ type }) => `Los ${type} aún no se oxidaron: el cañón da un ${type} oxidado.`,
  minBid: ({ amount }, ctx) => `La puja mínima es ${money(amount, ctx)}.`,
  bidStep: ({ step }, ctx) => `Las pujas van de ${money(step, ctx)} en ${money(step, ctx)}.`,
  launchPriceClamped: ({ half, price }, ctx) =>
    `La mitad de la puja (${money(half, ctx)}) queda fuera del rango de la fase: se usa ${money(price, ctx)}.`,
  notTrackPrice: ({ price }, ctx) => `${money(price, ctx)} no es un precio del mercado.`,
  noLeadoffTrain: () => "Esta compañía no compra el tren de salida.",
  "launch.notAuction": () => "Esta compañía no se abre por subasta",
  "loan.none": () => "Este juego no tiene préstamos",
  "loan.notYet": ({ phase }) => `Los préstamos empiezan en la fase ${phase}`,
  "loan.noneLeft": () => "No quedan préstamos",
  loanLimit: ({ count, limit }) => `Tendría ${count} préstamos; el límite voluntario es ${limit}.`,
  loanSupply: ({ left }) => `Solo quedan ${left} préstamos.`,
  hasTrain: () => "La compañía ya tiene un tren: la compra no es forzada.",
  presidencyChange: () => "Esa venta cambiaría la presidencia de la compañía que compra el tren.",
  presidentShort: ({ trigger }) =>
    trigger
      ? "Al presidente no le alcanza: debe vender acciones o declararse en quiebra."
      : "Ni vendiendo le alcanza al presidente: puede declararse en quiebra.",
  "company.noPresident": () => "La compañía no tiene presidente",
  grantPar: () => "Falta el precio de salida que elige el dueño; fíjalo después.",
  "private.notPlayers": () => "La privada no es de un jugador",
  "exchange.notExchangeable": () => "Esta privada no se canjea",
  "exchange.pickCompany": () => "Elige la compañía",
  "exchange.onlyFor": (p) => `Solo se canjea por ${p.company}`,
  "exchange.onlyIpo": () => "Solo de la IPO",
  "exchange.onlyPool": () => "Solo del pool",
  "exchange.noneInIpo": () => "No quedan en la IPO",
  "exchange.noneInPool": () => "No hay en el pool",
  "round.onlyCR": () => "Solo en la ronda corporativa",
  "round.crEnded": () => "Ya se aplicó el fin de la ronda corporativa",
  "float.noCondition": () => "Esta compañía no tiene condición de flotación",
  "float.alreadyConfirmed": () => "Ya está confirmada",
  "nationalBank.none": () => "No hay banco nacional",
  forcedPurchase: ({ fromPresident = 0, lent = 0, difference }, ctx) =>
    difference
      ? "Compra forzada: el presidente pone la diferencia."
      : lent > 0
        ? `Compra forzada: el presidente pone ${money(fromPresident, ctx)} y el banco presta ${money(lent, ctx)}; la compañía pasa a administración.`
        : `Compra forzada: el presidente pone ${money(fromPresident, ctx)}.`,
};
