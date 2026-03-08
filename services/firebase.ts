import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  GoogleAuthProvider,
  OAuthProvider,
  deleteUser,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { firebaseConfig } from "@/firebaseConfig";

// --- Init ---

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// --- Auth ---

export function onAuthStateChanged(callback: (user: User | null) => void) {
  return firebaseOnAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export async function signInWithApple(idToken: string, nonce: string) {
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({ idToken, rawNonce: nonce });
  return signInWithCredential(auth, credential);
}

export async function signOut() {
  return firebaseSignOut(auth);
}

export async function deleteAccount(uid: string): Promise<void> {
  // Delete all favorites subcollection docs
  const favsSnap = await getDocs(favoritesCol(uid));
  const deletePromises = favsSnap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);

  // Delete the Firebase auth account
  const user = auth.currentUser;
  if (user) {
    await deleteUser(user);
  }
}

// --- Firestore: Favorites ---

export interface FavoriteDoc {
  parkCode: string;
  fullName: string;
  image: string;
  states: string;
  savedAt: unknown;
}

function favoritesCol(uid: string) {
  return collection(db, "users", uid, "favorites");
}

export async function addFavorite(uid: string, park: Omit<FavoriteDoc, "savedAt">) {
  const ref = doc(favoritesCol(uid), park.parkCode);
  await setDoc(ref, { ...park, savedAt: serverTimestamp() });
}

export async function removeFavorite(uid: string, parkCode: string) {
  const ref = doc(favoritesCol(uid), parkCode);
  await deleteDoc(ref);
}

export async function getFavorites(uid: string): Promise<FavoriteDoc[]> {
  const snap = await getDocs(favoritesCol(uid));
  return snap.docs.map((d) => d.data() as FavoriteDoc);
}

// --- Firestore: Reviews ---

export interface ReviewDoc {
  id?: string;
  uid: string;
  displayName: string;
  rating: number;
  number: number;
  text: string;
  createdAt: Timestamp;
  imageUrls?: string[];
}

function reviewsCol(parkCode: string) {
  return collection(db, "parks", parkCode, "reviews");
}

export async function addReview(parkCode: string, review: Omit<ReviewDoc, "createdAt">) {
  await addDoc(reviewsCol(parkCode), { ...review, createdAt: serverTimestamp() });
}

export async function getReviews(parkCode: string): Promise<ReviewDoc[]> {
  const q = query(reviewsCol(parkCode), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReviewDoc));
}

export async function uploadReviewPhoto(
  uid: string,
  parkCode: string,
  localUri: string,
  index: number,
): Promise<string> {
  const resp = await fetch(localUri);
  const blob = await resp.blob();
  const path = `parks/${parkCode}/reviews/${uid}/${Date.now()}_${index}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}

export async function deleteReview(
  parkCode: string,
  reviewId: string,
  imageUrls: string[] = [],
): Promise<void> {
  await deleteDoc(doc(db, "parks", parkCode, "reviews", reviewId));
  await Promise.allSettled(
    imageUrls.map((url) => deleteObject(ref(storage, url)))
  );
}

// --- Firestore: Reports (content moderation) ---

export async function reportReview(
  parkCode: string,
  reviewIndex: number,
  reporterUid: string,
  reason: string
): Promise<void> {
  await addDoc(collection(db, "reports"), {
    parkCode,
    reviewIndex,
    reporterUid,
    reason,
    createdAt: serverTimestamp(),
  });
}

// --- Geohash (inline, no extra dependency) ---

function encodeGeohash(lat: number, lng: number, precision = 6): string {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0, bit = 0;
  let evenBit = true;
  let hash = "";
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; minLng = mid; } else { idx = idx * 2; maxLng = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; minLat = mid; } else { idx = idx * 2; maxLat = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

// --- Firestore: Sightings ---

export interface SightingDoc {
  id?: string;
  userId: string;
  userDisplayName: string;
  species: {
    commonName: string;
    categoryId: string;
    categoryLabel: string;
    emoji: string;
  };
  location: {
    latitude: number;
    longitude: number;
    geohash: string;
    placeName?: string;
  };
  parkCode: string;
  parkName: string;
  photoUrls: string[];
  notes: string;
  confidence: "certain" | "probable" | "possible";
  count: number;
  timestamp: Timestamp;
}

const sightingsTopCol = () => collection(db, "sightings");

export async function addSighting(
  parkCode: string,
  data: Omit<SightingDoc, "timestamp" | "id">
): Promise<string> {
  const docRef = await addDoc(sightingsTopCol(), {
    ...data,
    timestamp: serverTimestamp(),
  });
  return docRef.id;
}

export async function getSightings(parkCode: string, limitCount = 10): Promise<SightingDoc[]> {
  const q = query(
    sightingsTopCol(),
    where("parkCode", "==", parkCode),
    orderBy("timestamp", "desc"),
    fsLimit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SightingDoc));
}

export async function getRecentSightings(days: number, limitCount = 200): Promise<SightingDoc[]> {
  const constraints: any[] = [orderBy("timestamp", "desc"), fsLimit(limitCount)];
  if (days > 0) {
    const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
    constraints.unshift(where("timestamp", ">=", cutoff));
  }
  const q = query(sightingsTopCol(), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SightingDoc));
}

export async function uploadSightingPhoto(
  uid: string,
  parkCode: string,
  localUri: string,
  index: number
): Promise<string> {
  const resp = await fetch(localUri);
  const blob = await resp.blob();
  const path = `sightings/${parkCode}/${uid}/${Date.now()}_${index}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}

export { encodeGeohash };

// --- Firestore: Campground Community Contributions ---

export interface CampgroundContribution {
  fee?: boolean | null;
  showers?: boolean | null;
  toilets?: boolean | null;
  tents?: boolean | null;
  caravans?: boolean | null;
  contributedBy: string;
  contributedAt: unknown;
}

export async function getCampgroundContribution(
  campId: string
): Promise<CampgroundContribution | null> {
  const snap = await getDoc(doc(db, "campgrounds", campId));
  if (!snap.exists()) return null;
  return snap.data() as CampgroundContribution;
}

export async function saveCampgroundContribution(
  campId: string,
  data: Omit<CampgroundContribution, "contributedBy" | "contributedAt">,
  displayName: string
): Promise<void> {
  await setDoc(
    doc(db, "campgrounds", campId),
    { ...data, contributedBy: displayName, contributedAt: serverTimestamp() },
    { merge: true }
  );
}
