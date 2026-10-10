import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anthropicReply } from "../../src/voice/providers/anthropic";

/** Feature 005 T008: Anthropic Message → ModelReply (contracts/voice-provider.md §3). */

const recorded = (name: string): Anthropic.Message =>
  JSON.parse(readFileSync(new URL(`./recorded/${name}.json`, import.meta.url), "utf8")) as Anthropic.Message;

const withStop = (stop: string): Anthropic.Message => ({ ...recorded("payout"), stop_reason: stop }) as unknown as Anthropic.Message;

describe("anthropicReply", () => {
  it("maps tool_use blocks to calls in order and drops text", () => {
    const reply = anthropicReply(recorded("compound"), "claude-sonnet-5");
    expect(reply.provider).toBe("anthropic");
    expect(reply.model).toBe("claude-sonnet-5");
    expect(reply.calls.map((c) => c.name)).toEqual(["buyTrain", "runAndPayout"]);
    expect(reply.calls[1]?.input).toEqual({ company: null, parts: [{ part: "revenue", amount: 290 }], mode: "full" });
    expect(JSON.stringify(reply)).not.toContain("Compra y pago.");
  });

  it.each([
    ["refusal", "refused"],
    ["max_tokens", "truncated"],
    ["end_turn", "done"],
    ["tool_use", "done"],
    ["stop_sequence", "done"],
    ["pause_turn", "other"],
  ])("stop_reason %s → %s, keeping the raw reason", (raw, stop) => {
    const reply = anthropicReply(withStop(raw), "claude-sonnet-5");
    expect(reply.stop).toBe(stop);
    expect(reply.rawStop).toBe(raw);
  });

  it("maps usage to neutral tokens with no thinking", () => {
    const message = {
      ...recorded("payout"),
      usage: { input_tokens: 120, output_tokens: 40, cache_creation_input_tokens: 300, cache_read_input_tokens: 6100 },
    } as Anthropic.Message;
    expect(anthropicReply(message, "x").usage).toEqual({ input: 120, output: 40, cacheRead: 6100, cacheWrite: 300, thinking: 0 });
  });

  it("missing cache fields count as 0; the reported model wins over the requested one", () => {
    const message = { ...recorded("payout"), model: "claude-sonnet-5-20261001", usage: { input_tokens: 5, output_tokens: 2 } } as Anthropic.Message;
    const reply = anthropicReply(message, "claude-sonnet-5");
    expect(reply.usage).toEqual({ input: 5, output: 2, cacheRead: 0, cacheWrite: 0, thinking: 0 });
    expect(reply.model).toBe("claude-sonnet-5-20261001");
  });

  it("every recorded response maps without error", () => {
    for (const name of ["amend", "bad-input", "buy-private", "clarification", "confirm", "max-tokens", "next-company", "no-tool"]) {
      expect(anthropicReply(recorded(name), "claude-sonnet-5").provider).toBe("anthropic");
    }
    expect(anthropicReply(recorded("no-tool"), "m").calls).toEqual([]);
  });
});
