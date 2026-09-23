/**
 * DU Physics 104 - Anonymous Reviews Management
 */
import { 
  collection, 
  doc,
  getDoc,
  getDocs, 
  setDoc,
  query, 
  where,
  serverTimestamp 
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase.js";
import { isFirebaseConfigured, APP_CONFIG } from "./config.js";
import { isValidReview, extractBatchFromEmail } from "./validation.js";
import { getState, setState } from "./state.js";

/**
 * Fetch visible anonymous reviews for a target student
 */
export async function loadStudentReviews(targetStudentId) {
  if (!targetStudentId) return [];

  const db = getFirebaseDb();
  if (isFirebaseConfigured() && db) {
    try {
      const reviewsCol = collection(db, "reviews");
      // Query solely by targetStudentId to avoid requiring a Firestore composite index
      const q = query(
        reviewsCol,
        where("targetStudentId", "==", targetStudentId)
      );
      const snap = await getDocs(q);
      const reviews = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        // Filter visible reviews (default true if undefined)
        if (data.visible !== false) {
          let createdAtIso = new Date().toISOString();
          if (data.createdAt) {
            if (typeof data.createdAt.toDate === "function") {
              createdAtIso = data.createdAt.toDate().toISOString();
            } else if (typeof data.createdAt === "string") {
              createdAtIso = data.createdAt;
            }
          }
          reviews.push({
            id: docSnap.id,
            targetStudentId: data.targetStudentId,
            reviewText: data.reviewText || "",
            reviewerBatch: data.reviewerBatch || (data.reviewerEmail ? extractBatchFromEmail(data.reviewerEmail) : null) || null,
            createdAt: createdAtIso,
          });
        }
      });
      // Sort reviews newest first in memory
      reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return reviews;
    } catch (err) {
      console.warn("Could not load reviews from Firestore:", err);
    }
  }

  return [];
}

/**
 * Load all students that the current logged-in user has already reviewed
 */
export async function loadUserSubmittedReviews(reviewerUid) {
  if (!reviewerUid) return new Set();
  const db = getFirebaseDb();
  if (isFirebaseConfigured() && db) {
    try {
      const reviewsCol = collection(db, "reviews");
      const q = query(reviewsCol, where("reviewerUid", "==", reviewerUid));
      const snap = await getDocs(q);
      const userSubmittedReviewIds = new Set();
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.targetStudentId) {
          userSubmittedReviewIds.add(data.targetStudentId);
        }
      });
      setState({ userSubmittedReviewIds });
      return userSubmittedReviewIds;
    } catch (err) {
      console.warn("Could not load user's submitted reviews:", err);
    }
  }
  return new Set();
}

/**
 * Check if the user has already submitted a review for this target student
 */
export async function hasUserReviewedStudent(reviewerUid, targetStudentId) {
  if (!reviewerUid || !targetStudentId) return false;
  const { userSubmittedReviewIds } = getState();

  if (userSubmittedReviewIds.has(targetStudentId)) {
    return true;
  }

  const db = getFirebaseDb();
  if (isFirebaseConfigured() && db) {
    try {
      const q = query(
        collection(db, "reviews"),
        where("reviewerUid", "==", reviewerUid),
        where("targetStudentId", "==", targetStudentId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        userSubmittedReviewIds.add(targetStudentId);
        setState({ userSubmittedReviewIds: new Set(userSubmittedReviewIds) });
        return true;
      }
    } catch (e) {
      console.warn("Could not check review status:", e);
    }
  }

  return false;
}

/**
 * Submit a review-only for a target student (e.g. from non-2024 batches or 2024 members submitting a review)
 */
export async function submitReviewOnly({ targetStudentId, reviewText }) {
  const { user, userSubmittedReviewIds, aggregates } = getState();

  if (!user || !user.canSubmitReview) {
    throw new Error("Review submission is reserved for verified Physics Department students.");
  }

  const trimmedText = (reviewText || "").trim();
  if (!trimmedText) {
    throw new Error("Please write your review feedback.");
  }

  if (!isValidReview(trimmedText)) {
    throw new Error(`Review cannot exceed ${APP_CONFIG.MAX_REVIEW_LENGTH} characters.`);
  }

  if (await hasUserReviewedStudent(user.uid, targetStudentId)) {
    throw new Error("You have already submitted a review for this student.");
  }

  const reviewerBatch = user.batch || extractBatchFromEmail(user.email) || "Physics";
  const db = getFirebaseDb();

  if (isFirebaseConfigured() && db) {
    const reviewRef = doc(collection(db, "reviews"));
    await setDoc(reviewRef, {
      reviewId: reviewRef.id,
      reviewerUid: user.uid,
      reviewerEmail: user.email,
      reviewerBatch,
      targetStudentId,
      reviewText: trimmedText,
      visible: true,
      moderationStatus: "visible",
      createdAt: serverTimestamp(),
    });

    // Update aggregate review count in Firestore
    try {
      const revSnap = await getDocs(query(collection(db, "reviews"), where("targetStudentId", "==", targetStudentId)));
      let revCount = 0;
      revSnap.forEach((d) => {
        if (d.data().visible !== false) revCount++;
      });

      const currentAgg = aggregates[targetStudentId] || {
        studentId: targetStudentId,
        overallAverage: null,
        ratingCount: 0,
        reviewCount: 0,
        criterionAverages: {},
      };

      const updatedAgg = {
        ...currentAgg,
        reviewCount: revCount,
        updatedAt: new Date().toISOString(),
      };

      aggregates[targetStudentId] = updatedAgg;
      setState({ aggregates: { ...aggregates } });

      await setDoc(doc(db, "aggregates", targetStudentId), {
        ...updatedAgg,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (aggErr) {
      console.warn("Could not update aggregate review count:", aggErr);
    }
  } else {
    // Local simulation
    const currentAgg = aggregates[targetStudentId] || {
      studentId: targetStudentId,
      overallAverage: null,
      ratingCount: 0,
      reviewCount: 0,
      criterionAverages: {},
    };
    aggregates[targetStudentId] = {
      ...currentAgg,
      reviewCount: (currentAgg.reviewCount || 0) + 1,
    };
    setState({ aggregates: { ...aggregates } });
  }

  userSubmittedReviewIds.add(targetStudentId);
  setState({ userSubmittedReviewIds: new Set(userSubmittedReviewIds) });

  return { success: true };
}
