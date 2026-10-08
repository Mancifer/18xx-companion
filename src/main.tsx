import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/styles/tokens.css";
import "./ui/styles/layout.css";
import "./ui/styles/components.css";
import { App } from "./ui/App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
