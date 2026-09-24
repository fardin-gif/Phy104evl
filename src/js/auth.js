/**
 * DU Physics 104 - Firebase Authentication & Email Link Flow
 */
import { 
  sendSignInLinkToEmail, 
  isSignInWithEmailLink, 
  signInWithEmailLink, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase.js";
import { APP_CONFIG, isFirebaseConfigured } from "./config.js";
import { isValidDepartmentEmail } from "./validation.js";
import { resolveUserPermissions } from "./authorization.js";
import { setState, getState } from "./state.js";
import { syncDeviceSession } from "./deviceSessions.js";

/**
 * Send passwordless authentication email link via Firebase Auth (Option 1)
 */
export async function sendEmailLinkAuth(email) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!isValidDepartmentEmail(normalizedEmail)) {
    throw new Error("Only official Physics Department emails are permitted (s-xxxxxxxxxx@phy.du.ac.bd).");
  }

  // Standard Firebase Client-side Email Link Authentication (Option 1)
  const auth = getFirebaseAuth();
  if (!isFirebaseConfigured() || !auth) {
    throw new Error("Firebase Authentication is not configured. Please supply your Firebase project configuration in src/js/config.js to dispatch live sign-in links.");
  }

  const actionCodeSettings = {
    url: window.location.origin + window.location.pathname,
    handleCodeInApp: true,
  };

  try {
    await sendSignInLinkToEmail(auth, normalizedEmail, actionCodeSettings);
    localStorage.setItem(APP_CONFIG.STORAGE_KEY_EMAIL_FOR_SIGN_IN, normalizedEmail);
    return { success: true, email: normalizedEmail };
  } catch (err) {
    if (err.code === "auth/quota-exceeded" || (err.message && err.message.includes("quota-exceeded"))) {
      throw new Error("Firebase: Exceeded Email quota. Please try again few moments later.");
    }
    throw err;
  }
}

/**
 * Handle incoming email sign-in link completion
 */
export async function handleEmailLinkCallback() {
  const auth = getFirebaseAuth();
  if (!auth) return false;

  if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = localStorage.getItem(APP_CONFIG.STORAGE_KEY_EMAIL_FOR_SIGN_IN);
    if (!email) {
      email = window.prompt("Please confirm your official university email for verification:");
    }

    if (!email || !isValidDepartmentEmail(email)) {
      throw new Error("A valid University Physics email is required to complete authentication.");
    }

    const result = await signInWithEmailLink(auth, email, window.location.href);
    localStorage.removeItem(APP_CONFIG.STORAGE_KEY_EMAIL_FOR_SIGN_IN);

    // Clean URL
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return result.user;
  }

  return null;
}

/**
 * Sign out user
 */
export async function logoutUser() {
  const auth = getFirebaseAuth();
  if (auth && auth.currentUser) {
    await signOut(auth);
  }
  localStorage.removeItem(APP_CONFIG.STORAGE_KEY_EMAIL_FOR_SIGN_IN);
  setState({ user: null, activeStudentProfile: null });
}

/**
 * Subscribe to Firebase Auth State Changes
 */
export function initAuthListener(onUserChanged) {
  const auth = getFirebaseAuth();

  if (auth && isFirebaseConfigured()) {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        // Enforce valid domain
        if (!isValidDepartmentEmail(firebaseUser.email) && !firebaseUser.email.endsWith("@du.ac.bd")) {
          await signOut(auth);
          setState({ user: null, isLoading: false });
          if (onUserChanged) onUserChanged(null);
          return;
        }

        const idTokenResult = await firebaseUser.getIdTokenResult().catch(() => ({ claims: {} }));
        const permissions = resolveUserPermissions(firebaseUser, idTokenResult.claims);

        // Enforce device session limit
        const deviceResult = await syncDeviceSession(firebaseUser.uid);
        if (!deviceResult.allowed) {
          await signOut(auth);
          alert(deviceResult.reason);
          setState({ user: null, isLoading: false });
          if (onUserChanged) onUserChanged(null);
          return;
        }

        setState({ user: permissions, isLoading: false });
        if (onUserChanged) onUserChanged(permissions);
      } else {
        setState({ user: null, isLoading: false });
        if (onUserChanged) onUserChanged(null);
      }
    });
  } else {
    setState({ user: null, isLoading: false });
    if (onUserChanged) onUserChanged(null);
    return () => {};
  }
}
