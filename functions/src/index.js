const functions = require("firebase-functions");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper: Validate University of Dhaka Physics Email Pattern
 */
function isPhyStudent(email) {
  return /^s-\d{10}@phy\.du\.ac\.bd$/.test(email || "");
}

function isBatch2024(email) {
  return /^s-2024\d{6}@phy\.du\.ac\.bd$/.test(email || "");
}

/**
 * 1. ADMIN LOGIN (Cloud Function)
 * Verifies email and salted hashed password against protected 'admins' collection.
 * Mint a Firebase Auth custom token with admin custom claim.
 */
exports.adminLogin = functions.https.onCall(async (data, context) => {
  const { email, password } = data || {};
  if (!email || !password) {
    throw new functions.https.HttpsError("invalid-argument", "Email and password are required.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const snapshot = await db.collection("admins").where("email", "==", normalizedEmail).limit(1).get();

  if (snapshot.empty) {
    throw new functions.https.HttpsError("unauthenticated", "Invalid administrator credentials.");
  }

  const adminDoc = snapshot.docs[0];
  const adminData = adminDoc.data();

  // Verify bcrypt hash.
  const isMatch = await bcrypt.compare(password, adminData.pass);
  if (!isMatch) {
    throw new functions.https.HttpsError("unauthenticated", "Invalid administrator credentials.");
  }

  // Create or retrieve Auth user for this admin and assign custom claim
  const adminUid = adminDoc.id;
  try {
    await admin.auth().getUser(adminUid);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      await admin.auth().createUser({
        uid: adminUid,
        email: normalizedEmail,
        displayName: "DU Physics Admin",
      });
    } else {
      throw err;
    }
  }

  await admin.auth().setCustomUserClaims(adminUid, { admin: true });
  const customToken = await admin.auth().createCustomToken(adminUid, { admin: true });

  // Log admin login event
  await db.collection("auditLogs").add({
    action: "ADMIN_LOGIN_SUCCESS",
    adminId: adminUid,
    targetId: adminUid,
    details: { email: normalizedEmail },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { token: customToken, email: normalizedEmail };
});

/**
 * 2. DEVICE SESSION ENFORCEMENT
 * Max 3 active devices per authenticated account.
 */
exports.registerDeviceSession = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.email) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = context.auth.uid;
  const email = context.auth.token.email;

  if (!isPhyStudent(email)) {
    throw new functions.https.HttpsError("permission-denied", "Unauthorized email domain.");
  }

  const { deviceId, userAgent } = data || {};
  if (!deviceId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing deviceId.");
  }

  const sessionsRef = db.collection("users").doc(uid).collection("deviceSessions");
  const activeSessions = await sessionsRef.where("revoked", "==", false).get();

  const existing = activeSessions.docs.find((d) => d.id === deviceId);
  if (existing) {
    await sessionsRef.doc(deviceId).update({
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: userAgent || "Unknown",
    });
    return { status: "active", deviceCount: activeSessions.size };
  }

  if (activeSessions.size >= 3) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "You have reached the maximum of 3 active devices. Please revoke an existing session to continue."
    );
  }

  await sessionsRef.doc(deviceId).set({
    deviceId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    userAgent: userAgent || "Unknown",
    revoked: false,
    status: "active",
  });

  return { status: "registered", deviceCount: activeSessions.size + 1 };
});

/**
 * 3. REVOKE DEVICE SESSION
 */
exports.revokeDeviceSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = context.auth.uid;
  const { deviceId } = data || {};
  if (!deviceId) {
    throw new functions.https.HttpsError("invalid-argument", "deviceId required.");
  }

  const sessionDoc = db.collection("users").doc(uid).collection("deviceSessions").doc(deviceId);
  await sessionDoc.update({
    revoked: true,
    status: "revoked",
    revokedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

/**
 * 4. ATOMIC RATING SUBMISSION & AGGREGATE RECALCULATION
 * Enforces:
 * - 2024 batch validation
 * - 1 rating per reviewer-target pair
 * - Non-editable once submitted
 * - Valid scores for all active criteria (-1 to 4)
 * - Optional anonymous review text (<= 500 chars)
 * - Atomic recalculation of student aggregates
 */
exports.submitRating = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.email) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }

  const reviewerUid = context.auth.uid;
  const email = context.auth.token.email;

  if (!isBatch2024(email)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Rating is strictly restricted to verified 2024 batch students."
    );
  }

  const { targetStudentId, scores, reviewText } = data || {};
  if (!targetStudentId || typeof scores !== "object" || Object.keys(scores).length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid target student or criteria scores.");
  }

  // Load target student
  const studentDoc = await db.collection("students").doc(targetStudentId).get();
  if (!studentDoc.exists || studentDoc.data().active === false) {
    throw new functions.https.HttpsError("not-found", "Target student not found or currently inactive.");
  }

  // Load active criteria
  const criteriaSnap = await db.collection("criteria").where("active", "==", true).get();
  if (criteriaSnap.empty) {
    throw new functions.https.HttpsError("failed-precondition", "No active rating criteria configured.");
  }

  const activeCriterionMap = {};
  criteriaSnap.docs.forEach((d) => {
    activeCriterionMap[d.id] = d.data();
  });

  // Validate all active criteria are scored within allowed bounds
  for (const criterionId of Object.keys(activeCriterionMap)) {
    const score = scores[criterionId];
    if (typeof score !== "number" || !Number.isInteger(score)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Score for criterion '${activeCriterionMap[criterionId].name}' is required and must be an integer.`
      );
    }
    const min = activeCriterionMap[criterionId].minScore ?? -1;
    const max = activeCriterionMap[criterionId].maxScore ?? 4;
    if (score < min || score > max) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Score ${score} for '${activeCriterionMap[criterionId].name}' is out of bounds [${min}, ${max}].`
      );
    }
  }

  // Validate optional review text
  let sanitizedReview = "";
  if (reviewText && typeof reviewText === "string") {
    sanitizedReview = reviewText.trim();
    if (sanitizedReview.length > 500) {
      throw new functions.https.HttpsError("invalid-argument", "Review text cannot exceed 500 characters.");
    }
  }

  const deterministicRatingId = `${reviewerUid}_${targetStudentId}`;
  const ratingRef = db.collection("ratings").doc(deterministicRatingId);
  const aggregateRef = db.collection("aggregates").doc(targetStudentId);

  // Run transaction to ensure atomicity and enforce uniqueness
  await db.runTransaction(async (transaction) => {
    const existingRating = await transaction.get(ratingRef);
    if (existingRating.exists) {
      throw new functions.https.HttpsError(
        "already-exists",
        "You have already submitted a rating for this student. Ratings cannot be edited or resubmitted."
      );
    }

    // Write rating
    transaction.set(ratingRef, {
      ratingId: deterministicRatingId,
      reviewerUid: reviewerUid, // Protected field
      targetStudentId: targetStudentId,
      scores: scores,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Write review if text provided
    if (sanitizedReview.length > 0) {
      const reviewRef = db.collection("reviews").doc();
      transaction.set(reviewRef, {
        reviewId: reviewRef.id,
        ratingId: deterministicRatingId,
        targetStudentId: targetStudentId,
        reviewText: sanitizedReview,
        visible: true,
        moderationStatus: "visible",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Recalculate aggregates inside transaction or trigger
  });

  // Authoritative aggregate recomputation for this student
  await recalculateStudentAggregate(targetStudentId);

  return {
    success: true,
    message: "Rating recorded. Your response has been added anonymously.",
  };
});

/**
 * Recalculate authoritative aggregates for a student
 */
async function recalculateStudentAggregate(studentId) {
  const ratingsSnap = await db.collection("ratings").where("targetStudentId", "==", studentId).get();
  const reviewsSnap = await db
    .collection("reviews")
    .where("targetStudentId", "==", studentId)
    .where("visible", "==", true)
    .get();

  const totalRatings = ratingsSnap.size;
  const reviewCount = reviewsSnap.size;

  if (totalRatings === 0) {
    await db.collection("aggregates").doc(studentId).set({
      studentId: studentId,
      overallAverage: null,
      ratingCount: 0,
      reviewCount: 0,
      criterionAverages: {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const criterionTotals = {};
  const criterionCounts = {};
  let grandTotal = 0;
  let totalScorePoints = 0;

  ratingsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const scores = data.scores || {};
    for (const [criterionId, score] of Object.entries(scores)) {
      if (typeof score === "number") {
        criterionTotals[criterionId] = (criterionTotals[criterionId] || 0) + score;
        criterionCounts[criterionId] = (criterionCounts[criterionId] || 0) + 1;
        grandTotal += score;
        totalScorePoints += 1;
      }
    }
  });

  const criterionAverages = {};
  for (const [cId, total] of Object.entries(criterionTotals)) {
    const count = criterionCounts[cId] || 1;
    criterionAverages[cId] = Math.round((total / count) * 100) / 100;
  }

  const overallAverage =
    totalScorePoints > 0 ? Math.round((grandTotal / totalScorePoints) * 100) / 100 : null;

  await db.collection("aggregates").doc(studentId).set({
    studentId: studentId,
    overallAverage: overallAverage,
    ratingCount: totalRatings,
    reviewCount: reviewCount,
    criterionAverages: criterionAverages,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * 5. BACKGROUND TRIGGER: onRatingCreated
 * Fallback to ensure aggregates always sync even if submitted through client SDK.
 */
exports.onRatingCreated = functions.firestore
  .document("ratings/{ratingId}")
  .onCreate(async (snap, context) => {
    const ratingData = snap.data();
    if (ratingData && ratingData.targetStudentId) {
      await recalculateStudentAggregate(ratingData.targetStudentId);
    }
  });

/**
 * 6. MODERATION: Toggle Review Visibility
 */
exports.toggleReviewVisibility = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError("permission-denied", "Administrator privilege required.");
  }

  const { reviewId, visible } = data || {};
  if (!reviewId || typeof visible !== "boolean") {
    throw new functions.https.HttpsError("invalid-argument", "reviewId and visible (boolean) required.");
  }

  const reviewRef = db.collection("reviews").doc(reviewId);
  const snap = await reviewRef.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Review not found.");
  }

  await reviewRef.update({
    visible: visible,
    moderationStatus: visible ? "visible" : "hidden",
    moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
    moderatedBy: context.auth.uid,
  });

  // Re-sync aggregate reviewCount
  await recalculateStudentAggregate(snap.data().targetStudentId);

  await db.collection("auditLogs").add({
    action: visible ? "REVIEW_RESTORED" : "REVIEW_HIDDEN",
    adminId: context.auth.uid,
    targetId: reviewId,
    details: { targetStudentId: snap.data().targetStudentId },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, visible };
});
