import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApproveApp } from "./App";
import "../popup/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApproveApp />
  </StrictMode>,
);
