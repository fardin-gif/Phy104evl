/**
 * DU Physics 104 - Firebase Authentication & Email Link Flow
 */
import { 
  sendSignInLinkToEmail, 
  isSignInWithEmailLink, 
  signInWithEmailLink, 
  signInWithPopup,
  GoogleAuthProvider,
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase.js";
import { APP_CONFIG, isFirebaseConfigured } from "./config.js";
import { isValidDepartmentEmail, isBatch2024Student } from "./validation.js";
import { resolveUserPermissions } from "./authorization.js";
import { setState, getState } from "./state.js";
import { syncDeviceSession } from "./deviceSessions.js";

/**
 * Sign in using University Google Account (Zero email quota limits, 1-click verification)
 * Strictly restricted to verified 2024 batch students (s-2024xxxxxx@phy.du.ac.bd)
 */
export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!isFirebaseConfigured() || !auth) {
    throw new Error("Firebase Authentication is not configured. Please check src/js/config.js.");
  }

  const provider = new GoogleAuthProvider();
  // Restrict Google Account Chooser specifically to physics university domain
  provider.setCustomParameters({
    hd: "phy.du.ac.bd",
    prompt: "select_account"
  });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  if (user && user.email) {
    const normalizedEmail = user.email.trim().toLowerCase();
    if (!isBatch2024Student(normalizedEmail)) {
      // Instantly delete unauthorized user from Firebase Auth so it doesn't linger in Firebase Console
      try {
        await user.delete();
      } catch (delErr) {
        console.warn("Could not delete unauthorized user:", delErr);
      }
      await signOut(auth);
      throw new Error(`Access restricted: "${normalizedEmail}" is not permitted. Only verified DU Physics 2024 batch students (s-2024xxxxxx@phy.du.ac.bd) are allowed to sign in.`);
    }
  }

  return user;
}

/**
 * Send passwordless authentication email link via Firebase Auth
 * Strictly restricted to verified 2024 batch students (s-2024xxxxxx@phy.du.ac.bd)
 */
export async function sendEmailLinkAuth(email) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!isBatch2024Student(normalizedEmail)) {
    throw new Error("Access restricted: Only verified DU Physics 2024 batch students (s-2024xxxxxx@phy.du.ac.bd) can sign in.");
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
      email = window.prompt("Please confirm your official 2024 batch university email for verification:");
    }

    if (!email || !isBatch2024Student(email)) {
      throw new Error("A valid DU Physics 2024 batch email (s-2024xxxxxx@phy.du.ac.bd) is required to complete authentication.");
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
        const email = (firebaseUser.email || "").trim().toLowerCase();
        // Enforce 2024 batch email strictly
        if (!isBatch2024Student(email)) {
          console.warn("Non-2024 batch account detected in auth listener, purging session:", email);
          try {
            await firebaseUser.delete();
          } catch (e) {
            // Silently handle if already deleted
          }
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
