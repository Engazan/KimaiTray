type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  const configured = (import.meta.env.VITE_LOG_LEVEL ?? "info") as LogLevel;
  return LEVELS[level] >= (LEVELS[configured] ?? 1);
}

let mod: typeof import("@tauri-apps/plugin-log") | null = null;

export function redactLogMessage(message: string): string {
  return message
    .replace(/(Bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:private-token|authorization|api[_-]?token|token)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/)[^/@\s:]+(?::[^/@\s]*)?@/gi, "$1[REDACTED]@");
}

async function getTauriLog() {
  if (!mod) mod = await import("@tauri-apps/plugin-log");
  return mod;
}

function log(level: LogLevel, msg: string) {
  if (!shouldLog(level)) return;
  const safeMessage = redactLogMessage(msg);
  getTauriLog()
    .then((l) => l[level](safeMessage))
    .catch(() => console[level](safeMessage));
}

export const logger = {
  debug: (msg: string) => log("debug", msg),
  info: (msg: string) => log("info", msg),
  warn: (msg: string) => log("warn", msg),
  error: (msg: string) => log("error", msg),
};
