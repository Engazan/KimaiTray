import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { getProjects } from "../api/projectApi";
import type { StartTaskPayload } from "../hooks/useStartTask";
import type { KimaiTimesheetEntry } from "../api/kimaiTypes";
import { useCategoryConfig } from "./useCategoryConfig";
import { useCategoryActivityMapping } from "./useCategoryActivityMapping";
import { useCategoryRemoteSync } from "./useCategoryRemoteSync";
import { loadCategoryLastActivity, saveCategoryLastActivity } from "./categoryLastActivityStore";
import type { Category, CategoryLeaf, CategoryLastActivity } from "./types";
import CategoryButton from "./CategoryButton";
import { CategoryPictogram, categoryColorValue, type CategoryColor, type CategoryIcon } from "./CategoryVisual";

interface CategoryModePanelProps {
  client: KimaiClient;
  connectionId: string;
  hasActiveTimer: boolean;
  startTask: (
    payload: StartTaskPayload,
    trackingKey?: string,
  ) => Promise<KimaiTimesheetEntry | null>;
  startingKey: string | null;
  disabled: boolean;
}

type View = "main" | "sub" | "project";

// Section header matching the favorites/recent list style.
function Header({
  title,
  onBack,
  icon,
  color,
}: {
  title: string;
  onBack?: () => void;
  icon?: CategoryIcon;
  color?: CategoryColor;
}) {
  const accent = categoryColorValue(color);
  return (
    <div className="relative flex h-[30px] shrink-0 items-center px-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-2.5 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}
      <div
        className={`flex min-w-0 items-center gap-1.5 ${
          onBack ? "pl-6" : ""
        }`}
      >
        {icon && (
          <span style={accent ? { color: accent } : undefined}>
            <CategoryPictogram icon={icon} className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {title}
        </span>
      </div>
    </div>
  );
}

export default function CategoryModePanel({
  client,
  connectionId,
  hasActiveTimer,
  startTask,
  startingKey,
  disabled,
}: CategoryModePanelProps) {
  const { t } = useTranslation();
  const { config } = useCategoryConfig(connectionId);
  const mapping = useCategoryActivityMapping(client);
  // Keep the category tree in sync with the configured remote URL (hourly).
  useCategoryRemoteSync(connectionId, config.sourceUrl);

  const [view, setView] = useState<View>("main");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [pendingLeaf, setPendingLeaf] = useState<CategoryLeaf | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [last, setLast] = useState<CategoryLastActivity | null>(null);
  const lastRef = useRef<CategoryLastActivity | null>(null);
  lastRef.current = last;

  // Load the "continue last activity" snapshot on mount / connection change.
  useEffect(() => {
    let cancelled = false;
    loadCategoryLastActivity(connectionId).then((l) => {
      if (!cancelled) setLast(l);
    });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  // When a running timer stops, stamp the stop time so the "continue" window is
  // measured from the stop (FR6), and persist it so it survives a restart.
  const prevActiveRef = useRef(hasActiveTimer);
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = hasActiveTimer;
    const snap = lastRef.current;
    if (wasActive && !hasActiveTimer && snap && snap.stoppedAt == null) {
      const updated = { ...snap, stoppedAt: Math.floor(Date.now() / 1000) };
      setLast(updated);
      saveCategoryLastActivity(connectionId, updated);
    }
  }, [hasActiveTimer, connectionId]);

  const projectsQ = useQuery({
    queryKey: ["projects", client.cacheScope],
    queryFn: () => getProjects(client),
    enabled: view === "project",
    staleTime: 5 * 60 * 1000,
  });

  // Only offer projects the pending leaf's activity is actually valid for
  // (global activity → every project; project-scoped → just those projects).
  const filteredProjects = useMemo(() => {
    const all = (projectsQ.data ?? []).filter((p) => p.visible !== false);
    const valid = pendingLeaf
      ? all.filter((p) => mapping.resolve(pendingLeaf.activityName, p.id) != null)
      : all;
    const q = projectFilter.trim().toLowerCase();
    return q ? valid.filter((p) => p.name.toLowerCase().includes(q)) : valid;
  }, [projectsQ.data, projectFilter, pendingLeaf, mapping]);

  const resetToMain = () => {
    setView("main");
    setActiveCategory(null);
    setPendingLeaf(null);
    setProjectFilter("");
  };

  // Record a just-started category activity as the "last" one (running: no stop
  // time yet). Used by both the leaf-start flow and the "continue" button.
  const recordStart = (snap: CategoryLastActivity) => {
    const running: CategoryLastActivity = { ...snap, stoppedAt: undefined };
    setLast(running);
    saveCategoryLastActivity(connectionId, running);
  };

  const startLeaf = async (leaf: CategoryLeaf, projectId: number) => {
    const activityId = mapping.resolve(leaf.activityName, projectId);
    if (activityId == null) return;
    const started = await startTask(
      {
        projectId,
        activityId,
        tags: leaf.tags?.length ? leaf.tags : undefined,
        label: leaf.label,
      },
      leaf.id,
    );
    if (!started) return;
    recordStart({
      leafId: leaf.id,
      label: leaf.label,
      projectId,
      activityId,
      tags: leaf.tags,
      startedAt: Math.floor(Date.now() / 1000),
    });
    resetToMain();
  };

  const handleLeafClick = (leaf: CategoryLeaf) => {
    if (!mapping.has(leaf.activityName)) return; // no such activity → disabled
    if (leaf.requiresProject) {
      setPendingLeaf(leaf);
      setProjectFilter("");
      setView("project");
      return;
    }
    if (config.defaultProjectId == null) return; // default project not set
    void startLeaf(leaf, config.defaultProjectId);
  };

  const continueLast =
    !hasActiveTimer &&
    last != null &&
    last.stoppedAt != null &&
    Date.now() / 1000 - last.stoppedAt <= config.continueWindowMinutes * 60;

  return (
    <div className="mt-1.5">
      {view === "main" && <Header title={t("categoryMode.prompt")} />}

      {view === "sub" && activeCategory && (
          <Header
            title={activeCategory.label}
            onBack={resetToMain}
            icon={activeCategory.icon}
            color={activeCategory.color}
          />
      )}

      {(view === "main" || view === "sub") && (
        <div className="relative">
          {/* The main list remains as an inert sizing layer while drilling down.
              This keeps the category and subcategory views exactly the same height. */}
          <div
            inert={view !== "main"}
            aria-hidden={view !== "main"}
            className={view === "main" ? "" : "invisible"}
          >
            <div className="px-1.5 pb-1">
              {config.categories.map((cat) => (
                <CategoryButton
                  key={cat.id}
                  label={cat.label}
                  onClick={() => {
                    setActiveCategory(cat);
                    setView("sub");
                  }}
                  disabled={disabled}
                  drilldown
                  icon={cat.icon}
                  color={cat.color}
                />
              ))}
              {config.categories.length === 0 && (
                <p className="px-2.5 py-3 text-[11px] text-gray-400 dark:text-gray-500">
                  {t("categoryMode.noCategories")}
                </p>
              )}
            </div>
            {continueLast && last && (
              <div className="mx-3 border-t border-gray-100 px-0 pb-1 pt-1 dark:border-gray-800">
                <CategoryButton
                  label={t("categoryMode.continueLast", { label: last.label })}
                  onClick={() => {
                    void (async () => {
                      const started = await startTask(
                        {
                          projectId: last.projectId,
                          activityId: last.activityId,
                          tags: last.tags?.length ? last.tags : undefined,
                          label: last.label,
                        },
                        last.leafId,
                      );
                      if (started) {
                        recordStart({
                          ...last,
                          startedAt: Math.floor(Date.now() / 1000),
                        });
                      }
                    })();
                  }}
                  disabled={disabled}
                  isStarting={startingKey === last.leafId}
                />
              </div>
            )}
          </div>

          {view === "sub" && activeCategory && (
            <div className="absolute inset-0 overflow-y-auto overscroll-contain px-1.5 pb-1">
            {activeCategory.children.map((leaf) => {
              // No warnings while activities are still loading — avoids flashing
              // a false "activity missing" on every leaf before the fetch settles.
              const activityMissing =
                !mapping.isLoading && !mapping.has(leaf.activityName);
              const needsDefaultProject =
                !leaf.requiresProject && config.defaultProjectId == null;
              // Internal leaf whose activity isn't valid for the default project
              // (activity exists but is scoped to a different project, not global).
              const internalUnresolvable =
                !leaf.requiresProject &&
                config.defaultProjectId != null &&
                !mapping.isLoading &&
                !activityMissing &&
                mapping.resolve(leaf.activityName, config.defaultProjectId) == null;
              const warning =
                activityMissing || needsDefaultProject || internalUnresolvable;
              const sublabel = needsDefaultProject
                ? t("categoryMode.defaultProjectMissing")
                : activityMissing || internalUnresolvable
                  ? t("categoryMode.activityMissing")
                  : undefined;
              return (
                <CategoryButton
                  key={leaf.id}
                  label={leaf.label}
                  sublabel={sublabel}
                  onClick={() => handleLeafClick(leaf)}
                  disabled={disabled || warning || mapping.isLoading}
                  warning={warning}
                  isStarting={startingKey === leaf.id}
                />
              );
            })}
            </div>
          )}
        </div>
      )}

      {view === "project" && pendingLeaf && (
        <>
          <Header
            title={t("categoryMode.selectProjectFor", { label: pendingLeaf.label })}
            onBack={() => {
              setPendingLeaf(null);
              setView("sub");
            }}
          />
          <div className="px-3 pb-1.5">
            <input
              type="text"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              placeholder={t("categoryMode.searchProject")}
              autoFocus
              className="w-full rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-white/[0.08] px-3 py-1.5 text-[12px] text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none transition-colors"
            />
          </div>
          <div className="px-1.5 pb-1 max-h-[180px] overflow-y-auto overscroll-contain">
            {projectsQ.isLoading ? (
              <p className="px-2.5 py-3 text-[11px] text-gray-400 dark:text-gray-500">
                {t("common.loading")}
              </p>
            ) : filteredProjects.length === 0 ? (
              <p className="px-2.5 py-3 text-[11px] text-gray-400 dark:text-gray-500">
                {t("categoryMode.noProjects")}
              </p>
            ) : (
              filteredProjects.map((p) => (
                <CategoryButton
                  key={p.id}
                  label={p.name}
                  onClick={() => startLeaf(pendingLeaf, p.id)}
                  disabled={disabled}
                  isStarting={startingKey === pendingLeaf.id}
                />
              ))
            )}
          </div>
        </>
      )}

      <div className="mx-3 mt-1 border-t border-gray-100 dark:border-gray-800" />
    </div>
  );
}
