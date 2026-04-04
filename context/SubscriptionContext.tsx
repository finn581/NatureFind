import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  initIAP,
  endIAP,
  fetchProductPrice,
  purchasePro,
  restorePurchases,
  setupPurchaseListeners,
} from "@/services/subscriptionService";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubscriptionContextValue {
  isPro: boolean;
  loading: boolean;
  price: string;
  purchasing: boolean;
  purchase: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  showPaywall: boolean;
  setShowPaywall: (v: boolean) => void;
  /** Context string shown as paywall subtitle (e.g. "Unlock Trail Details") */
  paywallContext: string | null;
  /** Show paywall with feature-specific context. Returns false if already Pro. */
  gateFeature: (context: string) => boolean;
}

const PRO_KEY = "naturefind_pro";

// ─── Context ─────────────────────────────────────────────────────────────────

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

// TestFlight: unlock Pro for testing. Set to false before App Store release.
const TESTFLIGHT_PRO = false;

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isPro, setIsPro] = useState(TESTFLIGHT_PRO);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState("$9.99");
  const [purchasing, setPurchasing] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallContext, setPaywallContext] = useState<string | null>(null);

  const gateFeature = useCallback(
    (context: string): boolean => {
      if (isPro) return false; // not gated
      setPaywallContext(context);
      setShowPaywall(true);
      return true; // was gated
    },
    [isPro],
  );

  // Persist pro status locally (StoreKit is source of truth on restore)
  const markPro = useCallback(async (value: boolean) => {
    setIsPro(value);
    await AsyncStorage.setItem(PRO_KEY, value ? "1" : "0");
  }, []);

  // Init IAP + check cached status + listen for purchases
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      // Check local cache first for instant UI
      const cached = await AsyncStorage.getItem(PRO_KEY);
      if (cached === "1") setIsPro(true);

      await initIAP();

      // Fetch price
      const p = await fetchProductPrice();
      setPrice(p);

      // Verify with StoreKit (source of truth)
      const hasActive = await restorePurchases();
      await markPro(hasActive);

      setLoading(false);

      // Listen for new purchases
      cleanup = setupPurchaseListeners(
        async () => {
          await markPro(true);
          setPurchasing(false);
          setShowPaywall(false);
          setPaywallContext(null);
        },
        () => {
          setPurchasing(false);
        },
      );
    })();

    return () => {
      cleanup?.();
      endIAP();
    };
  }, [markPro]);

  const purchase = useCallback(async (): Promise<boolean> => {
    setPurchasing(true);
    try {
      const success = await purchasePro();
      if (!success) setPurchasing(false);
      return success;
    } catch {
      setPurchasing(false);
      return false;
    }
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const hasActive = await restorePurchases();
      await markPro(hasActive);
      return hasActive;
    } finally {
      setLoading(false);
    }
  }, [markPro]);

  return (
    <SubscriptionContext.Provider
      value={{
        isPro,
        loading,
        price,
        purchasing,
        purchase,
        restore,
        showPaywall,
        setShowPaywall,
        paywallContext,
        gateFeature,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx)
    throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
