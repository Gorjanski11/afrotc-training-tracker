import { useCallback, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"] as const;

/**
 * Hub login (Email/Password). Accounts are created individually by an admin in the Firebase
 * Console -- there is no public sign-up screen, so having any account at all just proves identity;
 * WHICH tabs a signed-in person sees is decided separately by domain/access.ts. `authLoading`
 * covers the brief moment before Firebase reports whether a session is already active, so the app
 * doesn't flash the sign-in screen for an already-signed-in user. Session persistence is set to
 * browser-session-only (see lib/firebase.ts), so closing the tab signs the user out; this hook
 * additionally signs out after 15 minutes with no user activity while the tab stays open.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void signOut(auth);
      }, INACTIVITY_TIMEOUT_MS);
    };
    resetTimer();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, resetTimer);
    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, resetTimer);
    };
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  /**
   * Firebase requires a *recent* sign-in before it'll let a password change through -- since
   * someone changing their temp password may have signed in a while ago, this re-proves identity
   * with their current password first rather than surfacing a confusing "requires-recent-login"
   * error and making them sign out and back in.
   */
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const current = auth.currentUser;
    if (!current?.email) throw new Error("Not signed in.");
    const credential = EmailAuthProvider.credential(current.email, currentPassword);
    await reauthenticateWithCredential(current, credential);
    await updatePassword(current, newPassword);
  }, []);

  /** Re-proves identity with the current password, without changing it -- used to gate a sensitive one-off action (Data Management's PDF delete, Section 6) the same way a password change already does. Throws if the password is wrong. */
  const reauthenticate = useCallback(async (password: string) => {
    const current = auth.currentUser;
    if (!current?.email) throw new Error("Not signed in.");
    const credential = EmailAuthProvider.credential(current.email, password);
    await reauthenticateWithCredential(current, credential);
  }, []);

  return { user, authLoading, signIn, signOut: signOutUser, changePassword, reauthenticate };
}
