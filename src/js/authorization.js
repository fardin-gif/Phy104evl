/**
 * DU Physics 104 - Authorization & Role Derivation
 * 
 * Strict Server-Authoritative Roles:
 * Category A: Unauthenticated
 * Category B: Verified Physics student (s-XXXXXXXXXX@phy.du.ac.bd)
 * Category C: Verified 2024 batch student (s-2024XXXXXX@phy.du.ac.bd)
 * Administrator: Verified via custom token claim or admin backend verification
 */
import { isValidDepartmentEmail, isBatch2024Student, extractRollFromEmail, extractBatchFromEmail } from "./validation.js";

export function resolveUserPermissions(user, customClaims = {}) {
  if (!user || !user.email) {
    return {
      category: "A",
      isAuthenticated: false,
      isDepartment: false,
      isBatch2024: false,
      isAdmin: false,
      canViewData: false,
      canSubmitRating: false,
      canSubmitReview: false,
      roll: null,
      batch: null,
    };
  }

  const email = user.email.trim().toLowerCase();
  const is2024 = isBatch2024Student(email);
  const isAdmin = Boolean(customClaims.admin || user.isAdmin);
  const roll = extractRollFromEmail(email);
  const batch = extractBatchFromEmail(email);

  const isAuth = is2024 || isAdmin;

  return {
    category: is2024 ? "C" : "A",
    isAuthenticated: isAuth,
    isDepartment: is2024,
    isBatch2024: is2024,
    isAdmin: isAdmin,
    canViewData: isAuth,
    canSubmitRating: is2024, // Only 2024 batch can submit ratings
    canSubmitReview: is2024, // Only 2024 batch can submit reviews
    roll: roll,
    batch: batch,
    email: email,
    uid: user.uid,
  };
}
