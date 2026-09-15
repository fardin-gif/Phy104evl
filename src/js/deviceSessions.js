/**
 * DU Physics 104 - Device Session Manager (Enforcing 3 Device Limit)
 */
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp 
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase.js";
import { APP_CONFIG } from "./config.js";

/**
 * Generate or fetch stable deviceId for this browser
 */
export function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(APP_CONFIG.STORAGE_KEY_DEVICE_ID);
  if (!deviceId) {
    deviceId = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now().toString(36);
    localStorage.setItem(APP_CONFIG.STORAGE_KEY_DEVICE_ID, deviceId);
  }
  return deviceId;
}

/**
 * Get simple user-agent summary for display
 */
export function getUserAgentSummary() {
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edge")) browser = "Edge";

  let os = "Device";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Macintosh")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return `${browser} on ${os}`;
}

/**
 * Register or heartbeat current device session
 */
export async function syncDeviceSession(uid) {
  if (!uid) return { allowed: false, reason: "No user ID" };
  const deviceId = getOrCreateDeviceId();
  const db = getFirebaseDb();

  if (!db) {
    return { allowed: true, count: 1 };
  }

  try {
    const sessionsCol = collection(db, "users", uid, "deviceSessions");
    const q = query(sessionsCol, where("revoked", "==", false));
    const snap = await getDocs(q);

    const isCurrentDevicePresent = snap.docs.some((d) => d.id === deviceId);

    if (isCurrentDevicePresent) {
      // Heartbeat
      await updateDoc(doc(sessionsCol, deviceId), {
        lastSeenAt: serverTimestamp(),
      });
      return { allowed: true, count: snap.size };
    }

    // Check limit
    if (snap.size >= APP_CONFIG.MAX_ACTIVE_DEVICES) {
      return {
        allowed: false,
        reason: `Maximum of ${APP_CONFIG.MAX_ACTIVE_DEVICES} active devices reached. Please revoke an existing session.`,
        activeCount: snap.size,
      };
    }

    // Register new device
    await setDoc(doc(sessionsCol, deviceId), {
      deviceId,
      userAgent: getUserAgentSummary(),
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      revoked: false,
      status: "active",
    });

    return { allowed: true, count: snap.size + 1 };
  } catch (error) {
    console.warn("Device session registration note:", error);
    // Fail soft if offline or permissions pending
    return { allowed: true, count: 1 };
  }
}

/**
 * Fetch all device sessions for user
 */
export async function fetchUserDeviceSessions(uid) {
  if (!uid) return [];
  const db = getFirebaseDb();
  if (!db) return [];

  try {
    const sessionsCol = collection(db, "users", uid, "deviceSessions");
    const snap = await getDocs(sessionsCol);
    const sessions = [];
    snap.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() });
    });
    return sessions;
  } catch (err) {
    console.warn("Could not fetch device sessions:", err);
    return [];
  }
}

/**
 * Revoke a specific device session
 */
export async function revokeDeviceSession(uid, targetDeviceId) {
  if (!uid || !targetDeviceId) return false;
  const db = getFirebaseDb();
  if (!db) return false;

  try {
    const sessionDoc = doc(db, "users", uid, "deviceSessions", targetDeviceId);
    await updateDoc(sessionDoc, {
      revoked: true,
      status: "revoked",
      revokedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("Failed to revoke device session:", err);
    return false;
  }
}
