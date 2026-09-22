import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { connectAuthEmulator, getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";

// Firebase web config is not a secret -- Firebase's security model relies on
// Firestore Security Rules (see firestore.rules), not on hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyB7nortxOkZX0wzLfWZJ4kQh5uePGQRK2k",
  authDomain: "afrotc-traning-tracker.firebaseapp.com",
  projectId: "afrotc-traning-tracker",
  storageBucket: "afrotc-traning-tracker.firebasestorage.app",
  messagingSenderId: "339778762887",
  appId: "1:339778762887:web:5e630efd6004ae6e602022",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Session-only persistence -- closing the tab/browser signs the user out (Firebase's default,
// browserLocalPersistence, would keep them signed in indefinitely across visits). Paired with the
// inactivity auto-logout in useAuth.ts.
void setPersistence(auth, browserSessionPersistence);

// In local dev, talk to the Firebase Local Emulator Suite instead of production
// so testing never touches real cadet data. Start it with
// `firebase emulators:start` (see firebase.json) before `npm run dev`.
// Guarded so a production build never attempts this.
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
}
