/**
 * DU Physics 104 - Central Reactive Application State
 */
import { APP_CONFIG } from "./config.js";

const state = {
  user: null, // { uid, email, isDepartment, isBatch2024, isAdmin, token }
  students: [],
  criteria: [],
  aggregates: {}, // { [studentId]: aggregateDoc }
  userSubmittedRatingIds: new Set(), // targetStudentIds already rated by current user
  activeStudentProfile: null,
  deviceSessions: [],
  searchQuery: "",
  activeFilter: "all",
  theme: localStorage.getItem(APP_CONFIG.STORAGE_KEY_THEME) || "light",
  isLoading: true,
  currentView: "directory", // 'directory' | 'rankings'
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  notifyListeners();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      console.error("State listener error:", err);
    }
  }
}
