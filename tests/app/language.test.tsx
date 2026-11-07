import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider, useLang } from "../../src/app/language";
import { SETTINGS_CHANGED } from "../../src/app/useVoice";

/** Feature 014 data-model §3: the language context. */

function Probe() {
  const { lang, setLang } = useLang();
  return (
    <>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => void setLang("es")}>es</button>
    </>
  );
}

async function chooseSpanish() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "es" }));
    await Promise.resolve();
  });
}

describe("LanguageProvider", () => {
  it("starts with the initial language", () => {
    render(
      <LanguageProvider initial="en" save={() => Promise.resolve()}>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("setLang re-renders, sets <html lang>, saves the choice and announces the change", async () => {
    const save = vi.fn(() => Promise.resolve());
    const changed = vi.fn();
    window.addEventListener(SETTINGS_CHANGED, changed);
    render(
      <LanguageProvider initial="en" save={save}>
        <Probe />
      </LanguageProvider>,
    );
    await chooseSpanish();
    expect(screen.getByTestId("lang").textContent).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(save).toHaveBeenCalledWith({ language: "es" });
    expect(changed).toHaveBeenCalled();
    window.removeEventListener(SETTINGS_CHANGED, changed);
  });

  it("a failed save keeps the new language for this page load and reports the failure", async () => {
    const onSaveError = vi.fn();
    render(
      <LanguageProvider initial="en" save={() => Promise.reject(new Error("disk full"))} onSaveError={onSaveError}>
        <Probe />
      </LanguageProvider>,
    );
    await chooseSpanish();
    expect(screen.getByTestId("lang").textContent).toBe("es");
    expect(onSaveError).toHaveBeenCalled();
  });
});
