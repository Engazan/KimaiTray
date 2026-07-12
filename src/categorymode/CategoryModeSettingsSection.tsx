import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { createKimaiClient } from "../api/kimaiClient";
import { getConnectionToken } from "../api/connectionTokenStore";
import { getActivities } from "../api/activityApi";
import { getProjects } from "../api/projectApi";
import SearchableSelect from "../components/SearchableSelect";
import {
  Divider,
  FieldGroup,
  NumberInput,
  SectionDescription,
  TextInput,
  Toggle,
} from "../settings/Controls";
import { useCategoryConfig } from "./useCategoryConfig";
import { cloneDefaultCategoryConfig } from "./defaultCategoryConfig";
import { normalizeCategories } from "./categoryNormalize";
import { fetchRemoteCategoryConfig } from "./categoryRemoteSource";
import type { CategoryConfig } from "./types";

interface Props {
  /** Connection whose Category Mode categories are being configured. */
  connectionId: string;
  /** Base URL of that connection (used to build the Kimai client). */
  url: string;
  /** Display name of the connection, for the section description. */
  name?: string;
}

const clone = (c: CategoryConfig): CategoryConfig => JSON.parse(JSON.stringify(c));
const genId = () => crypto.randomUUID();

/** Small square icon button used for reorder/delete row actions. */
function IconButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1 rounded text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
    >
      {children}
    </button>
  );
}

export default function CategoryModeSettingsSection({ connectionId, url, name }: Props) {
  const { t } = useTranslation();
  const [token, setToken] = useState("");

  // Load the connection's stored token so activities/projects can be fetched
  // for the dropdowns.
  useEffect(() => {
    let cancelled = false;
    setToken("");
    getConnectionToken(connectionId, url)
      .then((tk) => {
        if (!cancelled) {
          setToken(tk ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setToken("");
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId, url]);

  const { config, loaded, updateConfig } = useCategoryConfig(connectionId);
  // Remote URL import is "on" when sourceUrl is defined (even as an empty string,
  // meaning the toggle is on but no URL typed yet). Toggling off clears it.
  const urlEnabled = config.sourceUrl !== undefined;

  const client = useMemo(
    () =>
      url && token && connectionId
        ? createKimaiClient(url, token, connectionId)
        : null,
    [url, token, connectionId],
  );

  const activitiesQ = useQuery({
    queryKey: ["activities", client?.cacheScope],
    queryFn: () => getActivities(client!),
    enabled: !!client,
    staleTime: 5 * 60 * 1000,
  });

  const projectsQ = useQuery({
    queryKey: ["projects", client?.cacheScope],
    queryFn: () => getProjects(client!),
    enabled: !!client,
    staleTime: 5 * 60 * 1000,
  });

  const activityNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of activitiesQ.data ?? []) {
      if (!seen.has(a.name)) {
        seen.add(a.name);
        out.push(a.name);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [activitiesQ.data]);

  const projectOptions = useMemo(
    () =>
      (projectsQ.data ?? [])
        .filter((p) => p.visible !== false)
        .map((p) => ({ value: p.id, label: p.name })),
    [projectsQ.data],
  );

  // ── JSON import/export ──────────────────────────────────────────
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);

  const handleSyncNow = async () => {
    const url = config.sourceUrl?.trim();
    if (!url) return;
    setSyncing(true);
    setSyncError(false);
    const remote = await fetchRemoteCategoryConfig(url, connectionId);
    setSyncing(false);
    if (!remote) {
      setSyncError(true);
      return;
    }
    updateConfig({
      ...config,
      categories: remote.categories,
      continueWindowMinutes:
        remote.continueWindowMinutes ?? config.continueWindowMinutes,
      sourceSyncedAt: Math.floor(Date.now() / 1000),
    });
  };

  const openJson = () => {
    setJsonDraft(JSON.stringify(config, null, 2));
    setJsonError(null);
    setJsonOpen(true);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.categories)) {
        setJsonError(t("categoryMode.jsonInvalid"));
        return;
      }
      const defaultProjectId =
        typeof parsed.defaultProjectId === "number"
          ? parsed.defaultProjectId
          : typeof parsed.internalProjectId === "number"
            ? parsed.internalProjectId
            : null;
      updateConfig({
        categories: normalizeCategories(parsed.categories),
        defaultProjectId,
        continueWindowMinutes:
          typeof parsed.continueWindowMinutes === "number"
            ? parsed.continueWindowMinutes
            : 15,
      });
      setJsonError(null);
      setJsonOpen(false);
    } catch {
      setJsonError(t("categoryMode.jsonInvalid"));
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // ── config mutations ────────────────────────────────────────────
  const setCategoryLabel = (ci: number, label: string) => {
    const next = clone(config);
    next.categories[ci].label = label;
    updateConfig(next);
  };
  const addCategory = () => {
    const next = clone(config);
    next.categories.push({ id: genId(), label: "", children: [] });
    updateConfig(next);
  };
  const removeCategory = (ci: number) => {
    const next = clone(config);
    next.categories.splice(ci, 1);
    updateConfig(next);
  };
  const moveCategory = (ci: number, dir: -1 | 1) => {
    const target = ci + dir;
    if (target < 0 || target >= config.categories.length) return;
    const next = clone(config);
    [next.categories[ci], next.categories[target]] = [
      next.categories[target],
      next.categories[ci],
    ];
    updateConfig(next);
  };

  const addLeaf = (ci: number) => {
    const next = clone(config);
    next.categories[ci].children.push({
      id: genId(),
      label: "",
      activityName: "",
      requiresProject: false,
    });
    updateConfig(next);
  };
  const removeLeaf = (ci: number, li: number) => {
    const next = clone(config);
    next.categories[ci].children.splice(li, 1);
    updateConfig(next);
  };
  const updateLeaf = (
    ci: number,
    li: number,
    patch: Partial<CategoryConfig["categories"][number]["children"][number]>,
  ) => {
    const next = clone(config);
    next.categories[ci].children[li] = {
      ...next.categories[ci].children[li],
      ...patch,
    };
    updateConfig(next);
  };

  if (!connectionId) {
    return (
      <div>
        <SectionDescription>{t("categoryMode.settingsDescription")}</SectionDescription>
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-[12px] text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
          {t("categoryMode.noConnection")}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionDescription>
        {t("categoryMode.settingsDescription", { name: name ?? "" })}
      </SectionDescription>

      {!activitiesQ.isLoading && activityNames.length === 0 && (
        <div className="mb-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 px-2.5 py-1.5">
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
            {t("categoryMode.activitiesUnavailable")}
          </p>
        </div>
      )}

      <FieldGroup
        label={t("categoryMode.defaultProject")}
        description={t("categoryMode.defaultProjectHint")}
      >
        <SearchableSelect
          options={projectOptions}
          value={config.defaultProjectId}
          onChange={(v) => updateConfig({ ...config, defaultProjectId: v })}
          placeholder={t("categoryMode.selectDefaultProject")}
          allowEmpty
          emptyLabel={t("categoryMode.noDefaultProject")}
        />
      </FieldGroup>

      <FieldGroup
        label={t("categoryMode.continueWindow")}
        description={t("categoryMode.continueWindowHint")}
        horizontal
      >
        <NumberInput
          value={config.continueWindowMinutes}
          onChange={(v) =>
            updateConfig({
              ...config,
              continueWindowMinutes: Math.max(0, v),
            })
          }
          min={0}
          max={240}
          suffix={t("categoryMode.minutes")}
        />
      </FieldGroup>

      <FieldGroup
        label={t("categoryMode.sourceUrl")}
        description={t("categoryMode.sourceUrlHint")}
        horizontal
      >
        <Toggle
          checked={urlEnabled}
          onChange={(on) => {
            setSyncError(false);
            updateConfig({
              ...config,
              sourceUrl: on ? (config.sourceUrl ?? "") : undefined,
              sourceSyncedAt: on ? config.sourceSyncedAt : undefined,
            });
          }}
        />
      </FieldGroup>

      {urlEnabled && (
        <div className="space-y-2 pb-2">
          <TextInput
            value={config.sourceUrl ?? ""}
            onChange={(v) => updateConfig({ ...config, sourceUrl: v })}
            placeholder={t("categoryMode.sourceUrlPlaceholder")}
            type="url"
          />
          {config.sourceUrl?.trim() && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing}
                className="rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none disabled:opacity-50"
              >
                {syncing ? t("categoryMode.syncing") : t("categoryMode.syncNow")}
              </button>
              <span className="text-[11px]">
                {syncError ? (
                  <span className="text-red-500 dark:text-red-400">
                    {t("categoryMode.syncFailed")}
                  </span>
                ) : config.sourceSyncedAt ? (
                  <span className="text-gray-400 dark:text-gray-500">
                    {t("categoryMode.lastSynced", {
                      time: new Date(config.sourceSyncedAt * 1000).toLocaleString(),
                    })}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">
                    {t("categoryMode.neverSynced")}
                  </span>
                )}
              </span>
            </div>
          )}
          <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-snug">
            {t("categoryMode.remoteManaged")}
          </p>
        </div>
      )}

      {/* Category tree editor — hidden while categories are managed from a URL */}
      {!urlEnabled && (
        <>
      <Divider />

      <div className="space-y-3">
        {loaded &&
          config.categories.map((cat, ci) => (
            <div
              key={cat.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex-1 min-w-0">
                  <TextInput
                    value={cat.label}
                    onChange={(v) => setCategoryLabel(ci, v)}
                    placeholder={t("categoryMode.categoryNamePlaceholder")}
                  />
                </div>
                <IconButton
                  onClick={() => moveCategory(ci, -1)}
                  disabled={ci === 0}
                  title={t("categoryMode.moveUp")}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  </svg>
                </IconButton>
                <IconButton
                  onClick={() => moveCategory(ci, 1)}
                  disabled={ci === config.categories.length - 1}
                  title={t("categoryMode.moveDown")}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </IconButton>
                <IconButton onClick={() => removeCategory(ci)} title={t("categoryMode.deleteCategory")}>
                  <svg className="h-3.5 w-3.5 hover:text-red-500 dark:hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              </div>

              {/* Leaves */}
              <div className="space-y-1.5 pl-2 border-l border-gray-100 dark:border-gray-800">
                {cat.children.map((leaf, li) => (
                  <div key={leaf.id} className="flex items-start gap-1.5">
                    <div className="flex-1 min-w-0 space-y-1">
                      <TextInput
                        value={leaf.label}
                        onChange={(v) => updateLeaf(ci, li, { label: v })}
                        placeholder={t("categoryMode.leafNamePlaceholder")}
                      />
                      {activityNames.length > 0 ? (
                        <SearchableSelect
                          options={(activityNames.includes(leaf.activityName) || !leaf.activityName
                            ? activityNames
                            : [leaf.activityName, ...activityNames]
                          ).map((n) => ({ value: n, label: n }))}
                          value={leaf.activityName || null}
                          onChange={(v) => updateLeaf(ci, li, { activityName: v ?? "" })}
                          placeholder={t("categoryMode.selectActivity")}
                        />
                      ) : (
                        <TextInput
                          value={leaf.activityName}
                          onChange={(v) => updateLeaf(ci, li, { activityName: v })}
                          placeholder={t("categoryMode.activityNamePlaceholder")}
                        />
                      )}
                      <label className="flex items-center gap-2 pt-0.5">
                        <Toggle
                          checked={leaf.requiresProject}
                          onChange={(v) => updateLeaf(ci, li, { requiresProject: v })}
                        />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {t("categoryMode.requiresProject")}
                        </span>
                      </label>
                    </div>
                    <IconButton onClick={() => removeLeaf(ci, li)} title={t("categoryMode.deleteLeaf")}>
                      <svg className="h-3.5 w-3.5 hover:text-red-500 dark:hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </IconButton>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addLeaf(ci)}
                  className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:opacity-80 transition-opacity focus:outline-none"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  {t("categoryMode.addLeaf")}
                </button>
              </div>
            </div>
          ))}

        <button
          type="button"
          onClick={addCategory}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors focus:outline-none"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("categoryMode.addCategory")}
        </button>
      </div>
        </>
      )}

      {/* Import / export / reset — hidden while categories are managed from a URL */}
      {!urlEnabled && (
        <>
      <Divider />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyJson}
          className="rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none"
        >
          {copied ? t("categoryMode.copied") : t("categoryMode.exportJson")}
        </button>
        <button
          type="button"
          onClick={() => (jsonOpen ? setJsonOpen(false) : openJson())}
          className="rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none"
        >
          {t("categoryMode.importJson")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (resetConfirm) {
              updateConfig(cloneDefaultCategoryConfig());
              setResetConfirm(false);
            } else {
              setResetConfirm(true);
            }
          }}
          onBlur={() => setResetConfirm(false)}
          className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus:outline-none ${
            resetConfirm
              ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400"
              : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          {resetConfirm ? t("categoryMode.resetConfirm") : t("categoryMode.resetDefault")}
        </button>
      </div>

      {jsonOpen && (
        <div className="mt-2 space-y-2">
          <textarea
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            rows={10}
            spellCheck={false}
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-mono text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          />
          {jsonError && (
            <p className="text-[11px] text-red-500 dark:text-red-400">{jsonError}</p>
          )}
          <button
            type="button"
            onClick={applyJson}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors focus:outline-none"
          >
            {t("categoryMode.applyJson")}
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}
