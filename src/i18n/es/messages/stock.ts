import type { AreaText } from "../../contract/domain";
import type { ShareSourceId, StockMessages } from "../../contract/messages/stock";
import { holder, money, player } from "./helpers";

/** Spanish stock messages, moved verbatim from the domain (feature 014). */

const WHERE: Readonly<Record<ShareSourceId, string>> = { ipo: "la IPO", pool: "el pool", treasury: "la tesorería" };

export const stock: AreaText<StockMessages> = {
  "stock.batchRowUnavailable": ({ row, reason }) => `Fila ${row}: ${reason}`,
  "par.notOpenable": () => "Esta compañía no se abre",
  "par.byAuction": () => "Esta compañía se abre por subasta",
  "par.onlyByMerger": () => "Esta compañía solo nace de una fusión",
  "par.alreadyOpen": () => "La compañía ya está abierta",
  "par.invalidPrice": ({ price }, ctx) => `Precio de salida no válido: ${money(price, ctx)}`,
  "trade.onlyInCR": () => "Las compañías solo compran y venden en la ronda corporativa",
  "buy.notOpen": () => "La compañía no está abierta",
  "buy.gone": () => "La compañía ya no existe",
  "buy.noneLeft": ({ source }) => `No quedan acciones en ${WHERE[source]}`,
  "buy.onlyLeft": ({ left, source }) => `Solo quedan ${left} en ${WHERE[source]}`,
  "sell.noPrice": () => "La compañía no tiene precio",
  boughtAfterSelling: () => "Ya vendió esta compañía en esta ronda de acciones.",
  notEnoughShares: ({ held, side }) =>
    side === "player"
      ? "El jugador no tiene esos certificados."
      : side === "treasury"
        ? "La tesorería no tiene esos certificados."
        : `Solo tiene ${held ?? 0}.`,
  notYetAvailable: ({ from }) => `Esta compañía no se puede abrir hasta la ${from}.`,
  "private.unknown": (p) => `Privada desconocida: ${p.private}`,
  "private.closed": () => "Esa privada está cerrada",
  "private.alreadyYours": () => "Ya es suya",
  "private.noTrading": (p, ctx) => `La ${p.private} ya es de ${holder(p.owner, ctx)}; en ${ctx.game.name} las privadas no se traspasan`,
  "private.tradeLater": (p, ctx) =>
    `La ${p.private} ya es de ${holder(p.owner, ctx)}; solo se traspasa en una ronda de acciones a partir de la segunda`,
  certificateLimit: ({ certs, limit }) => `Tendría ${certs} certificados; el límite es ${limit}.`,
  companyLimit: ({ percent, limit }) => `Tendría el ${percent}% de la compañía; el límite es ${limit}%.`,
  poolLimit: (p) =>
    p.units !== undefined
      ? `El pool tendría ${p.units} certificados; el máximo es ${p.maxCerts ?? ""}.`
      : `El pool tendría el ${p.percent ?? ""}%; el máximo es ${p.maxPercent ?? ""}%.`,
  maxSharesPerBuy: ({ max }) => `Se compra ${max === 1 ? "una acción" : `hasta ${max} acciones`} cada vez.`,
  notOperated: () => "Esta compañía aún no ha operado: no se vende hasta que opere.",
  eliminatedPlayer: (p, ctx) => `${player(p.player, ctx)} ya no está en la partida (quiebra).`,
};
