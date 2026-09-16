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
      } else {
        // Check if criteria collection has any docs at all; if completely empty, seed default
        const allSnap = await getDocs(criteriaCol);
        if (allSnap.empty) {
          for (const c of DEFAULT_CRITERIA_SEED) {
            try {
              await setDoc(doc(db, "criteria", c.id), {
                ...c,
                createdAt: serverTimestamp(),
              }, { merge: true });
            } catch (seedErr) {
              console.warn("Could not seed default criterion:", seedErr);
            }
          }
        }
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
 * Load all aggregates from Firestore and populate global state
 */
export async function loadAggregates() {
  const db = getFirebaseDb();
  if (isFirebaseConfigured() && db) {
    try {
      const aggSnap = await getDocs(collection(db, "aggregates"));
      const aggregates = {};
      aggSnap.forEach((docSnap) => {
        aggregates[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });

      // If aggregates collection is empty, backfill from individual ratings
      if (Object.keys(aggregates).length === 0) {
        try {
          const ratingsSnap = await getDocs(collection(db, "ratings"));
          if (!ratingsSnap.empty) {
            const studentRatings = {};
            ratingsSnap.forEach((d) => {
              const data = d.data() || {};
              const sId = data.targetStudentId;
              if (sId) {
                if (!studentRatings[sId]) studentRatings[sId] = [];
                studentRatings[sId].push(data.scores || {});
              }
            });

            for (const [sId, ratingsList] of Object.entries(studentRatings)) {
              const count = ratingsList.length;
              const criterionSums = {};
              const criterionCounts = {};
              for (const sc of ratingsList) {
                for (const [cId, val] of Object.entries(sc)) {
                  criterionSums[cId] = (criterionSums[cId] || 0) + Number(val);
                  criterionCounts[cId] = (criterionCounts[cId] || 0) + 1;
                }
              }

              const critAvgs = {};
              let overallSum = 0;
              let overallCount = 0;
              for (const [cId, sum] of Object.entries(criterionSums)) {
                const cCount = criterionCounts[cId] || 1;
                const avg = Math.round((sum / cCount) * 100) / 100;
                critAvgs[cId] = avg;
                overallSum += avg;
                overallCount++;
              }
              const overall = overallCount > 0 ? Math.round((overallSum / overallCount) * 100) / 100 : null;

              const aggObj = {
                studentId: sId,
                overallAverage: overall,
                ratingCount: count,
                reviewCount: 0,
                criterionAverages: critAvgs,
              };
              aggregates[sId] = aggObj;
              setDoc(doc(db, "aggregates", sId), aggObj).catch(() => {});
            }
          }
        } catch (backfillErr) {
          console.warn("Could not backfill aggregates from ratings:", backfillErr);
        }
      }

      setState({ aggregates });
      return aggregates;
    } catch (err) {
      console.warn("Could not load aggregates from Firestore:", err);
    }
  }
  return {};
}

/**
 * Load all students that the current logged-in user has already rated
 */
export async function loadUserSubmittedRatings(reviewerUid) {
  if (!reviewerUid) return new Set();
  const db = getFirebaseDb();
  if (isFirebaseConfigured() && db) {
    try {
      const ratingsCol = collection(db, "ratings");
      const q = query(ratingsCol, where("reviewerUid", "==", reviewerUid));
      const snap = await getDocs(q);
      const userSubmittedRatingIds = new Set();
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.targetStudentId) {
          userSubmittedRatingIds.add(data.targetStudentId);
        }
      });
      setState({ userSubmittedRatingIds });
      return userSubmittedRatingIds;
    } catch (err) {
      console.warn("Could not load user's submitted ratings:", err);
    }
  }
  return new Set();
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
  const { user, criteria, userSubmittedRatingIds } = getState();

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
  const db = getFirebaseDb();

  // If live Firestore, query all ratings for this student to ensure 100% mathematical accuracy
  if (isFirebaseConfigured() && db) {
    try {
      const q = query(collection(db, "ratings"), where("targetStudentId", "==", targetStudentId));
      const ratingsSnap = await getDocs(q);
      if (!ratingsSnap.empty) {
        let rCount = 0;
        const cSums = {};
        const cCounts = {};
        ratingsSnap.forEach((docSnap) => {
          rCount++;
          const data = docSnap.data() || {};
          const sc = data.scores || {};
          for (const [cId, val] of Object.entries(sc)) {
            cSums[cId] = (cSums[cId] || 0) + Number(val);
            cCounts[cId] = (cCounts[cId] || 0) + 1;
          }
        });

        const cAvgs = {};
        let sumAvgs = 0;
        let countAvgs = 0;
        for (const [cId, sum] of Object.entries(cSums)) {
          const count = cCounts[cId] || 1;
          const avg = Math.round((sum / count) * 100) / 100;
          cAvgs[cId] = avg;
          sumAvgs += avg;
          countAvgs++;
        }

        const overall = countAvgs > 0 ? Math.round((sumAvgs / countAvgs) * 100) / 100 : null;

        // Query review count
        let revCount = 0;
        try {
          const revSnap = await getDocs(query(collection(db, "reviews"), where("targetStudentId", "==", targetStudentId)));
          revSnap.forEach((d) => {
            if (d.data().visible !== false) revCount++;
          });
        } catch (e) {}

        const freshAgg = {
          studentId: targetStudentId,
          overallAverage: overall,
          ratingCount: rCount,
          reviewCount: revCount,
          criterionAverages: cAvgs,
          updatedAt: new Date().toISOString(),
        };

        aggregates[targetStudentId] = freshAgg;
        setState({ aggregates: { ...aggregates } });

        await setDoc(doc(db, "aggregates", targetStudentId), {
          ...freshAgg,
          updatedAt: serverTimestamp(),
        });
        return;
      }
    } catch (computeErr) {
      console.warn("Could not recompute aggregate from all ratings:", computeErr);
    }
  }

  // Incremental fallback
  const currentAgg = aggregates[targetStudentId] || {
    studentId: targetStudentId,
    overallAverage: null,
    ratingCount: 0,
    reviewCount: 0,
    criterionAverages: {},
  };

  const newCount = (currentAgg.ratingCount || 0) + 1;
  const newReviewCount = (currentAgg.reviewCount || 0) + (hasNewReview ? 1 : 0);

  const newCriterionAverages = { ...(currentAgg.criterionAverages || {}) };
  let scoreSum = 0;
  let scoreCount = 0;

  for (const [cId, val] of Object.entries(newScores)) {
    const oldAvg = newCriterionAverages[cId] || 0;
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
