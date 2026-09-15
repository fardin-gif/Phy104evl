/**
 * DU Physics 104 - Criteria & Rating Management
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
import { isValidScore, isValidReview } from "./validation.js";
import { getState, setState } from "./state.js";

// Default criteria configured for physics batch evaluation
export const DEFAULT_CRITERIA_SEED = [
  {
    id: "crit_comm",
    name: "Communication",
    minScore: -1,
    maxScore: 4,
    active: true,
    displayOrder: 1,
  },
  {
    id: "crit_help",
    name: "Helpfulness",
    minScore: -1,
    maxScore: 4,
    active: true,
    displayOrder: 2,
  },
  {
    id: "crit_lead",
    name: "Leadership",
    minScore: -1,
    maxScore: 4,
    active: true,
    displayOrder: 3,
  },
  {
    id: "crit_acad",
    name: "Lab & Problem Solving",
    minScore: -1,
    maxScore: 4,
    active: true,
    displayOrder: 4,
  },
  {
    id: "crit_team",
    name: "Team Spirit",
    minScore: -1,
    maxScore: 4,
    active: true,
    displayOrder: 5,
  }
];

/**
 * Load active criteria from Firestore
 */
export async function loadCriteria() {
  const db = getFirebaseDb();

  if (isFirebaseConfigured() && db) {
    try {
      const criteriaCol = collection(db, "criteria");
      const q = query(criteriaCol, where("active", "==", true));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const criteria = [];
        snap.forEach((doc) => {
          criteria.push({ id: doc.id, ...doc.data() });
        });
        criteria.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));
        setState({ criteria });
        return criteria;
      }
    } catch (err) {
      console.warn("Could not load criteria from Firestore:", err);
    }
  }

  // Fallback to default criteria
  setState({ criteria: DEFAULT_CRITERIA_SEED });
  return DEFAULT_CRITERIA_SEED;
}

/**
 * Check if the authenticated user has already rated a specific target student
 */
export async function hasUserRatedStudent(reviewerUid, targetStudentId) {
  if (!reviewerUid || !targetStudentId) return false;
  const { userSubmittedRatingIds } = getState();

  if (userSubmittedRatingIds.has(targetStudentId)) {
    return true;
  }

  const db = getFirebaseDb();
  if (isFirebaseConfigured() && db) {
    try {
      const deterministicRatingId = `${reviewerUid}_${targetStudentId}`;
      const ratingDoc = await getDoc(doc(db, "ratings", deterministicRatingId));
      if (ratingDoc.exists()) {
        userSubmittedRatingIds.add(targetStudentId);
        setState({ userSubmittedRatingIds: new Set(userSubmittedRatingIds) });
        return true;
      }
    } catch (e) {
      console.warn("Could not check rating status:", e);
    }
  }

  return false;
}

/**
 * Submit an anonymous rating for a target student
 */
export async function submitRating({ targetStudentId, scores, reviewText }) {
  const { user, criteria, aggregates, userSubmittedRatingIds } = getState();

  if (!user || !user.canSubmitRating) {
    throw new Error("Rating submission is strictly reserved for verified 2024 batch students.");
  }

  if (await hasUserRatedStudent(user.uid, targetStudentId)) {
    throw new Error("You have already rated this student. Ratings cannot be edited or resubmitted.");
  }

  // Validate all active criteria are scored
  const activeCriteria = criteria.filter((c) => c.active);
  for (const crit of activeCriteria) {
    const score = scores[crit.id];
    if (score === undefined || score === null) {
      throw new Error(`Please provide a score for '${crit.name}'.`);
    }
    const min = crit.minScore ?? APP_CONFIG.DEFAULT_MIN_SCORE;
    const max = crit.maxScore ?? APP_CONFIG.DEFAULT_MAX_SCORE;
    if (!isValidScore(score, min, max)) {
      throw new Error(`Score for '${crit.name}' must be an integer between ${min} and ${max}.`);
    }
  }

  // Validate review
  if (reviewText && !isValidReview(reviewText)) {
    throw new Error(`Review cannot exceed ${APP_CONFIG.MAX_REVIEW_LENGTH} characters.`);
  }

  const deterministicRatingId = `${user.uid}_${targetStudentId}`;
  const db = getFirebaseDb();

  if (isFirebaseConfigured() && db) {
    // 1. Write rating document
    const ratingRef = doc(db, "ratings", deterministicRatingId);
    await setDoc(ratingRef, {
      ratingId: deterministicRatingId,
      reviewerUid: user.uid, // Protected field
      targetStudentId,
      scores,
      createdAt: serverTimestamp(),
    });

    // 2. Write review document if provided
    if (reviewText && reviewText.trim().length > 0) {
      const reviewRef = doc(collection(db, "reviews"));
      await setDoc(reviewRef, {
        reviewId: reviewRef.id,
        ratingId: deterministicRatingId,
        targetStudentId,
        reviewText: reviewText.trim(),
        visible: true,
        moderationStatus: "visible",
        createdAt: serverTimestamp(),
      });
    }

    // 3. Update authoritative aggregate
    await updateLocalAndRemoteAggregate(targetStudentId, scores, Boolean(reviewText && reviewText.trim()));
  } else {
    // Local state simulation
    await updateLocalAndRemoteAggregate(targetStudentId, scores, Boolean(reviewText && reviewText.trim()), reviewText);
  }

  // Mark as rated in current user session
  userSubmittedRatingIds.add(targetStudentId);
  setState({ userSubmittedRatingIds: new Set(userSubmittedRatingIds) });

  return { success: true };
}

/**
 * Maintain and calculate arithmetic averages
 */
async function updateLocalAndRemoteAggregate(targetStudentId, newScores, hasNewReview, reviewText = "") {
  const { aggregates } = getState();
  const currentAgg = aggregates[targetStudentId] || {
    studentId: targetStudentId,
    overallAverage: null,
    ratingCount: 0,
    reviewCount: 0,
    criterionAverages: {},
  };

  const newCount = (currentAgg.ratingCount || 0) + 1;
  const newReviewCount = (currentAgg.reviewCount || 0) + (hasNewReview ? 1 : 0);

  // Recalculate criterion averages
  const newCriterionAverages = { ...(currentAgg.criterionAverages || {}) };
  let scoreSum = 0;
  let scoreCount = 0;

  for (const [cId, val] of Object.entries(newScores)) {
    const oldAvg = newCriterionAverages[cId] || 0;
    // Incremental average: (oldAvg * (newCount - 1) + val) / newCount
    const updatedAvg = Math.round(((oldAvg * (newCount - 1) + val) / newCount) * 100) / 100;
    newCriterionAverages[cId] = updatedAvg;
    scoreSum += updatedAvg;
    scoreCount++;
  }

  const newOverall = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null;

  const updatedAgg = {
    studentId: targetStudentId,
    overallAverage: newOverall,
    ratingCount: newCount,
    reviewCount: newReviewCount,
    criterionAverages: newCriterionAverages,
    updatedAt: new Date().toISOString(),
  };

  aggregates[targetStudentId] = updatedAgg;
  setState({ aggregates: { ...aggregates } });

  // If live firestore configured, save to aggregates collection
  const db = getFirebaseDb();
  if (isFirebaseConfigured() && db) {
    try {
      await setDoc(doc(db, "aggregates", targetStudentId), {
        ...updatedAgg,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Could not save aggregate to Firestore:", err);
    }
  }
}
