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

// Coarse OS tag for platform-scoped CSS (e.g. rounded popup corners on
// non-macOS). Set synchronously from navigator.platform so it is present
// before first paint; the finer Wayland probe (usePlatform) runs later.
const platformName = navigator.platform.toUpperCase();
document.documentElement.dataset.os = platformName.includes("MAC")
  ? "macos"
  : platformName.includes("WIN")
    ? "windows"
    : platformName.includes("LINUX")
      ? "linux"
      : "unknown";

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
