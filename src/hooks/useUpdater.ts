import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "../utils/logger";
import { checkForUpdate, installUpdate } from "../api/updater";

interface UpdaterState {
  available: boolean;
  version: string | null;
  body: string | null;
  downloading: boolean;
  checking: boolean;
  error: string | null;
  upToDate: boolean;
  install: (() => Promise<void>) | null;
  checkNow: () => Promise<void>;
}

export function useUpdater(autoUpdate = true): UpdaterState {
  const [state, setState] = useState<Omit<UpdaterState, "checkNow">>({
    available: false,
    version: null,
    body: null,
    downloading: false,
    checking: false,
    error: null,
    upToDate: false,
    install: null,
  });

  const autoUpdateRef = useRef(autoUpdate);
  const checkInFlightRef = useRef<Promise<void> | null>(null);
  autoUpdateRef.current = autoUpdate;

  const doCheck = useCallback(() => {
    if (checkInFlightRef.current) return checkInFlightRef.current;

    const run = async () => {
      setState((s) => ({
        ...s,
        available: false,
        version: null,
        body: null,
        downloading: false,
        checking: true,
        error: null,
        upToDate: false,
        install: null,
      }));

      const runInstall = async (update: Awaited<ReturnType<typeof checkForUpdate>>) => {
        if (!update) return;
      setState((s) => ({ ...s, downloading: true, error: null }));
      try {
          await installUpdate(update);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Update install failed: ${msg}`);
        setState((s) => ({ ...s, downloading: false, error: msg }));
      }
      };

      try {
        const update = await checkForUpdate();

        if (update) {
          logger.info(`Update available: ${update.version}`);
          setState({
            available: true,
            version: update.version,
            body: update.body ?? null,
            downloading: autoUpdateRef.current,
            checking: false,
            error: null,
            upToDate: false,
            install: () => runInstall(update),
          });

          if (autoUpdateRef.current) {
            void runInstall(update);
          }
        } else {
          logger.debug("App is up to date");
          setState((s) => ({ ...s, checking: false, upToDate: true }));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.debug(`Update check skipped: ${msg}`);
        setState((s) => ({ ...s, checking: false, error: msg }));
      }
    };

    const promise = run().finally(() => {
      checkInFlightRef.current = null;
    });
    checkInFlightRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    void doCheck();
  }, [doCheck]);

  return { ...state, checkNow: doCheck };
}
