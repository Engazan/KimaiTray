import { useState, useEffect, useCallback } from "react";
import type { FavoriteTask } from "../types";
import {
  loadFavorites,
  addFavorite,
  removeFavorite,
} from "../api/favoritesStore";

export function useFavorites(connectionId: string, baseUrl: string) {
  const [favorites, setFavorites] = useState<FavoriteTask[]>([]);

  useEffect(() => {
    if (!connectionId) {
      setFavorites([]);
      return;
    }
    let cancelled = false;
    loadFavorites(connectionId, baseUrl).then((items) => {
      if (!cancelled) setFavorites(items);
    });
    return () => { cancelled = true; };
  }, [connectionId, baseUrl]);

  const add = useCallback(
    async (task: FavoriteTask) => {
      if (!connectionId) return;
      const updated = await addFavorite({ ...task, connectionId, baseUrl });
      setFavorites(updated);
    },
    [connectionId, baseUrl],
  );

  const remove = useCallback(
    async (key: string) => {
      if (!connectionId) return;
      const updated = await removeFavorite(key, connectionId, baseUrl);
      setFavorites(updated);
    },
    [connectionId, baseUrl],
  );

  const isFavorite = useCallback(
    (key: string) => favorites.some((t) => t.key === key),
    [favorites],
  );

  return { favorites, addFavorite: add, removeFavorite: remove, isFavorite };
}
