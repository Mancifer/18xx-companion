import { assetsHeldBy, cashOf, holdersOf, isPlayerBankrupt, presidentOf, unitsOf } from "../../domain/events/state";
import { isSetup } from "../../domain/ledger/undo";
import { enabledMechanics } from "../../domain/mechanics/custom";
import { priceOf } from "../../domain/mechanics/market";
import { trainsHeldBy } from "../../domain/mechanics/phases";
import { trainTypeOf, type CompanyId, type HolderRef, type PlayerId } from "../../domain/types";
import type { QueryContext, VoiceText } from "../contract/voice";
import { formatMoney } from "../format";
import { domain } from "./domain";

/**
 * Feature 014 (contracts/voice.md): the Spanish voice text, moved verbatim from the voice layer.
 * The system prompt and the tool descriptions must stay byte-identical (the cached prefix and its
 * eval baseline depend on them).
 */

/** How many recent entries the snapshot lists. */
const RECENT_ENTRIES = 15;

const systemPrompt: VoiceText["systemPrompt"] = ({ game, players }) => {
  const lines: string[] = [];
  lines.push(
    "Eres el intérprete de órdenes habladas de una app que lleva el dinero de una partida de 18xx.",
    "Recibes la transcripción de lo que dijo un jugador (en español, con errores del reconocedor) y una foto del estado.",
    "Responde SIEMPRE llamando al menos una herramienta. No escribas texto para el usuario: la app ignora tu texto.",
    "- Una orden del juego: llama la herramienta de esa acción. Si la frase tiene varias órdenes (\"compra un 4 y paga 290\"), llama varias herramientas en el orden dicho.",
    "- Una pregunta sobre el estado: llama query; la app responde con sus datos.",
    "- Si es ambiguo (dos jugadores parecidos, falta la compañía o la cantidad): llama askClarification con 2 a 6 opciones; value es el id.",
    "- Si no es una orden del juego o ninguna herramienta la expresa: llama notUnderstood. No adivines.",
    "- «deshacer» → undo (groupId null); «deshacé hasta X» → undo con el id de X; «no, eran 260» → amendLast. «sí» / «confirmar» con una propuesta en pantalla → confirmProposal.",
    "Números: entiende cifras y palabras (\"doscientos cuarenta\" = 240). Las cantidades son enteros en la moneda del juego.",
    "company null significa la compañía que opera ahora; úsalo cuando no se nombra otra.",
    "",
    `Juego: ${game.name}. Moneda: ${game.currency.symbol}.`,
  );
  if (game.revenueParts.length > 1) {
    lines.push(`Ingresos en partes: ${game.revenueParts.map((p) => `${p.id} = ${p.label}`).join(", ")}. No hay elección de pago (mode null).`);
  } else {
    lines.push(`Modos de pago permitidos: ${game.payoutModes.join(", ")}.`);
  }
  const mechanics = enabledMechanics(game).map((m) => m.id);
  if (mechanics.length > 0) lines.push(`Reglas especiales activas: ${mechanics.join(", ")}.`);
  if (mechanics.includes("auctionLaunch")) {
    lines.push("«abre X por N» = launchCompany en juegos con lanzamiento por subasta (no parCompany): N es la puja.");
  }
  if (game.defaultBuySource === "treasury") {
    lines.push(
      "buyShare sin origen dicho = source treasury (la tesorería de la compañía); esta partida no tiene IPO para comprar. En compras de acciones, «del banco» / «del pool» = source pool.",
    );
  } else {
    lines.push("buyShare sin origen dicho = source ipo; en compras de acciones, «del banco» / «del pool» = source pool.");
  }
  if (game.loans) lines.push(`Préstamos de ${formatMoney(game.loans.amount, game, "es")}, sin interés y sin devolución.`);
  lines.push(`Trenes: ${game.trains.map((t) => t.variants.map((v) => `${v.name} ${formatMoney(v.cost, game, "es")}`).join(" / ")).join("; ")}.`);
  lines.push(`Privadas: ${game.privates.map((p) => `${p.id} = ${p.name}${p.aliases.length ? ` (${p.aliases.join(", ")})` : ""}`).join("; ")}.`);
  lines.push("", "Jugadores (id = nombre; alias):");
  for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
    lines.push(`- ${p.id} = ${p.name}${p.aliases.length ? `; ${p.aliases.join(", ")}` : ""}`);
  }
  lines.push("", "Compañías (id = nombre; alias):");
  for (const c of game.companies) {
    const alt = c.altName ? ` (segunda identidad: ${c.altName}${c.altAliases?.length ? `; ${c.altAliases.join(", ")}` : ""} → identity alt)` : "";
    lines.push(`- ${c.id} = ${c.name}${alt}${c.aliases.length ? `; ${c.aliases.join(", ")}` : ""}`);
  }
  return lines.join("\n");
};

const toolDescriptions: VoiceText["toolDescriptions"] = {
  runAndPayout:
    "Ingresos de la compañía que opera y cómo se reparten. company null = la que opera; mode null = pagar. «240, paga» · «retiene 180» · «media paga 300» · «local 120, puerto 240».",
  buyTrain:
    "Una compañía compra un tren: al banco, del pool o a otra compañía (con precio acordado). «compra un tres» · «la Pennsy le compra el 4 a la B&O por 300» · «diésel entregando el cuatro».",
  payCost: "La compañía paga un costo al banco (terreno, estación, ficha). «paga 120 de montaña» · «80 de estación».",
  bankPays: "El banco paga a una compañía un pago puntual. «el banco le paga 60 a la VH por el puente».",
  privateIncome: "Pagar los ingresos de las privadas a sus dueños. «cobran las privadas» · «ingresos de privadas».",
  buyPrivateByCompany: "Una compañía compra una privada a su dueño. «la PRR compra la Delaware por 140».",
  takeLoan: "Una compañía pide préstamos (sin interés, no se devuelven). «la Victoria pide un préstamo» · «dos préstamos».",
  nationalPayout: "Dividendo del banco nacional: mínimo de la fase más el extra de ciudades. «el banco de inglaterra paga 40 extra».",
  parCompany: "Un jugador abre una compañía a un precio de salida. «Ana abre la NYC a 82» · «Bruno saca la Erie a 90».",
  buyShare:
    "Comprar acciones de la IPO, del pool o de la tesorería. count null = 1. «Bruno compra una B&O del pool» · «Carla compra dos de la IPO de la PRR».",
  sellShares: "Vender acciones al pool. «Carla vende dos Erie» · «Ana vende una NYC».",
  swapCertificates: "El presidente cambia un certificado con la tesorería, sin dinero. «Ana cambia una VH por una SSF de la tesorería».",
  issueShares:
    "La compañía emite acciones al pool y cobra su precio (en la ronda corporativa, o al operar si el juego lo permite). «la VH emite una» · «emite dos» · «emite una acción».",
  redeemShare: "La compañía recompra una acción suya del pool al precio actual. company null = la que opera. «recompra una acción» · «la Express recompra una».",
  launchCompany:
    "Quien gana la subasta abre una minor: la puja entera va a su tesorería; price null = la mitad de la puja (la app la ajusta). «Ana abre Tunneling por 140» · «Bruno lanza Express en 165».",
  mergeCompanies:
    "Ronda de fusiones: dos minors se fusionan en una corporación sin abrir. identity alt = su segunda identidad (si nombran ese nombre). «Express y Tunneling se fusionan en Union» · «… en Conglomerate» (Consortium, alt).",
  startMR: "Empieza la ronda de fusiones (tras la segunda ronda de operaciones, desde la fase verde). «ronda de fusiones».",
  forcedTrainPurchase:
    "Compra forzada: la compañía no tiene tren ni dinero; el presidente pone la diferencia, vendiendo acciones si hace falta (sales). «compra forzada de un 4, Ana vende dos de Express».",
  namedPayment:
    "Dinero de una habilidad de la compañía (Tunneling: montaña; Expansive: ficha extra; Sede). amount null = el de la habilidad. «bonificación de túnel» · «ficha extra de Expansive» · «sede, 40».",
  rockFormation: "Formación rocosa (Landmarks): la acción de la compañía sube dos casillas, antes del pago. company null = la que opera. «formación rocosa».",
  cliffSale:
    "Acantilado (Landmarks): la compañía vende un tren al banco por la mitad de su precio impreso; el tren va al pool. train = tipo. «vende el 5 en el acantilado».",
  canyonTrain: "Cañón (Landmarks): la compañía recibe un 2 oxidado que ya no se oxida. company null = la que opera. «tren del cañón».",
  buyPrivate: "Un jugador compra una privada al precio pagado. «Ana compra la Camden por 160».",
  exchangePrivate: "Canjear una privada por una acción, cerrándola. «Dani canjea la Mohawk por una NYC».",
  stockBatch:
    "Varias compras y ventas de la ronda de acciones de una vez, en el orden dicho. «Ana compró dos PRR, Bruno vendió tres B&O».",
  startSR: "Empieza la ronda de acciones. «empieza la ronda de acciones».",
  endSR: "Termina la ronda de acciones. «fin de la ronda de acciones».",
  startCR: "Empieza la ronda corporativa. «ronda corporativa».",
  endCR: "Termina la ronda corporativa. «fin de la ronda corporativa».",
  startOR: "Empieza una ronda de operaciones. «empieza la ronda de operaciones» · «siguiente OR».",
  nextCompany: "Pasa a la siguiente compañía. «siguiente compañía» · «siguiente».",
  endGame: "Terminar la partida (fin del juego). Sin argumentos.",
  transferMoney: "Pago directo entre el banco, jugadores y compañías. «Ana le paga 50 a Bruno» · «Carla paga 100 al banco».",
  adjustMoney: "Corregir el dinero de alguien: sumar/restar (delta) o fijar (setTo). «Ana tiene 520» · «súmale 20 a Bruno».",
  correctTrain:
    "Corregir los trenes de una compañía por un error de registro (no es una compra ni un descarte). remove: el tren va a la oferta (bank, con devolución del precio de lista salvo amount), al pool o fuera de juego (removed). add: dar un tren de la oferta (amount = lo que paga, null = nada). «la PRR no tenía ese dos, devolvelo al banco» · «sacale el tres a la B&O, fuera de juego» · «dale un dos a la NYC sin pagar».",
  setMarket: "Mover a mano la ficha de una compañía en el mercado. «pon la PRR en 90».",
  askClarification:
    "Pregunta al usuario cuando la orden es ambigua (dos jugadores parecidos, falta la compañía). Da de 2 a 6 opciones. «Ana compra una» (¿Ana o Anabel? ¿qué compañía?).",
  query: "Pregunta sobre el estado; la app responde con sus datos. «¿cuánto tiene Ana?» · «¿quién preside la Erie?» · «¿a cuánto está la PRR?».",
  notUnderstood: "Úsala cuando la frase no es una orden del juego o no se puede expresar con las herramientas. «charla de la mesa».",
  undo: "Deshacer. Sin destino (null) = la última entrada. «deshacé hasta …» = el id de esa entrada en Últimas entradas. «deshacer» · «borrá eso» · «deshacé hasta la compra del tren de la EXP».",
  amendLast: "Pedido de corregir una cantidad o una entrada anterior. La app no corrige: explica cómo deshacer. «no, eran 260» · «perdón, 300».",
  confirmProposal: "Confirmar la propuesta que está en pantalla. «sí» · «confirmar» · «vale».",
};

const snapshot: VoiceText["snapshot"] = (input) => {
  const { game, players, state } = input;
  const money = (n: number) => formatMoney(n, game, "es");
  const lines: string[] = [];
  const current = state.turn.currentCompany;
  const round = domain.cycleRoundLabel(game, state.turn) ?? domain.roundLabel(state.turn);
  lines.push(`Ronda: ${round}. Fase ${state.turn.phase}.${current ? ` Opera: ${current}.` : ""}`);
  lines.push(`Banco: ${game.bank === "unlimited" ? "ilimitado" : money(cashOf(state, "bank"))}.`);
  lines.push("Jugadores:");
  for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
    const ref = `player:${p.id}` as const;
    const held = game.companies
      .filter((c) => unitsOf(state, ref, c.id) > 0)
      .map((c) => `${c.id} ${(unitsOf(state, ref, c.id) * 100) / c.shareCount}%`);
    if (isPlayerBankrupt(state, p.id)) {
      lines.push(`- ${p.name} (${p.id}): fuera de la partida (quiebra); no proponer acciones suyas`);
      continue;
    }
    lines.push(`- ${p.name} (${p.id}): ${money(cashOf(state, ref))}${held.length ? `; ${held.join(", ")}` : ""}`);
  }
  lines.push("Compañías:");
  for (const c of game.companies) {
    const record = state.companies[c.id];
    if (!record || record.status === "unstarted") continue;
    const price = priceOf(game, state, c.id);
    const trains = assetsHeldBy(state, `company:${c.id}`, "train").map(trainTypeOf);
    const tier = c.tier ? ` (${c.tier})` : "";
    const shares = [
      ["IPO", unitsOf(state, `ipo:${c.id}`, c.id)],
      ["tesorería", unitsOf(state, `company:${c.id}`, c.id)],
      ["pool", unitsOf(state, "pool", c.id)],
    ] as const;
    const available = shares.filter(([, n]) => n > 0).map(([where, n]) => `${where} ${n}`);
    lines.push(
      `- ${c.id}${tier}: ${record.status}, caja ${money(cashOf(state, `company:${c.id}`))}${price !== undefined ? `, precio ${money(price)}` : ""}, acciones ${available.join(" · ") || "ninguna libre"}${trains.length ? `, trenes ${trains.join(" ")}` : ""}`,
    );
  }
  // Games with minors and majors (RotLA): what can still be launched or formed.
  const unstarted = (tier: "minor" | "major") =>
    game.companies.filter((c) => c.tier === tier && state.companies[c.id]?.status === "unstarted");
  if (game.companies.some((c) => c.tier !== undefined)) {
    lines.push(`Minors sin abrir: ${unstarted("minor").map((c) => c.id).join(", ") || "ninguna"}.`);
    const majors = unstarted("major").map((c) => `${c.id} (${c.name}${c.altName ? ` / ${c.altName}` : ""})`);
    lines.push(`Corporaciones sin abrir: ${majors.join(", ") || "ninguna"}.`);
  }
  const onSale = game.trains
    .map((t) => ({ t, left: t.count === "unlimited" ? "∞" : String(trainsHeldBy(state, "bank", t.type).length) }))
    .filter(({ left }) => left !== "0");
  lines.push(`Trenes en el banco: ${onSale.map(({ t, left }) => `${t.type} (${money(t.variants[0]?.cost ?? 0)}, quedan ${left})`).join(", ")}.`);
  // With ids, so «deshacé hasta …» can name an entry (feature 010, contracts/voice-undo.md).
  const recent = input.effective.filter((g) => !isSetup(g)).slice(-RECENT_ENTRIES);
  if (recent.length > 0) {
    lines.push("Últimas entradas (id entre corchetes, la más nueva al final):");
    for (const g of recent) lines.push(`- [${g.id}] ${domain.summary(g.action, { game, players, state })}`);
  }
  lines.push("", `Transcripción: «${input.transcript}»`);
  if (input.clarification !== undefined) lines.push(`Aclaración elegida: ${input.clarification}`);
  return lines.join("\n");
};

/** State questions (FR-073, US5-4), answered from the app's state, never from the model's text. */
const queryAnswer: VoiceText["queryAnswer"] = (ctx: QueryContext, q) => {
  const { game, players, state } = ctx;
  const money = (n: number) => formatMoney(n, game, "es");
  const playerName = (id: PlayerId) => players.find((p) => p.id === id)?.name ?? id;
  const short = (id: CompanyId) => game.companies.find((c) => c.id === id)?.shortName ?? id;
  const shareCount = (id: CompanyId) => state.companies[id]?.shareCount ?? 10;
  const percent = (units: number, id: CompanyId) => `${(units * 100) / shareCount(id)}%`;
  const askCompany = "¿De qué compañía?";
  switch (q.kind) {
    case "cash":
      if (q.player) return `${playerName(q.player)} tiene ${money(cashOf(state, `player:${q.player}`))}`;
      if (q.company) return `${short(q.company)} tiene ${money(cashOf(state, `company:${q.company}`))} en caja`;
      return "¿De quién?";
    case "treasury":
      if (!q.company) return askCompany;
      return `${short(q.company)} tiene ${money(cashOf(state, `company:${q.company}`))} en caja`;
    case "shares": {
      if (q.player && q.company) {
        const units = unitsOf(state, `player:${q.player}`, q.company);
        return `${playerName(q.player)} tiene ${units} ${units === 1 ? "acción" : "acciones"} de ${short(q.company)} (${percent(units, q.company)})`;
      }
      if (q.player) {
        const ref: HolderRef = `player:${q.player}`;
        const held = game.companies.filter((c) => unitsOf(state, ref, c.id) > 0);
        if (held.length === 0) return `${playerName(q.player)} no tiene acciones`;
        return `${playerName(q.player)} tiene: ${held.map((c) => `${c.shortName} ${percent(unitsOf(state, ref, c.id), c.id)}`).join(", ")}`;
      }
      if (q.company) {
        const company = q.company;
        const parts = holdersOf(state, company)
          .filter(([, units]) => units > 0)
          // Most first; at equal holdings, players before the IPO and the pool.
          .sort((a, b) => b[1] - a[1] || Number(!a[0].startsWith("player:")) - Number(!b[0].startsWith("player:")))
          .map(([h, units]) => {
            const name = h.startsWith("ipo:") ? "IPO" : h === "pool" ? "pool" : domain.holderName(h, game, players);
            return `${name} ${percent(units, company)}`;
          });
        return `${short(company)}: ${parts.join(", ")}`;
      }
      return "¿De quién o de qué compañía?";
    }
    case "price": {
      if (!q.company) return askCompany;
      const price = priceOf(game, state, q.company);
      return price === undefined ? `${short(q.company)} no tiene precio todavía` : `${short(q.company)} está a ${money(price)}`;
    }
    case "trains": {
      if (q.company) {
        const trains = assetsHeldBy(state, `company:${q.company}`, "train").map(trainTypeOf);
        return trains.length === 0 ? `${short(q.company)} no tiene trenes` : `${short(q.company)} tiene trenes: ${trains.join(", ")}`;
      }
      const onSale = game.trains
        .map((t) => ({ t, left: t.count === "unlimited" ? "∞" : String(trainsHeldBy(state, "bank", t.type).length) }))
        .filter(({ left }) => left !== "0")
        .map(({ t, left }) => `${t.type} (${left} a ${money(t.variants[0]?.cost ?? 0)})`);
      return `En el banco: ${onSale.join(", ")}`;
    }
    case "bank":
      return game.bank === "unlimited" ? "El banco es ilimitado" : `El banco tiene ${money(cashOf(state, "bank"))}`;
    case "president": {
      if (!q.company) return askCompany;
      const president = presidentOf(state, q.company);
      return president ? `Preside ${short(q.company)}: ${playerName(president)}` : `${short(q.company)} no tiene presidente`;
    }
    case "turn": {
      const current = state.turn.currentCompany;
      return `${domain.roundLabel(state.turn)} · fase ${state.turn.phase}${current ? ` · opera ${short(current)}` : ""}`;
    }
  }
};

/** Feature 015: Whisper's hint and the transcripts it invents on silence (contracts/groq-transcription.md §7). */
const whisperHint: VoiceText["whisperHint"] = {
  lead: (gameName) => `Partida de ${gameName}.`,
  players: "Jugadores",
  companies: "Compañías",
  trains: "Trenes",
  words: ["dividendos", "retiene", "compra", "vende", "paga", "mitad"],
};

const hallucinations = [
  "gracias por ver el video",
  "gracias por ver",
  "subtitulos realizados por la comunidad de amaraorg",
  "suscribete",
  "gracias",
];

export const voice: VoiceText = { lang: "es", systemPrompt, toolDescriptions, snapshot, queryAnswer, whisperHint, hallucinations };
