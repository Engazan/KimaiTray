/**
 * Parses a Kimai datetime string into a Date.
 *
 * Kimai serializes timezone offsets WITHOUT a colon (e.g. "2026-06-17T10:00:00+0200",
 * PHP's DATE_ISO8601 / `Y-m-d\TH:i:sO`). That form is not part of the ECMAScript
 * date format, so WKWebView (Tauri's engine on macOS) does not parse it reliably —
 * which throws off "elapsed since begin" calculations. Normalize "+0200" → "+02:00"
 * so every engine parses the same absolute instant.
 */
export function parseKimaiDate(iso: string): Date {
  return new Date(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

export function formatTime(iso: string): string {
  return parseKimaiDate(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

export function getLocalDayRange(): { begin: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  return {
    begin: `${date}T00:00:00`,
    end: `${date}T23:59:59`,
  };
}

export function differenceInLocalCalendarDays(
  later: Date,
  earlier: Date,
): number {
  const laterDay = Date.UTC(
    later.getFullYear(),
    later.getMonth(),
    later.getDate(),
  );
  const earlierDay = Date.UTC(
    earlier.getFullYear(),
    earlier.getMonth(),
    earlier.getDate(),
  );
  return Math.round((laterDay - earlierDay) / 86_400_000);
}
