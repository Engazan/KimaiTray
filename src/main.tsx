import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { initPromise } from "./shared/i18n";
import { logger } from "./utils/logger";
import { ErrorBoundary } from "./components/ErrorBoundary";
import QueryProvider from "./providers/QueryProvider";
import TrayPopup from "./windows/TrayPopup";
import Settings from "./windows/Settings";
import "./index.css";

window.addEventListener("unhandledrejection", (event) => {
  logger.error(`Unhandled promise rejection: ${event.reason}`);
});

window.addEventListener("error", (event) => {
  logger.error(`Uncaught error: ${event.message} at ${event.filename}:${event.lineno}`);
});

const label = getCurrentWindow().label;
document.documentElement.dataset.window = label;

function App() {
  switch (label) {
    case "settings":
      return (
        <QueryProvider>
          <Settings />
        </QueryProvider>
      );
    case "tray-popup":
    default:
      return (
        <QueryProvider>
          <TrayPopup />
        </QueryProvider>
      );
  }
}

initPromise.then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
});
