import type { ui } from "../es/ui";

/**
 * Feature 014 (contracts/catalogs.md): what every language provides for the UI. The shape is
 * taken from the Spanish text, which was moved verbatim from the components, so a key or a
 * parameter missing in another language is a type error.
 */
export type UiText = typeof ui;
