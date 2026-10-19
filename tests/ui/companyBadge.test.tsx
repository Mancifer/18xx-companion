import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { CompanyBadge } from "../../src/ui/components/CompanyBadge";

/** Feature 013: the badge's label, inline size and hover hint (contracts/ui.md "CompanyBadge"). */

const prr = getBuiltInGame("1830").companies.find((c) => c.id === "PRR")!;

describe("CompanyBadge", () => {
  it("shows the short name over the company color, with the full name as the hint", () => {
    const { container } = render(<CompanyBadge company={prr} />);
    const badge = container.querySelector<HTMLElement>(".company-badge")!;
    expect(badge.textContent).toBe(prr.shortName);
    expect(badge.title).toBe(prr.name);
  });

  it("shows a label instead of the short name, keeping the company colors", () => {
    const { container } = render(<CompanyBadge company={prr} label="Pennsylvania" />);
    const badge = container.querySelector<HTMLElement>(".company-badge")!;
    expect(badge.textContent).toBe("Pennsylvania");
    const probe = document.createElement("span");
    probe.style.background = prr.color;
    probe.style.color = prr.textColor;
    expect(badge.style.background).toBe(probe.style.background);
    expect(badge.style.color).toBe(probe.style.color);
  });

  it("takes the hint from `name` (a major in its second identity)", () => {
    const { container } = render(<CompanyBadge company={prr} name="X" />);
    expect(container.querySelector<HTMLElement>(".company-badge")!.title).toBe("X");
  });

  it("has an inline size for running text", () => {
    const { container } = render(<CompanyBadge company={prr} size="inline" />);
    expect(container.querySelector(".company-badge")!.classList.contains("company-badge-inline")).toBe(true);
  });
});
