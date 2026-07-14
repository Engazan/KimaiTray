import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { initPromise } from "./shared/i18n";
import { logger } from "./utils/logger";
import { ErrorBoundary } from "./components/ErrorBoundary";
import QueryProvider from "./providers/QueryProvider";
import "./index.css";

window.addEventListener("unhandledrejection", (event) => {
  logger.error(`Unhandled promise rejection: ${event.reason}`);
});

window.addEventListener("error", (event) => {
  logger.error(`Uncaught error: ${event.message} at ${event.filename}:${event.lineno}`);
});

const label = getCurrentWindow().label;
document.documentElement.dataset.window = label;
document.documentElement.dataset.os = /Macintosh|Mac OS X/.test(navigator.userAgent)
  ? "macos"
  : /Windows/.test(navigator.userAgent)
    ? "windows"
    : "linux";

async function renderApp() {
  await initPromise;
  const WindowApp =
    label === "settings"
      ? (await import("./windows/Settings")).default
      : (await import("./windows/TrayPopup")).default;
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryProvider>
          <WindowApp />
        </QueryProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

renderApp().catch((error) => {
  logger.error(`Failed to initialize application: ${String(error)}`);
});
