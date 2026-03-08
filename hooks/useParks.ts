import { useState, useCallback } from "react";
import { fetchParks, type Park, type FetchParksParams } from "@/services/npsApi";

export function useParks() {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const loadParks = useCallback(async (params: FetchParksParams = {}, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchParks(params);
      setParks((prev) => (append ? [...prev, ...res.data] : res.data));
      setTotal(parseInt(res.total, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load parks");
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setParks([]);
    setTotal(0);
    setError(null);
  }, []);

  return { parks, loading, error, total, loadParks, reset };
}
