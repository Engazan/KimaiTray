import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { createKimaiClient } from "../api/kimaiClient";
import { getConnectionToken } from "../api/connectionTokenStore";
import { getActivities } from "../api/activityApi";
import { getProjects } from "../api/projectApi";
import SearchableSelect from "../components/SearchableSelect";
import {
  NumberInput,
  SectionDescription,
  TextInput,
  Toggle,
} from "../settings/Controls";
import { SettingsCard, SettingsList, SettingsRow, SettingsRowStacked } from "../settings/SettingsLayout";
import { useCategoryConfig } from "./useCategoryConfig";
import { cloneDefaultCategoryConfig } from "./defaultCategoryConfig";
import { normalizeCategories } from "./categoryNormalize";
import { fetchRemoteCategoryConfig } from "./categoryRemoteSource";
import type { CategoryConfig } from "./types";
import {
  CATEGORY_COLORS,
  CATEGORY_ICON_KEYS,
  CategoryPictogram,
  categoryColorValue,
  type CategoryColor,
  type CategoryIcon,
} from "./CategoryVisual";

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
  onBlur,
  disabled,
  dangerActive,
  title,
  children,
}: {
  onClick: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  dangerActive?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={onBlur}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        dangerActive
          ? "bg-red-50 text-red-600 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900"
          : "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function CategoryVisualPicker({
  icon,
  color,
  fallback,
  onIconChange,
  onColorChange,
}: {
  icon?: CategoryIcon;
  color?: CategoryColor;
  fallback: number;
  onIconChange: (icon?: CategoryIcon) => void;
  onColorChange: (color?: CategoryColor) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const accent = categoryColorValue(color);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        title={t("categoryMode.editVisual")}
        aria-label={t("categoryMode.editVisual")}
        className="group flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[11px] font-semibold tabular-nums text-gray-400 shadow-sm ring-1 ring-gray-200 transition-transform hover:scale-105 hover:ring-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:bg-gray-800 dark:ring-gray-700 dark:hover:ring-gray-600"
        style={accent ? { color: accent, backgroundColor: `${accent}18` } : undefined}
      >
        {icon ? <CategoryPictogram icon={icon} /> : fallback}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("categoryMode.editVisual")}
          className="absolute left-0 top-full z-40 mt-2 w-[252px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl shadow-black/10 dark:border-gray-700 dark:bg-[#252525] dark:shadow-black/30"
        >
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t("categoryMode.categoryIcon")}
          </span>
          <div className="grid grid-cols-5 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onIconChange(undefined);
              }}
              title={t("categoryMode.noIcon")}
              aria-label={t("categoryMode.noIcon")}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                !icon
                  ? "bg-[var(--accent-light)] text-[var(--accent)]"
                  : "text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06]"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" d="M5 19 19 5" />
              </svg>
            </button>
            {CATEGORY_ICON_KEYS.map((optionIcon) => (
              <button
                key={optionIcon}
                type="button"
                onClick={() => {
                  onIconChange(optionIcon);
                }}
                title={t("categoryMode.iconOption", { name: optionIcon })}
                aria-label={t("categoryMode.iconOption", { name: optionIcon })}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  icon === optionIcon
                    ? "bg-[var(--accent-light)] text-[var(--accent)]"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                }`}
              >
                <CategoryPictogram icon={optionIcon} />
              </button>
            ))}
          </div>
          <div className="my-3 border-t border-gray-100 dark:border-gray-700" />
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t("categoryMode.categoryColor")}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onColorChange(undefined)}
              title={t("categoryMode.noColor")}
              aria-label={t("categoryMode.noColor")}
              className={`flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                !color ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-gray-300 dark:border-gray-600"
              }`}
            >
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" d="M5 19 19 5" />
              </svg>
            </button>
            {CATEGORY_COLORS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onColorChange(option.key)}
                title={t("categoryMode.colorOption", { name: option.key })}
                aria-label={t("categoryMode.colorOption", { name: option.key })}
                className={`h-7 w-7 rounded-full border-2 border-white shadow-sm transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:border-gray-800 ${
                  color === option.key ? "ring-2 ring-gray-400 ring-offset-1 dark:ring-gray-500 dark:ring-offset-[#252525]" : ""
                }`}
                style={{ backgroundColor: option.value }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
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
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
  const updateCategory = (
    ci: number,
    patch: Partial<Pick<CategoryConfig["categories"][number], "label" | "icon" | "color">>,
  ) => {
    const next = clone(config);
    next.categories[ci] = { ...next.categories[ci], ...patch };
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
    <div className="space-y-5">
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

      <SettingsList title={t("categoryMode.behaviorTitle")} allowOverflow>
        <SettingsRowStacked
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
        </SettingsRowStacked>
        <SettingsRow
          label={t("categoryMode.continueWindow")}
          description={t("categoryMode.continueWindowHint")}
        >
          <NumberInput
            value={config.continueWindowMinutes}
            onChange={(v) =>
              updateConfig({
                ...config,
                continueWindowMinutes: Math.min(240, Math.max(0, v)),
              })
            }
            min={0}
            max={240}
            suffix={t("categoryMode.minutes")}
          />
        </SettingsRow>
      </SettingsList>

      <SettingsList title={t("categoryMode.sourceTitle")}>
        <SettingsRow
          label={t("categoryMode.sourceUrl")}
          description={t("categoryMode.sourceUrlHint")}
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
        </SettingsRow>

        {urlEnabled && <div className="space-y-3 px-4 py-3">
          <TextInput
            value={config.sourceUrl ?? ""}
            onChange={(v) => updateConfig({ ...config, sourceUrl: v })}
            placeholder={t("categoryMode.sourceUrlPlaceholder")}
            type="url"
          />
          {config.sourceUrl?.trim() && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50"
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
          <div className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-1.5a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12V16.5Z" />
            </svg>
            <span>{t("categoryMode.remoteManaged")}</span>
          </div>
        </div>}
      </SettingsList>

      {/* Category tree editor — hidden while categories are managed from a URL */}
      {!urlEnabled && (
        <SettingsCard
          title={t("categoryMode.categoriesTitle")}
          description={t("categoryMode.categoriesHint")}
          className="space-y-3"
        >
        {loaded &&
          config.categories.map((cat, ci) => (
            <div
              key={cat.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2 rounded-t-xl border-b border-gray-100 bg-gray-50/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/40">
                <CategoryVisualPicker
                  icon={cat.icon}
                  color={cat.color}
                  fallback={ci + 1}
                  onIconChange={(icon) => updateCategory(ci, { icon })}
                  onColorChange={(color) => updateCategory(ci, { color })}
                />
                <div className="flex-1 min-w-0">
                  <TextInput
                    value={cat.label}
                    onChange={(v) => updateCategory(ci, { label: v })}
                    placeholder={t("categoryMode.categoryNamePlaceholder")}
                  />
                </div>
                <IconButton
                  onClick={() => moveCategory(ci, -1)}
                  disabled={ci === 0}
                  title={t("categoryMode.moveUp")}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  </svg>
                </IconButton>
                <IconButton
                  onClick={() => moveCategory(ci, 1)}
                  disabled={ci === config.categories.length - 1}
                  title={t("categoryMode.moveDown")}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </IconButton>
                <IconButton
                  onClick={() => {
                    const key = `category-${cat.id}`;
                    if (deleteConfirm === key) {
                      removeCategory(ci);
                      setDeleteConfirm(null);
                    } else {
                      setDeleteConfirm(key);
                    }
                  }}
                  onBlur={() => setDeleteConfirm(null)}
                  dangerActive={deleteConfirm === `category-${cat.id}`}
                  title={deleteConfirm === `category-${cat.id}` ? t("categoryMode.confirmDelete") : t("categoryMode.deleteCategory")}
                >
                  {deleteConfirm === `category-${cat.id}` ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 hover:text-red-500 dark:hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.327L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0V4.477c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  )}
                </IconButton>
              </div>

              {/* Leaves */}
              <div className="space-y-2.5 p-3">
                {cat.children.map((leaf, li) => (
                  <div key={leaf.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/30">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {t("categoryMode.subcategoryLabel", { number: li + 1 })}
                      </span>
                      <IconButton
                        onClick={() => {
                          const key = `leaf-${leaf.id}`;
                          if (deleteConfirm === key) {
                            removeLeaf(ci, li);
                            setDeleteConfirm(null);
                          } else {
                            setDeleteConfirm(key);
                          }
                        }}
                        onBlur={() => setDeleteConfirm(null)}
                        dangerActive={deleteConfirm === `leaf-${leaf.id}`}
                        title={deleteConfirm === `leaf-${leaf.id}` ? t("categoryMode.confirmDelete") : t("categoryMode.deleteLeaf")}
                      >
                        {deleteConfirm === `leaf-${leaf.id}` ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4 hover:text-red-500 dark:hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.327L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0V4.477c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        )}
                      </IconButton>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block min-w-0">
                        <span className="mb-1.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{t("categoryMode.displayName")}</span>
                        <TextInput
                          value={leaf.label}
                          onChange={(v) => updateLeaf(ci, li, { label: v })}
                          placeholder={t("categoryMode.leafNamePlaceholder")}
                        />
                      </label>
                      <div className="min-w-0">
                        <span className="mb-1.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{t("categoryMode.activityMapping")}</span>
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
                      </div>
                    </div>
                    <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 border-t border-gray-200/70 pt-3 dark:border-gray-700/70">
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {t("categoryMode.requiresProject")}
                      </span>
                        <Toggle
                          checked={leaf.requiresProject}
                          onChange={(v) => updateLeaf(ci, li, { requiresProject: v })}
                        />
                    </label>
                  </div>
                ))}
                {cat.children.length === 0 && (
                  <p className="py-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
                    {t("categoryMode.noSubcategories")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => addLeaf(ci)}
                  className="flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  {t("categoryMode.addLeaf")}
                </button>
              </div>
            </div>
          ))}

        {loaded && config.categories.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center dark:border-gray-700">
            <p className="text-[12px] text-gray-500 dark:text-gray-400">{t("categoryMode.noCategoriesEditor")}</p>
          </div>
        )}

        <button
          type="button"
          onClick={addCategory}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-3 py-2.5 text-[12px] font-semibold text-gray-500 hover:border-[var(--accent)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)] dark:border-gray-600 dark:bg-gray-800/20 dark:text-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("categoryMode.addCategory")}
        </button>
        </SettingsCard>
      )}

      {/* Import / export / reset — hidden while categories are managed from a URL */}
      {!urlEnabled && (
        <SettingsCard
          title={t("categoryMode.dataToolsTitle")}
          description={t("categoryMode.dataToolsHint")}
        >
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
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
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
        </SettingsCard>
      )}
    </div>
  );
}
