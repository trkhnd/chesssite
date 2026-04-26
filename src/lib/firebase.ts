import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

export type CloudProfile = {
  name: string;
  city: string;
  rating: number | null;
  pro: boolean;
  email: string;
};

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

const firebaseEnabled = Object.values(firebaseConfig).every(Boolean);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (firebaseEnabled) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export const cloud = {
  enabled: firebaseEnabled,
  auth: app ? getAuth(app) : null,
  db,
};

export function observeCloudUser(callback: (user: User | null) => void) {
  if (!cloud.auth) return () => {};
  return onAuthStateChanged(cloud.auth, callback);
}

export async function signUpCloud(email: string, password: string, name: string, profile: CloudProfile) {
  if (!cloud.auth || !cloud.db) throw new Error("Firebase is not configured.");
  const credential = await createUserWithEmailAndPassword(cloud.auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await setDoc(doc(cloud.db, "users", credential.user.uid), {
    ...profile,
    name,
    email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return credential.user;
}

export async function loginCloud(email: string, password: string) {
  if (!cloud.auth) throw new Error("Firebase is not configured.");
  return signInWithEmailAndPassword(cloud.auth, email, password);
}

export async function logoutCloud() {
  if (!cloud.auth) return;
  await signOut(cloud.auth);
}

export async function loadCloudProfile(uid: string) {
  if (!cloud.db) return null;
  const snapshot = await getDoc(doc(cloud.db, "users", uid));
  return snapshot.exists() ? (snapshot.data() as CloudProfile) : null;
}

export async function saveCloudProfile(uid: string, profile: CloudProfile) {
  if (!cloud.db) return;
  await setDoc(
    doc(cloud.db, "users", uid),
    { ...profile, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function upsertCloudRoom(roomId: string, payload: Record<string, unknown>) {
  if (!cloud.db) return;
  await setDoc(
    doc(cloud.db, "rooms", roomId),
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function updateCloudRoom(roomId: string, payload: Record<string, unknown>) {
  if (!cloud.db) return;
  await updateDoc(doc(cloud.db, "rooms", roomId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

export function watchCloudRoom(roomId: string, callback: (data: Record<string, unknown> | null) => void) {
  if (!cloud.db) return () => {};
  return onSnapshot(doc(cloud.db, "rooms", roomId), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}
