/**
 * DU Physics 104 - Validation Utilities
 */
import { APP_CONFIG } from "./config.js";

/**
 * Validate if an email belongs to the Physics Department (s- followed by 10 digits @phy.du.ac.bd)
 */
export function isValidDepartmentEmail(email) {
  if (!email || typeof email !== "string") return false;
  return APP_CONFIG.EMAIL_PATTERN_DEPARTMENT.test(email.trim().toLowerCase());
}

/**
 * Validate if an email belongs to the verified 2024 batch (s-2024 followed by 6 digits @phy.du.ac.bd)
 */
export function isBatch2024Student(email) {
  if (!email || typeof email !== "string") return false;
  return APP_CONFIG.EMAIL_PATTERN_BATCH_2024.test(email.trim().toLowerCase());
}

/**
 * Extract 10-digit roll from university email
 */
export function extractRollFromEmail(email) {
  if (!email || typeof email !== "string") return null;
  const match = email.trim().toLowerCase().match(/^s-(\d{10})@phy\.du\.ac\.bd$/);
  return match ? match[1] : null;
}

/**
 * Extract batch year from university email (e.g. s-2023xxxxxx -> '2023', s-2006xxxxxx -> '2006')
 */
export function extractBatchFromEmail(email) {
  if (!email || typeof email !== "string") return null;
  const match = email.trim().toLowerCase().match(/^s-(\d{4})\d{6}@phy\.du\.ac\.bd$/);
  return match ? match[1] : null;
}

/**
 * Parse Google Drive sharing links to extract File ID and construct reliable image URLs
 */
export function parseGoogleDriveUrl(url) {
  if (!url || typeof url !== "string") {
    return { fileId: null, directImageUrl: null, rawUrl: url };
  }

  const trimmed = url.trim();
  let fileId = null;

  // Patterns:
  // 1. /file/d/([a-zA-Z0-9_-]+)
  // 2. id=([a-zA-Z0-9_-]+)
  // 3. lh3.googleusercontent.com/d/([a-zA-Z0-9_-]+)
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) {
    fileId = fileDMatch[1];
  } else {
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
      fileId = idParamMatch[1];
    } else {
      const lh3Match = trimmed.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
      if (lh3Match && lh3Match[1]) {
        fileId = lh3Match[1];
      }
    }
  }

  if (fileId) {
    // High-performance direct serving URL via Google User Content
    const directImageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    return { fileId, directImageUrl, rawUrl: trimmed };
  }

  // Not a recognizable drive URL, return original as direct if http(s)
  return { fileId: null, directImageUrl: trimmed.startsWith("http") ? trimmed : null, rawUrl: trimmed };
}

/**
 * Sanitize text against XSS injection
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Validate rating score within allowed range
 */
export function isValidScore(score, min = APP_CONFIG.DEFAULT_MIN_SCORE, max = APP_CONFIG.DEFAULT_MAX_SCORE) {
  if (typeof score !== "number" || isNaN(score)) return false;
  return Number.isInteger(score) && score >= min && score <= max;
}

/**
 * Validate review length
 */
export function isValidReview(text) {
  if (!text) return true; // Review is optional
  return typeof text === "string" && text.trim().length <= APP_CONFIG.MAX_REVIEW_LENGTH;
}
