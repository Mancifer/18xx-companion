import { formatMoney } from "../domain/i18n/format";
import { enabledMechanics } from "../domain/mechanics/custom";
import type { VoiceSession } from "./tools";

/**
 * The stable system prompt (research R9): instructions, the game summary and the session's
 * names and aliases. It depends only on the session, so it is cached with the tools.
 */
export function systemPromptEs({ game, players }: VoiceSession): string {
  const lines: string[] = [];
  lines.push(
    "Eres el intérprete de órdenes habladas de una app que lleva el dinero de una partida de 18xx.",
    "Recibes la transcripción de lo que dijo un jugador (en español, con errores del reconocedor) y una foto del estado.",
    "Responde SIEMPRE llamando al menos una herramienta. No escribas texto para el usuario: la app ignora tu texto.",
    "- Una orden del juego: llama la herramienta de esa acción. Si la frase tiene varias órdenes (\"compra un 4 y paga 290\"), llama varias herramientas en el orden dicho.",
    "- Una pregunta sobre el estado: llama query; la app responde con sus datos.",
    "- Si es ambiguo (dos jugadores parecidos, falta la compañía o la cantidad): llama askClarification con 2 a 6 opciones; value es el id.",
    "- Si no es una orden del juego o ninguna herramienta la expresa: llama notUnderstood. No adivines.",
    "- \"deshacer\" → undo. \"no, eran 260\" → amendLast. \"sí\" / \"confirmar\" con una propuesta en pantalla → confirmProposal.",
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
  if (game.loans) lines.push(`Préstamos de ${formatMoney(game.loans.amount, game)}, sin interés y sin devolución.`);
  lines.push(`Trenes: ${game.trains.map((t) => t.variants.map((v) => `${v.name} ${formatMoney(v.cost, game)}`).join(" / ")).join("; ")}.`);
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
}
