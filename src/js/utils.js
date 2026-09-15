/**
 * DU Physics 104 - Helper & Utility Functions
 */
import { APP_CONFIG } from "./config.js";

/**
 * Format rating score with fixed decimals
 */
export function formatScore(val, denom = 4) {
  if (val === null || val === undefined || isNaN(val)) {
    return { display: "—", full: "Not rated yet" };
  }
  const formatted = Number(val).toFixed(2);
  return {
    display: formatted,
    full: `${formatted} / ${denom}`,
  };
}

/**
 * Debounce function for instant search
 */
export function debounce(func, wait = 150) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Safe CSV Exporter with RFC 4180 escaping
 */
export function exportToCSV(filename, rows) {
  if (!rows || !rows.length) return;

  const escapeCell = (cell) => {
    if (cell === null || cell === undefined) return '""';
    const str = String(cell);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  const csvContent = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Apply theme to document element
 */
export function applyTheme(theme) {
  let targetTheme = theme;
  if (theme === "system") {
    targetTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", targetTheme);
  localStorage.setItem(APP_CONFIG.STORAGE_KEY_THEME, theme);
}
