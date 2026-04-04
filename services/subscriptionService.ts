// In-App Purchase service using react-native-iap (StoreKit 2)
// One-time $9.99 non-consumable purchase for NatureFind Pro
// Gracefully degrades when native module is unavailable (Expo Go / simulator)

import { TurboModuleRegistry } from "react-native";

// ─── Lazy IAP module (avoids crash in Expo Go / simulator) ──────────────────

let IAP: typeof import("react-native-iap") | null = null;
let iapChecked = false;

function getIAP() {
  if (iapChecked) return IAP;
  iapChecked = true;
  const hasNitro = !!(global as any).__nitroModulesProxy ||
    TurboModuleRegistry.get("NitroModules") != null;
  if (!hasNitro) {
    console.warn("[IAP] NitroModules not available — skipping react-native-iap");
    return null;
  }
  try {
    IAP = require("react-native-iap");
    return IAP;
  } catch {
    console.warn("[IAP] react-native-iap not available");
    return null;
  }
}

// ─── Product ID ─────────────────────────────────────────────────────────────

export const PRODUCT_ID = "naturefind_pro_lifetime";

// ─── Connection ──────────────────────────────────────────────────────────────

let connected = false;

export async function initIAP(): Promise<void> {
  if (connected) return;
  const iap = getIAP();
  if (!iap) return;
  try {
    await iap.initConnection();
    connected = true;
  } catch (e) {
    console.warn("[IAP] initConnection failed:", e);
  }
}

export async function endIAP(): Promise<void> {
  if (!connected) return;
  const iap = getIAP();
  if (!iap) return;
  try {
    await iap.endConnection();
    connected = false;
  } catch {}
}

// ─── Fetch product info ─────────────────────────────────────────────────────

export async function fetchProductPrice(): Promise<string> {
  const iap = getIAP();
  if (!iap) return "$9.99";
  try {
    await initIAP();
    const products = await iap.getProducts({ skus: [PRODUCT_ID] });
    if (products.length > 0) {
      return (products[0] as any).localizedPrice ?? (products[0] as any).price ?? "$9.99";
    }
    return "$9.99";
  } catch (e) {
    console.warn("[IAP] fetchProductPrice failed:", e);
    return "$9.99";
  }
}

// ─── Purchase ────────────────────────────────────────────────────────────────

export async function purchasePro(): Promise<boolean> {
  const iap = getIAP();
  if (!iap) return false;
  try {
    await initIAP();
    await iap.requestPurchase({ sku: PRODUCT_ID });
    return true;
  } catch (e: any) {
    if (e.code === "E_USER_CANCELLED") return false;
    console.warn("[IAP] purchase failed:", e);
    throw e;
  }
}

// ─── Restore purchases ──────────────────────────────────────────────────────

export async function restorePurchases(): Promise<boolean> {
  const iap = getIAP();
  if (!iap) return false;
  try {
    await initIAP();
    const purchases = await iap.getAvailablePurchases();
    // Accept the lifetime product or legacy subscription product IDs
    const validIds = new Set([PRODUCT_ID, "naturefind_pro_monthly", "naturefind_pro_yearly"]);
    return purchases.some((p: any) => validIds.has(p.productId));
  } catch (e) {
    console.warn("[IAP] restore failed:", e);
    return false;
  }
}

// ─── Listeners (set up once in provider) ─────────────────────────────────────

export function setupPurchaseListeners(
  onPurchase: (purchase: any) => void,
  onError: (error: any) => void,
): () => void {
  const iap = getIAP();
  if (!iap) return () => {};

  const updateSub = iap.purchaseUpdatedListener(async (purchase: any) => {
    try {
      await iap.finishTransaction({ purchase, isConsumable: false });
      onPurchase(purchase);
    } catch (e) {
      console.warn("[IAP] finishTransaction failed:", e);
    }
  });

  const errorSub = iap.purchaseErrorListener((error: any) => {
    if (error.code !== "E_USER_CANCELLED") {
      onError(error);
    }
  });

  return () => {
    updateSub.remove();
    errorSub.remove();
  };
}
