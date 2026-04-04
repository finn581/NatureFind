import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithCredential,
  signInWithEmailAndPassword,
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
  collectionGroup,
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
  getCountFromServer,
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

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
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

// --- Firestore: Condition Reports ---

export interface ConditionReportDoc {
  id?: string;
  uid: string;
  displayName: string;
  trailStatus: "open" | "partial" | "closed" | "unknown";
  wildlifeActivity: "high" | "moderate" | "low" | "none";
  crowding: "empty" | "light" | "moderate" | "crowded";
  accessNotes: string;
  createdAt: Timestamp;
}

function conditionReportsCol(parkCode: string) {
  return collection(db, "parks", parkCode, "conditionReports");
}

export async function addConditionReport(
  parkCode: string,
  report: Omit<ConditionReportDoc, "createdAt" | "id">
): Promise<void> {
  await addDoc(conditionReportsCol(parkCode), { ...report, createdAt: serverTimestamp() });
}

export async function getConditionReports(
  parkCode: string,
  limitCount = 5
): Promise<ConditionReportDoc[]> {
  const q = query(conditionReportsCol(parkCode), orderBy("createdAt", "desc"), fsLimit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConditionReportDoc));
}

// --- Firestore: User Stats ---

export async function countFavorites(uid: string): Promise<number> {
  try {
    const snap = await getCountFromServer(favoritesCol(uid));
    return snap.data().count;
  } catch {
    return 0;
  }
}

export async function countUserReviews(uid: string): Promise<number> {
  try {
    const q = query(collectionGroup(db, "reviews"), where("uid", "==", uid));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
}

export async function countUserSightings(uid: string): Promise<number> {
  try {
    const q = query(sightingsTopCol(), where("userId", "==", uid));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
}

// --- Firestore: Visit Tracking ---

function visitsCol(uid: string) {
  return collection(db, "users", uid, "visits");
}

export async function logVisit(uid: string, parkCode: string, parkName: string): Promise<void> {
  await setDoc(
    doc(visitsCol(uid), parkCode),
    { parkCode, parkName, lastVisited: serverTimestamp() },
    { merge: true }
  );
}

export async function countVisits(uid: string): Promise<number> {
  try {
    const snap = await getCountFromServer(visitsCol(uid));
    return snap.data().count;
  } catch {
    return 0;
  }
}

export async function getRecentVisits(uid: string, limitCount = 5): Promise<{ parkCode: string; parkName: string; lastVisited: Timestamp }[]> {
  try {
    const q = query(visitsCol(uid), orderBy("lastVisited", "desc"), fsLimit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as any);
  } catch {
    return [];
  }
}

// --- Firestore: Community Posts ---

export interface CommunityPost {
  id?: string;
  uid: string;
  displayName: string;
  photoUrl: string;
  caption: string;
  parkCode?: string;
  parkName?: string;
  likeCount: number;
  commentCount: number;
  createdAt: Timestamp;
}

export interface CommunityComment {
  id?: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: Timestamp;
}

const communityCol = () => collection(db, "community");

function communityCommentsCol(postId: string) {
  return collection(db, "community", postId, "comments");
}

function communityLikesCol(postId: string) {
  return collection(db, "community", postId, "likes");
}

export async function addCommunityPost(
  post: Omit<CommunityPost, "createdAt" | "id" | "likeCount" | "commentCount">
): Promise<string> {
  const docRef = await addDoc(communityCol(), {
    ...post,
    likeCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCommunityPosts(limitCount = 30): Promise<CommunityPost[]> {
  const q = query(communityCol(), orderBy("createdAt", "desc"), fsLimit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityPost));
}

export async function toggleCommunityLike(postId: string, uid: string): Promise<boolean> {
  const likeRef = doc(communityLikesCol(postId), uid);
  const postRef = doc(db, "community", postId);
  const snap = await getDoc(likeRef);
  if (snap.exists()) {
    await deleteDoc(likeRef);
    const postSnap = await getDoc(postRef);
    const current = (postSnap.data()?.likeCount ?? 1) as number;
    await setDoc(postRef, { likeCount: Math.max(0, current - 1) }, { merge: true });
    return false;
  } else {
    await setDoc(likeRef, { uid, likedAt: serverTimestamp() });
    const postSnap = await getDoc(postRef);
    const current = (postSnap.data()?.likeCount ?? 0) as number;
    await setDoc(postRef, { likeCount: current + 1 }, { merge: true });
    return true;
  }
}

export async function hasLikedPost(postId: string, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(communityLikesCol(postId), uid));
  return snap.exists();
}

export async function addCommunityComment(
  postId: string,
  comment: Omit<CommunityComment, "createdAt" | "id">
): Promise<void> {
  await addDoc(communityCommentsCol(postId), { ...comment, createdAt: serverTimestamp() });
  const postRef = doc(db, "community", postId);
  const postSnap = await getDoc(postRef);
  const current = (postSnap.data()?.commentCount ?? 0) as number;
  await setDoc(postRef, { commentCount: current + 1 }, { merge: true });
}

export async function getCommunityComments(postId: string): Promise<CommunityComment[]> {
  const q = query(communityCommentsCol(postId), orderBy("createdAt", "asc"), fsLimit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityComment));
}

export async function uploadCommunityPhoto(uid: string, localUri: string): Promise<string> {
  const resp = await fetch(localUri);
  const blob = await resp.blob();
  const path = `community/${uid}/${Date.now()}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}

export async function reportCommunityPost(
  postId: string,
  reporterUid: string,
  reason: string
): Promise<void> {
  await addDoc(collection(db, "reports"), {
    type: "community_post",
    postId,
    reporterUid,
    reason,
    createdAt: serverTimestamp(),
  });
}

// --- Firestore: Unified Activity Feed Queries ---

/** Recent reviews across ALL parks (collectionGroup). */
export async function getRecentReviewsFeed(
  limitCount = 12
): Promise<(ReviewDoc & { parkCode: string })[]> {
  try {
    const q = query(
      collectionGroup(db, "reviews"),
      orderBy("createdAt", "desc"),
      fsLimit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      parkCode: d.ref.parent.parent?.id ?? "",
    } as ReviewDoc & { parkCode: string }));
  } catch {
    return []; // collectionGroup index may not exist yet — non-fatal
  }
}

/** Recent condition reports across ALL parks (collectionGroup). */
export async function getRecentConditionReportsFeed(
  limitCount = 8
): Promise<(ConditionReportDoc & { parkCode: string })[]> {
  try {
    const q = query(
      collectionGroup(db, "conditionReports"),
      orderBy("createdAt", "desc"),
      fsLimit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      parkCode: d.ref.parent.parent?.id ?? "",
    } as ConditionReportDoc & { parkCode: string }));
  } catch {
    return [];
  }
}

/** Delete a community post and its subcollections. */
export async function deleteCommunityPost(postId: string, photoUrl?: string): Promise<void> {
  // Delete comments subcollection
  const commentsSnap = await getDocs(communityCommentsCol(postId));
  await Promise.allSettled(commentsSnap.docs.map((d) => deleteDoc(d.ref)));
  // Delete likes subcollection
  const likesSnap = await getDocs(communityLikesCol(postId));
  await Promise.allSettled(likesSnap.docs.map((d) => deleteDoc(d.ref)));
  // Delete the post
  await deleteDoc(doc(db, "community", postId));
  // Delete the photo from storage
  if (photoUrl) {
    try { await deleteObject(ref(storage, photoUrl)); } catch {}
  }
}
