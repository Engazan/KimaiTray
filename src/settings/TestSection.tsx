import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { loadFavorites, moveFavorites } from "../api/favoritesStore";
import {
  Divider,
  FieldGroup,
  SectionDescription,
  SectionTitle,
  Select,
} from "./Controls";

interface Props {
  settings: AppSettings;
}

type MoveResult =
  | { type: "moved"; count: number }
  | { type: "nothing" }
  | { type: "error" };

export default function TestSection({ settings }: Props) {
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
    if (!fromConn || !toConn || fromConn.id === toConn.id) return;
    setMoving(true);
    setResult(null);
    try {
      const count = await moveFavorites(
        fromConn.id,
        toConn.id,
        fromConn.url,
        toConn.url,
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

  return (
    <div>
      <SectionTitle>{t("testSection.title")}</SectionTitle>
      <SectionDescription>{t("testSection.description")}</SectionDescription>

      <div className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
        {t("testSection.moveFavorites")}
      </div>
      <div className="mb-2 text-[11px] text-gray-400 dark:text-gray-500">
        {t("testSection.moveFavoritesDescription")}
      </div>

      {connections.length < 2 ? (
        <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
          {t("testSection.needTwo")}
        </div>
      ) : (
        <>
          <FieldGroup label={t("testSection.from")} horizontal>
            <Select
              value={fromId}
              onChange={(v) => {
                setFromId(v);
                setResult(null);
              }}
              options={connectionOptions}
            />
          </FieldGroup>

          <FieldGroup label={t("testSection.to")} horizontal>
            <Select
              value={toId}
              onChange={(v) => {
                setToId(v);
                setResult(null);
              }}
              options={connectionOptions}
            />
          </FieldGroup>

          <Divider />

          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              disabled={!canMove}
              onClick={handleMove}
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-[12px] font-medium
                text-gray-700 transition-colors
                hover:bg-gray-100 active:bg-gray-150
                focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400
                dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("testSection.move")}
            </button>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {t("testSection.count", { count: fromCount })}
            </span>
          </div>

          {result?.type === "moved" && (
            <span className="text-[11px] text-green-600 dark:text-green-400">
              {t("testSection.moved", { count: result.count })}
            </span>
          )}
          {result?.type === "nothing" && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {t("testSection.nothing")}
            </span>
          )}
          {result?.type === "error" && (
            <span className="text-[11px] text-red-500 dark:text-red-400">
              {t("testSection.error")}
            </span>
          )}
        </>
      )}
    </div>
  );
}
