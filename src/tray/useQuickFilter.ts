import { useEffect, useMemo, useState } from "react";
import type { FavoriteTask, RecentTask } from "../types";
import { normalizeSearchText } from "../utils/searchText";

type Filterable = Pick<RecentTask, "project" | "activity" | "customer" | "description">;

function matches(task: Filterable, terms: string[]): boolean {
  const haystack = normalizeSearchText(
    [task.project, task.activity, task.customer, task.description].filter(Boolean).join(" "),
  );
  return terms.every((term) => haystack.includes(term));
}

/** Local type-to-filter over the popup's favorites and recent tasks. */
export function useQuickFilter(
  favorites: FavoriteTask[],
  tasks: RecentTask[],
  resetKey: unknown,
) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
  }, [resetKey]);

  const filtered = useMemo(() => {
    const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return { favorites, tasks };
    return {
      favorites: favorites.filter((task) => matches(task, terms)),
      tasks: tasks.filter((task) => matches(task, terms)),
    };
  }, [favorites, tasks, query]);

  return {
    query,
    setQuery,
    active: query !== "",
    favorites: filtered.favorites,
    tasks: filtered.tasks,
    isEmpty: query !== "" && filtered.favorites.length === 0 && filtered.tasks.length === 0,
  };
}
