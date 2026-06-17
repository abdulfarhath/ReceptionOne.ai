import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Providers } from "@/providers";
import { App } from "@/App";
import "@/index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
