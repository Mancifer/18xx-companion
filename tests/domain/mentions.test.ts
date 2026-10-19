import { describe, expect, it } from "vitest";
import { markMention, splitMentions, stripMentions } from "../../src/domain/i18n/mentions";

/** Feature 013: company mentions inside summary strings (data-model.md "Mention"). */

const PRIVATE_USE = /[-]/;

describe("company mentions", () => {
  it("encodes the company and the shown text between private-use markers", () => {
    expect(markMention("PRR", "PRR")).toBe("PRRPRR");
  });

  it("splits a sentence into plain parts and mentions", () => {
    const text = `Ana compra 1 ${markMention("PRR", "PRR")} de la IPO`;
    expect(splitMentions(text)).toEqual(["Ana compra 1 ", { company: "PRR", text: "PRR" }, " de la IPO"]);
    expect(stripMentions(text)).toBe("Ana compra 1 PRR de la IPO");
  });

  it("gives no empty strings around adjacent mentions or at the ends", () => {
    const text = `${markMention("PRR", "PRR")}${markMention("NYC", "New York Central")} y ${markMention("B&O", "B&O")}`;
    expect(splitMentions(text)).toEqual([
      { company: "PRR", text: "PRR" },
      { company: "NYC", text: "New York Central" },
      " y ",
      { company: "B&O", text: "B&O" },
    ]);
  });

  it("keeps the shown text of a marker with no terminator, and never shows the markers", () => {
    expect(splitMentions("x PRRPRR")).toEqual(["x PRR"]);
    expect(stripMentions("x PRRPRR")).toBe("x PRR");
  });

  it("removes a bare start marker with no separator", () => {
    expect(splitMentions("x PRR")).toEqual(["x PRR"]);
    expect(PRIVATE_USE.test(stripMentions("x PRR"))).toBe(false);
  });

  it("leaves a plain string unchanged", () => {
    expect(splitMentions("Ana paga $100 al banco")).toEqual(["Ana paga $100 al banco"]);
    expect(stripMentions("Ana paga $100 al banco")).toBe("Ana paga $100 al banco");
    expect(splitMentions("")).toEqual([]);
  });
});
