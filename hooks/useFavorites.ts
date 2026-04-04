import { useState, useCallback, useEffect } from "react";
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  type FavoriteDoc,
} from "@/services/firebase";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { trackReviewAction } from "@/utils/reviewPrompt";

const FREE_FAVORITES_LIMIT = 5;

export function useFavorites() {
  const { user } = useAuth();
  const { isPro, gateFeature } = useSubscription();
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
    async (park: Omit<FavoriteDoc, "savedAt">): Promise<boolean> => {
      if (!user) return false;
      // Check favorites limit for free users
      if (!isPro && favorites.length >= FREE_FAVORITES_LIMIT) {
        gateFeature("Unlock Unlimited Favorites");
        return false;
      }
      await addFavorite(user.uid, park);
      await refresh();
      trackReviewAction();
      return true;
    },
    [user, refresh, isPro, favorites.length, gateFeature]
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

  const atLimit = !isPro && favorites.length >= FREE_FAVORITES_LIMIT;

  return { favorites, loading, refresh, add, remove, isFavorite, atLimit, limit: FREE_FAVORITES_LIMIT };
}
