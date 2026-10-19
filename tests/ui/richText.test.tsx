import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { markMention } from "../../src/domain/i18n/mentions";
import { RichText } from "../../src/ui/components/RichText";

/** Feature 013: company mentions render as badges (contracts/ui.md "RichText"). */

const game = getBuiltInGame("1830");
const prr = game.companies.find((c) => c.id === "PRR")!;

describe("RichText", () => {
  it("renders a mention as the company badge, with the same text as the plain line", () => {
    const { container } = render(<RichText game={game} text={`Ana compra ${markMention("PRR", "PRR")}`} />);
    const badges = container.querySelectorAll<HTMLElement>(".company-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]!.textContent).toBe("PRR");
    const probe = document.createElement("span");
    probe.style.background = prr.color;
    expect(badges[0]!.style.background).toBe(probe.style.background);
    expect(badges[0]!.classList.contains("company-badge-inline")).toBe(true);
    expect(container.textContent).toBe("Ana compra PRR");
  });

  it("renders a company that is not in the game as plain text", () => {
    const { container } = render(<RichText game={game} text={`Cierra ${markMention("ZZZ", "ZZZ")}`} />);
    expect(container.querySelector(".company-badge")).toBeNull();
    expect(container.textContent).toBe("Cierra ZZZ");
  });

  it("renders a plain string unchanged", () => {
    const { container } = render(<RichText game={game} text="Ana paga $100 al banco" />);
    expect(container.querySelector(".company-badge")).toBeNull();
    expect(container.textContent).toBe("Ana paga $100 al banco");
  });
});
