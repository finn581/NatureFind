import { useState, useCallback, useEffect } from "react";
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  type FavoriteDoc,
} from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";

export function useFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      return;
    }
    setLoading(true);
    try {
      const data = await getFavorites(user.uid);
      setFavorites(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (park: Omit<FavoriteDoc, "savedAt">) => {
      if (!user) return;
      await addFavorite(user.uid, park);
      await refresh();
    },
    [user, refresh]
  );

  const remove = useCallback(
    async (parkCode: string) => {
      if (!user) return;
      await removeFavorite(user.uid, parkCode);
      setFavorites((prev) => prev.filter((f) => f.parkCode !== parkCode));
    },
    [user]
  );

  const isFavorite = useCallback(
    (parkCode: string) => favorites.some((f) => f.parkCode === parkCode),
    [favorites]
  );

  return { favorites, loading, refresh, add, remove, isFavorite };
}
