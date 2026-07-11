import { check, type Update } from "@tauri-apps/plugin-updater";

let checkInFlight: Promise<Update | null> | null = null;
let installInFlight: Promise<void> | null = null;

/** Share updater work between the tray and settings windows. */
export function checkForUpdate(): Promise<Update | null> {
  if (!checkInFlight) {
    checkInFlight = check().finally(() => {
      checkInFlight = null;
    });
  }
  return checkInFlight;
}

/** Prevent duplicate downloads and relaunch attempts from concurrent controls. */
export function installUpdate(update: Update): Promise<void> {
  if (!installInFlight) {
    installInFlight = update
      .downloadAndInstall()
      .then(async () => {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      })
      .finally(() => {
        installInFlight = null;
      });
  }
  return installInFlight;
}
