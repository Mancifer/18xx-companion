import type { CompanyId } from "../types";

/**
 * Company mentions inside summary strings (feature 013, data-model.md "Mention"). A marked
 * string carries, for each company it names, the company id and the words the plain sentence has
 * there, between private-use code points that never occur in game data or user input. The UI
 * renders a mention as the company's badge; `stripMentions` gives back the plain string.
 */
export interface Mention {
  readonly company: CompanyId;
  readonly text: string;
}

const START = "";
const SEPARATOR = "";
const END = "";
const MARKERS = /[-]/g;

export function markMention(company: CompanyId, text: string): string {
  return `${START}${company}${SEPARATOR}${text}${END}`;
}

/**
 * Plain parts and mentions, in order; adjacent plain parts merged, empty ones dropped. A
 * malformed marker (no terminator) is never shown raw: it keeps its shown text when it has one,
 * otherwise it only loses the markers.
 */
export function splitMentions(text: string): readonly (string | Mention)[] {
  const parts: (string | Mention)[] = [];
  const pushPlain = (s: string) => {
    if (s === "") return;
    const last = parts[parts.length - 1];
    if (typeof last === "string") parts[parts.length - 1] = last + s;
    else parts.push(s);
  };
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(START, i);
    if (start < 0) {
      pushPlain(text.slice(i).replace(MARKERS, ""));
      break;
    }
    pushPlain(text.slice(i, start).replace(MARKERS, ""));
    const end = text.indexOf(END, start);
    const body = text.slice(start + 1, end < 0 ? text.length : end);
    const sep = body.indexOf(SEPARATOR);
    if (end < 0 || sep < 0) {
      // Malformed: keep the shown text, or the bare id, without any marker.
      pushPlain((sep < 0 ? body : body.slice(sep + 1)).replace(MARKERS, ""));
    } else {
      parts.push({ company: body.slice(0, sep), text: body.slice(sep + 1) });
    }
    i = end < 0 ? text.length : end + 1;
  }
  return parts;
}

export function stripMentions(text: string): string {
  return splitMentions(text)
    .map((p) => (typeof p === "string" ? p : p.text))
    .join("");
}
