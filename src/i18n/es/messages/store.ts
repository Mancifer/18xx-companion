import type { AreaText } from "../../contract/domain";
import type { ImportMessages } from "../../contract/messages/import";
import type { StoreMessages } from "../../contract/messages/store";

/** Spanish store and import messages, moved verbatim (feature 014). */

export const store: AreaText<StoreMessages> = {
  "store.nothingToUndo": () => "No hay nada que deshacer",
  "store.confirmRange": ({ count }) => `Se van a deshacer ${count} entradas`,
  "store.persistFailed": () => "No se pudo guardar. Inténtalo de nuevo.",
  "store.invalidAction": () => "Acción no válida",
  "store.noSuchEntry": () => "Esa entrada no existe",
  "store.setupNotUndoable": () => "Esa entrada no se puede deshacer",
  "store.alreadyUndone": () => "Esa entrada ya está deshecha",
};

export const importing: AreaText<ImportMessages> = {
  "import.notCompanion": () => "El archivo no es una partida de 18xx Companion.",
  "import.unknownVersion": () => "Versión de archivo desconocida.",
  "import.newerVersion": ({ version }) => `El archivo es de una versión más nueva de la app (${version}). Actualiza la app.`,
  "import.cannotConvert": ({ version }) => `No se puede convertir un archivo de la versión ${version}.`,
  "import.damaged": ({ path, issue }) => `Archivo dañado: ${issue === "" ? "formato inválido" : `${path}: ${issue}`}`,
  "import.hashMismatch": () => "el estado reproducido no coincide",
};
