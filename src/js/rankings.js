/**
 * DU Physics 104 - Peer Perception Rankings (Measurement Table)
 */
import { getState } from "./state.js";
import { APP_CONFIG } from "./config.js";

/**
 * Compute sorted rankings for active students based on arithmetic overall average.
 * Note: Only students with at least MIN_RATINGS_THRESHOLD (3) ratings are ranked with visible scores.
 */
export function calculateRankings() {
  const { students, aggregates } = getState();
  const threshold = APP_CONFIG.MIN_RATINGS_THRESHOLD ?? 3;

  const activeStudents = students.filter((s) => s.active);

  const enriched = activeStudents.map((student) => {
    const agg = aggregates[student.id] || {
      overallAverage: null,
      ratingCount: 0,
      reviewCount: 0,
    };

    const count = agg.ratingCount || 0;
    const hasMetThreshold = count >= threshold;

    return {
      student,
      overallAverage: agg.overallAverage,
      ratingCount: count,
      reviewCount: agg.reviewCount || 0,
      hasMetThreshold,
    };
  });

  // Stable sorting strategy:
  // 1. Students who have met the threshold and have scores first
  // 2. Highest overallAverage desc
  // 3. Higher ratingCount desc (more consensus)
  // 4. Then students below threshold, sorted by ratingCount desc then roll
  enriched.sort((a, b) => {
    const aEligible = a.hasMetThreshold && a.overallAverage !== null;
    const bEligible = b.hasMetThreshold && b.overallAverage !== null;

    if (aEligible && !bEligible) return -1;
    if (!aEligible && bEligible) return 1;

    if (aEligible && bEligible) {
      if (b.overallAverage !== a.overallAverage) {
        return b.overallAverage - a.overallAverage;
      }
      if (b.ratingCount !== a.ratingCount) {
        return b.ratingCount - a.ratingCount;
      }
      return (a.student.roll || "").localeCompare(b.student.roll || "");
    }

    // Both below threshold
    if (b.ratingCount !== a.ratingCount) {
      return b.ratingCount - a.ratingCount;
    }
    return (a.student.roll || "").localeCompare(b.student.roll || "");
  });

  return enriched;
}

/**
 * Identify the student with the highest number of written reviews.
 * Returns null if no students have any reviews.
 */
export function getMostReviewedPerson() {
  const { students, aggregates } = getState();
  const activeStudents = students.filter((s) => s.active);

  let topPerson = null;
  let maxReviews = 0;

  for (const student of activeStudents) {
    const agg = aggregates[student.id];
    const reviewCount = agg?.reviewCount || 0;
    if (reviewCount > maxReviews) {
      maxReviews = reviewCount;
      topPerson = {
        student,
        reviewCount,
        overallAverage: agg?.overallAverage ?? null,
        ratingCount: agg?.ratingCount ?? 0,
      };
    }
  }

  return topPerson;
}
