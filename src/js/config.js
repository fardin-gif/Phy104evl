/**
 * DU Physics 104 - Central Application Configuration
 * All product names, regex constraints, and environment settings are stored here.
 */

// Product Name and Identity
export const APP_CONFIG = {
  name: "104 Peer Review",
  identity: "104",
  departmentName: "PHYSICS · UNIVERSITY OF DHAKA",
  subtitle: "Peer Review",
  tagline: "How does the batch see itself?",

  // Strict University of Dhaka Physics email validation patterns
  // Department student: s- followed by exactly 10 digits @phy.du.ac.bd
  EMAIL_PATTERN_DEPARTMENT: /^s-\d{10}@phy\.du\.ac\.bd$/,
  // 2024 Batch student: s-2024 followed by exactly 6 digits @phy.du.ac.bd
  EMAIL_PATTERN_BATCH_2024: /^s-2024\d{6}@phy\.du\.ac\.bd$/,

  // Score boundaries (default -1 to 4)
  DEFAULT_MIN_SCORE: -1,
  DEFAULT_MAX_SCORE: 4,

  // Constraints
  MAX_REVIEW_LENGTH: 500,
  MAX_ACTIVE_DEVICES: 3,

  // Storage keys
  STORAGE_KEY_EMAIL_FOR_SIGN_IN: "du_phy_104_emailForSignIn",
  STORAGE_KEY_DEVICE_ID: "du_phy_104_deviceId",
  STORAGE_KEY_THEME: "du_phy_104_theme",
  STORAGE_KEY_FIREBASE_CONFIG: "du_phy_104_firebase_config",
};

/**
 * Firebase Project Configuration
 * Priority:
 * 1. window.__FIREBASE_CONFIG__
 * 2. localStorage saved custom config
 * 3. Default placeholder or environment config
 */
export function getFirebaseConfig() {
  if (typeof window !== "undefined" && window.__FIREBASE_CONFIG__) {
    return window.__FIREBASE_CONFIG__;
  }

  const saved = typeof localStorage !== "undefined" 
    ? localStorage.getItem(APP_CONFIG.STORAGE_KEY_FIREBASE_CONFIG) 
    : null;

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.projectId && parsed.apiKey) {
        return parsed;
      }
    } catch (e) {
      console.warn("Could not parse saved Firebase config:", e);
    }
  }

  return {
    apiKey: "AIzaSy_DEVELOPER_FIREBASE_API_KEY_PLACEHOLDER",
    authDomain: "du-physics-104.firebaseapp.com",
    projectId: "du-physics-104",
    storageBucket: "du-physics-104.appspot.com",
    messagingSenderId: "104000000000",
    appId: "1:104000000000:web:104abcdef104"
  };
}

export function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return (
    config &&
    config.apiKey &&
    !config.apiKey.includes("PLACEHOLDER") &&
    config.projectId &&
    !config.projectId.includes("PLACEHOLDER")
  );
}
