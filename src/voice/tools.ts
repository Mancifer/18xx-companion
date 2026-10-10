import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { handlerFor } from "../domain/actions/expand";
import { ActionSchema, type ActionType } from "../domain/actions/schemas";
import { initialState } from "../domain/events/state";
import type { GameDefinition } from "../domain/games/schema";
import { isEnabled } from "../domain/mechanics/custom";
import { QUERY_KINDS } from "../domain/queries";
import type { Player } from "../domain/types";

/**
 * Strict Claude tools generated from the same Zod action schemas touch uses (research R5,
 * contracts/voice-tools.md). Entity fields become enums of this session's ids, so the model can
 * only name what exists. Tools depend only on the session (game, players), never on state, and
 * are serialized with sorted keys, so the prefix stays cacheable (research R9).
 */

export interface VoiceSession {
  readonly game: GameDefinition;
  readonly players: readonly Player[];
}

/** Voice-reachable actions, in a fixed order (the order is part of the cached prefix). */
export const ACTION_TOOLS: readonly ActionType[] = [
  "runAndPayout",
  "buyTrain",
  "payCost",
  "bankPays",
  "privateIncome",
  "buyPrivateByCompany",
  "takeLoan",
  "nationalPayout",
  "parCompany",
  "buyShare",
  "sellShares",
  "swapCertificates",
  "issueShares",
  "redeemShare",
  "launchCompany",
  "mergeCompanies",
  "startMR",
  "forcedTrainPurchase",
  "namedPayment",
  "rockFormation",
  "cliffSale",
  "canyonTrain",
  "buyPrivate",
  "exchangePrivate",
  "stockBatch",
  "startSR",
  "endSR",
  "startCR",
  "endCR",
  "startOR",
  "nextCompany",
  "transferMoney",
  "adjustMoney",
  "setMarket",
];

export const META_TOOLS = ["askClarification", "query", "notUnderstood", "undo", "amendLast", "confirmProposal"] as const;

const DESCRIPTIONS: Readonly<Record<string, string>> = {
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
  transferMoney: "Pago directo entre el banco, jugadores y compañías. «Ana le paga 50 a Bruno» · «Carla paga 100 al banco».",
  adjustMoney: "Corregir el dinero de alguien: sumar/restar (delta) o fijar (setTo). «Ana tiene 520» · «súmale 20 a Bruno».",
  setMarket: "Mover a mano la ficha de una compañía en el mercado. «pon la PRR en 90».",
  askClarification:
    "Pregunta al usuario cuando la orden es ambigua (dos jugadores parecidos, falta la compañía). Da de 2 a 6 opciones. «Ana compra una» (¿Ana o Anabel? ¿qué compañía?).",
  query: "Pregunta sobre el estado; la app responde con sus datos. «¿cuánto tiene Ana?» · «¿quién preside la Erie?» · «¿a cuánto está la PRR?».",
  notUnderstood: "Úsala cuando la frase no es una orden del juego o no se puede expresar con las herramientas. «charla de la mesa».",
  undo: "Deshacer la última entrada. «deshacer» · «borra eso».",
  amendLast: "Corregir la cantidad de la última entrada. part solo para ingresos en varias partes. «no, eran 260» · «perdón, 300».",
  confirmProposal: "Confirmar la propuesta que está en pantalla. «sí» · «confirmar» · «vale».",
};

// Keywords strict tool schemas do not accept; constraints stay enforced by Zod after the call.
const DROP = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "format",
  "multipleOf",
  "maxItems",
]);

type Json = Record<string, unknown>;

interface Enums {
  readonly companies: string[];
  readonly players: string[];
  readonly traders: string[];
  readonly moneyHolders: string[];
  readonly shareHolders: string[];
  readonly subjects: string[];
  readonly trains: string[];
  readonly variants: string[];
  readonly privates: string[];
  readonly parts: string[];
  readonly phases: string[];
  readonly minors: string[];
  readonly majors: string[];
  readonly payments: string[];
}

function enumsFor({ game, players }: VoiceSession): Enums {
  const companies = game.companies.map((c) => c.id);
  const playerIds = players.map((p) => p.id);
  const playerRefs = playerIds.map((p) => `player:${p}`);
  const companyRefs = companies.map((c) => `company:${c}`);
  return {
    companies,
    players: playerIds,
    traders: [...playerRefs, ...(isEnabled(game, "corporateRound") ? companyRefs : [])],
    moneyHolders: ["bank", ...playerRefs, ...companyRefs],
    shareHolders: [...playerRefs, ...companyRefs, ...companies.map((c) => `ipo:${c}`), "pool", "removed"],
    subjects: ["bank", ...playerRefs, ...companyRefs],
    trains: game.trains.map((t) => t.type),
    variants: [...new Set(game.trains.flatMap((t) => t.variants.map((v) => v.name)))],
    privates: game.privates.map((p) => p.id),
    parts: game.revenueParts.map((p) => p.id),
    phases: game.phases.map((p) => p.id),
    minors: game.companies.filter((c) => c.tier === "minor").map((c) => c.id),
    majors: game.companies.filter((c) => c.tier === "major").map((c) => c.id),
    payments: [...new Set(game.companies.flatMap((c) => c.traits?.payments?.map((p) => p.id) ?? []))],
  };
}

/** The enum for a property of a given tool, by its name. */
function enumForKey(tool: string, key: string, e: Enums): string[] | undefined {
  switch (key) {
    case "company":
      return e.companies;
    case "seller":
      // buyTrain sells between companies; share sales are by players (or companies in a CR).
      return tool === "buyTrain" ? e.companies : e.traders;
    case "player":
      return e.players;
    case "buyer":
      return tool === "buyPrivate" ? e.players : e.traders;
    case "from":
    case "to":
      if (tool === "transferMoney") return e.moneyHolders;
      if (tool === "transferShares") return e.shareHolders;
      return undefined;
    case "holder":
      return e.moneyHolders.filter((h) => h !== "bank");
    case "subject":
      return e.subjects;
    case "train":
      return tool === "cliffSale" ? e.trains : undefined;
    case "trainType":
    case "tradeIn":
      return e.trains;
    case "variant":
      return e.variants;
    case "private":
      return e.privates;
    case "part":
      return e.parts;
    case "phase":
      return e.phases;
    // mergeCompanies: two minors into a major.
    case "a":
    case "b":
      return e.minors;
    case "into":
      return e.majors;
    case "payment":
      return e.payments;
    default:
      return undefined;
  }
}

/** Puts an enum on a string schema (or on the string branch of a nullable). */
function withEnum(schema: Json, values: string[]): Json {
  if (schema["type"] === "string") return { ...schema, enum: values };
  if (Array.isArray(schema["anyOf"])) {
    return { ...schema, anyOf: (schema["anyOf"] as Json[]).map((s) => (s["type"] === "string" ? { ...s, enum: values } : s)) };
  }
  return schema;
}

/** Strict-compatible: no unsupported keywords, closed objects, every property required. */
function sanitize(node: unknown, tool: string, e: Enums): unknown {
  if (Array.isArray(node)) return node.map((n) => sanitize(n, tool, e));
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (DROP.has(k)) continue;
    if (k === "minItems" && typeof v === "number" && v > 1) continue;
    // Discriminated unions come out as oneOf; strict schemas use anyOf.
    out[k === "oneOf" ? "anyOf" : k] = sanitize(v, tool, e);
  }
  if (out["type"] === "object") {
    const properties = (out["properties"] as Json | undefined) ?? {};
    for (const [key, schema] of Object.entries(properties)) {
      const values = enumForKey(tool, key, e);
      if (values) properties[key] = withEnum(schema as Json, values);
    }
    out["properties"] = properties;
    out["required"] = Object.keys(properties);
    out["additionalProperties"] = false;
  }
  return out;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, sortKeys((value as Json)[k])]),
  );
}

function actionSchema(type: ActionType): z.ZodType | undefined {
  return ActionSchema.options.find((o) => o.shape.type.value === type);
}

function inputSchema(type: ActionType): Json {
  const schema = actionSchema(type);
  if (!schema) return { type: "object", properties: {} };
  const json = z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }) as Json;
  const properties = { ...((json["properties"] as Json | undefined) ?? {}) };
  delete properties["type"];
  return { ...json, properties };
}

function metaSchema(name: (typeof META_TOOLS)[number], e: Enums): Json {
  const nullable = (values: string[]) => ({ anyOf: [{ type: "string", enum: values }, { type: "null" }] });
  switch (name) {
    case "askClarification":
      return {
        type: "object",
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } } },
          },
        },
      };
    case "query":
      return {
        type: "object",
        properties: { kind: { type: "string", enum: [...QUERY_KINDS] }, player: nullable(e.players), company: nullable(e.companies) },
      };
    case "notUnderstood":
      return { type: "object", properties: { reason: { type: "string" } } };
    case "undo":
      return { type: "object", properties: { groupId: { anyOf: [{ type: "string" }, { type: "null" }] } } };
    case "amendLast":
      return { type: "object", properties: { part: nullable(e.parts), value: { type: "integer" } } };
    case "confirmProposal":
      return { type: "object", properties: {} };
  }
}

/** A tool before its wire format: what every provider gets (feature 005, data-model §5). */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** Sanitized JSON Schema with this session's entity enums and sorted keys. */
  readonly schema: Readonly<Record<string, unknown>>;
}

/** The session's tools: actions the game offers, then the meta tools. */
export function buildToolSpecs(session: VoiceSession): ToolSpec[] {
  const e = enumsFor(session);
  const probe = { game: session.game, players: session.players, state: initialState(session.game, session.players) };
  const actions = ACTION_TOOLS.filter((type) => {
    const handler = handlerFor(probe, type);
    return handler !== undefined && (handler.offered?.(session.game) ?? true);
  });
  return [
    ...actions.map((name) => ({ name, schema: inputSchema(name) })),
    ...META_TOOLS.map((name) => ({ name, schema: metaSchema(name, e) })),
  ].map(({ name, schema }) => ({
    name,
    description: DESCRIPTIONS[name] ?? name,
    schema: sortKeys(sanitize(schema, name, e)) as Json,
  }));
}

/** Strict Claude tools; serialized with sorted keys, byte-identical to the pre-005 output. */
export function toAnthropicTools(specs: readonly ToolSpec[]): Anthropic.Tool[] {
  return specs.map((s) => sortKeys({ name: s.name, description: s.description, input_schema: s.schema, strict: true })) as Anthropic.Tool[];
}

export function buildTools(session: VoiceSession): Anthropic.Tool[] {
  return toAnthropicTools(buildToolSpecs(session));
}

/**
 * JSON Schema keywords sent to Gemini's `parametersJsonSchema` (feature 005, research R3).
 * Verified by the 2026-10-10 eval runs (3.8 Flash, 3.6 Flash, 3.5 Flash-Lite): no schema 400s.
 * If Google ever rejects one, a 400 naming the keyword means it comes out of this list.
 */
export const GEMINI_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "properties",
  "required",
  "enum",
  "anyOf",
  "items",
  "description",
  "additionalProperties",
  "minimum",
  "maximum",
  "const",
  "minItems",
]);

/** Removes keywords outside the allowlist; property names under `properties` are kept. */
function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (!GEMINI_SCHEMA_KEYWORDS.has(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as Json).map(([name, s]) => [name, geminiSchema(s)])) : geminiSchema(v);
  }
  return out;
}

export interface GeminiFunctionDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parametersJsonSchema: Readonly<Record<string, unknown>>;
}

/** The same specs as Gemini function declarations, in the same order (FR-006). */
export function toGeminiTools(specs: readonly ToolSpec[]): [{ readonly functionDeclarations: GeminiFunctionDeclaration[] }] {
  return [
    {
      functionDeclarations: specs.map((s) => ({
        name: s.name,
        description: s.description,
        parametersJsonSchema: geminiSchema(s.schema) as Json,
      })),
    },
  ];
}
