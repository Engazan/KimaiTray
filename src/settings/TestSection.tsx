import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import rawChangelog from "../../CHANGELOG.md?raw";
import { loadFavorites, moveFavorites } from "../api/favoritesStore";
import { extractVersionChangelog } from "../api/changelog";
import { showChangelogWindow } from "../api/changelogWindow";
import { Select, buttonClass } from "./Controls";
import { SettingsList, SettingsPage, SettingsRow } from "./SettingsLayout";

interface Props {
  settings: AppSettings;
  appVersion: string;
}

type MoveResult =
  | { type: "moved"; count: number }
  | { type: "nothing" }
  | { type: "error" };

export default function TestSection({ settings, appVersion }: Props) {
  const { t } = useTranslation();
  const connections = settings.connections;

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [fromCount, setFromCount] = useState(0);
  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<MoveResult | null>(null);

  // Default "from" to the active connection (or the first one).
  useEffect(() => {
    if (!fromId && connections.length > 0) {
      const active = connections.find((c) => c.id === settings.activeConnectionId);
      setFromId(active?.id ?? connections[0].id);
    }
  }, [connections, settings.activeConnectionId, fromId]);

  // Default "to" to a different connection than "from".
  useEffect(() => {
    if (connections.length > 1 && (!toId || toId === fromId)) {
      const other = connections.find((c) => c.id !== fromId);
      if (other) setToId(other.id);
    }
  }, [connections, fromId, toId]);

  const fromConn = connections.find((c) => c.id === fromId);
  const toConn = connections.find((c) => c.id === toId);

  // Show how many favorites the source connection currently holds.
  useEffect(() => {
    let cancelled = false;
    if (!fromConn) {
      setFromCount(0);
      return;
    }
    loadFavorites(fromConn.id, fromConn.url).then((f) => {
      if (!cancelled) setFromCount(f.length);
    });
    return () => {
      cancelled = true;
    };
  }, [fromConn, result]);

  const handleMove = useCallback(async () => {
    setMoving(true);
    setResult(null);
    try {
      const count = await moveFavorites(
        fromConn!.id,
        toConn!.id,
        fromConn!.url,
        toConn!.url,
      );
      setResult(count > 0 ? { type: "moved", count } : { type: "nothing" });
    } catch {
      setResult({ type: "error" });
    } finally {
      setMoving(false);
    }
  }, [fromConn, toConn]);

  const connectionOptions = connections.map((c) => ({
    value: c.id,
    label: c.name || c.url,
  }));

  const canMove =
    !!fromConn && !!toConn && fromConn.id !== toConn.id && !moving;
  const previewVersion = appVersion || import.meta.env.VITE_APP_VERSION;

  return (
    <SettingsPage title={t("testSection.title")} description={t("testSection.description")}>
      <SettingsList title={t("testSection.moveFavorites")} description={t("testSection.moveFavoritesDescription")}>
        {connections.length < 2 ? (
          <div data-settings-item className="px-4 py-3 text-[12px] text-[var(--s-fg-muted)]">
            {t("testSection.needTwo")}
          </div>
        ) : (
          <>
            <SettingsRow label={t("testSection.from")}>
              <Select
                ariaLabel={t("testSection.from")}
                value={fromId}
                onChange={(v) => {
                  setFromId(v);
                  setResult(null);
                }}
                options={connectionOptions}
              />
            </SettingsRow>
            <SettingsRow label={t("testSection.to")}>
              <Select
                ariaLabel={t("testSection.to")}
                value={toId}
                onChange={(v) => {
                  setToId(v);
                  setResult(null);
                }}
                options={connectionOptions}
              />
            </SettingsRow>
            <SettingsRow
              label={t("testSection.move")}
              description={
                <>
                  {t("testSection.count", { count: fromCount })}
                  {result?.type === "moved" && (
                    <span className="mt-1 block text-emerald-600 dark:text-emerald-400">
                      {t("testSection.moved", { count: result.count })}
                    </span>
                  )}
                  {result?.type === "nothing" && (
                    <span className="mt-1 block text-[var(--s-fg-muted)]">{t("testSection.nothing")}</span>
                  )}
                  {result?.type === "error" && (
                    <span className="mt-1 block text-red-500 dark:text-red-400">{t("testSection.error")}</span>
                  )}
                </>
              }
            >
              <button
                type="button"
                disabled={!canMove}
                onClick={handleMove}
                className={buttonClass("primary")}
              >
                {t("testSection.move")}
              </button>
            </SettingsRow>
          </>
        )}
      </SettingsList>

      <SettingsList>
        <SettingsRow label={t("testSection.changelog")} description={t("testSection.changelogDescription")}>
          <button
            type="button"
            onClick={() =>
              void showChangelogWindow({
                version: previewVersion,
                body: extractVersionChangelog(rawChangelog, previewVersion) ?? "",
              })
            }
            className={buttonClass()}
          >
            {t("testSection.showChangelog")}
          </button>
        </SettingsRow>
      </SettingsList>
    </SettingsPage>
  );
}
