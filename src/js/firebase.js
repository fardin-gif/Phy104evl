/**
 * DU Physics 104 - Firebase SDK Initialization & Connection Manager
 */
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence 
} from "firebase/auth";
import { 
  getFirestore 
} from "firebase/firestore";
import { getFirebaseConfig, isFirebaseConfigured } from "./config.js";

let app = null;
let auth = null;
let db = null;

export function initFirebase() {
  const config = getFirebaseConfig();

  try {
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }

    auth = getAuth(app);
    // Explicitly enforce local persistence so session is restored on future visits
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("Auth persistence setup note:", err);
    });

    db = getFirestore(app);

    return { app, auth, db, configured: isFirebaseConfigured() };
  } catch (error) {
    console.warn("Firebase initialization error:", error);
    return { app: null, auth: null, db: null, configured: false };
  }
}

export function getFirebaseAuth() {
  if (!auth) initFirebase();
  return auth;
}

export function getFirebaseDb() {
  if (!db) initFirebase();
  return db;
}
