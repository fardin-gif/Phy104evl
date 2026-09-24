/**
 * DU Physics 104 - Peer Perception Rankings (Measurement Table)
 */
import { getState } from "./state.js";
import { APP_CONFIG } from "./config.js";

/**
 * Compute sorted rankings for active students based on rating scores.
 * Highest rated person is top priority.
 * Reviews are NOT counted for this ranking, strictly ratings.
 */
export function calculateRankings() {
  const { students, aggregates } = getState();

  const activeStudents = students.filter((s) => s.active);

  const enriched = activeStudents.map((student) => {
    const agg = aggregates[student.id] || {
      overallAverage: null,
      ratingCount: 0,
      reviewCount: 0,
    };

    const count = agg.ratingCount || 0;
    const hasRating = count > 0 && agg.overallAverage !== null && agg.overallAverage !== undefined && !isNaN(agg.overallAverage);

    return {
      student,
      overallAverage: hasRating ? Number(agg.overallAverage) : null,
      ratingCount: count,
      reviewCount: agg.reviewCount || 0,
      hasRating,
    };
  });

  // Ranking sorting strategy:
  // 1. Students with ratings come before unrated students.
  // 2. Highest rated person is top priority (overallAverage DESC).
  //    (Reviews do NOT count for this ranking, purely ratings).
  // 3. Higher ratingCount DESC (tiebreaker for same rating score).
  // 4. Student roll ASC (tiebreaker).
  // 5. Unrated students placed at bottom, sorted by roll ASC.
  enriched.sort((a, b) => {
    if (a.hasRating && !b.hasRating) return -1;
    if (!a.hasRating && b.hasRating) return 1;

    if (a.hasRating && b.hasRating) {
      if (b.overallAverage !== a.overallAverage) {
        return b.overallAverage - a.overallAverage;
      }
      if (b.ratingCount !== a.ratingCount) {
        return b.ratingCount - a.ratingCount;
      }
      return (a.student.roll || "").localeCompare(b.student.roll || "");
    }

    // Both unrated: sort by roll
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
