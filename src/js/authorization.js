/**
 * DU Physics 104 - Authorization & Role Derivation
 * 
 * Strict Server-Authoritative Roles:
 * Category A: Unauthenticated
 * Category B: Verified Physics student (s-XXXXXXXXXX@phy.du.ac.bd)
 * Category C: Verified 2024 batch student (s-2024XXXXXX@phy.du.ac.bd)
 * Administrator: Verified via custom token claim or admin backend verification
 */
import { isValidDepartmentEmail, isBatch2024Student, extractRollFromEmail } from "./validation.js";

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
      roll: null,
    };
  }

  const email = user.email.trim().toLowerCase();
  const isDept = isValidDepartmentEmail(email);
  const is2024 = isDept && isBatch2024Student(email);
  const isAdmin = Boolean(customClaims.admin || user.isAdmin);
  const roll = extractRollFromEmail(email);

  return {
    category: is2024 ? "C" : (isDept ? "B" : "A"),
    isAuthenticated: true,
    isDepartment: isDept,
    isBatch2024: is2024,
    isAdmin: isAdmin,
    canViewData: isDept || isAdmin,
    canSubmitRating: is2024,
    roll: roll,
    email: email,
    uid: user.uid,
  };
}
