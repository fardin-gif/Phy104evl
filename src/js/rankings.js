/**
 * DU Physics 104 - Peer Perception Rankings (Measurement Table)
 */
import { getState } from "./state.js";
import { APP_CONFIG } from "./config.js";

/**
 * Compute sorted rankings for active students based on rating scores.
 * Ranking order is computed using the background weighted formula:
 * (65 * rating_value + 35 * rating_count) / 100
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
    const overallAvg = hasRating ? Number(agg.overallAverage) : null;

    // Background formula: (65 * rating value + 35 * rating count) / 100
    const rankingScore = hasRating ? ((65 * overallAvg) + (35 * count)) / 100 : -Infinity;

    return {
      student,
      overallAverage: overallAvg,
      ratingCount: count,
      reviewCount: agg.reviewCount || 0,
      hasRating,
      rankingScore,
    };
  });

  // Ranking sorting strategy:
  // 1. Students with ratings come before unrated students.
  // 2. Background formula score (rankingScore DESC).
  // 3. Higher overallAverage DESC (tiebreaker).
  // 4. Higher ratingCount DESC (tiebreaker).
  // 5. Student roll ASC (tiebreaker).
  // 6. Unrated students placed at bottom, sorted by roll ASC.
  enriched.sort((a, b) => {
    if (a.hasRating && !b.hasRating) return -1;
    if (!a.hasRating && b.hasRating) return 1;

    if (a.hasRating && b.hasRating) {
      if (b.rankingScore !== a.rankingScore) {
        return b.rankingScore - a.rankingScore;
      }
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
 * Identify the top N students with the highest number of written reviews.
 * Returns an array of up to limit items with reviewCount > 0.
 */
export function getTopReviewedPersons(limit = 3) {
  const { students, aggregates } = getState();
  const activeStudents = students.filter((s) => s.active);

  const list = [];
  for (const student of activeStudents) {
    const agg = aggregates[student.id];
    const reviewCount = agg?.reviewCount || 0;
    if (reviewCount > 0) {
      list.push({
        student,
        reviewCount,
        overallAverage: agg?.overallAverage ?? null,
        ratingCount: agg?.ratingCount ?? 0,
      });
    }
  }

  // Sort descending by reviewCount, tiebreakers: ratingCount DESC, roll ASC
  list.sort((a, b) => {
    if (b.reviewCount !== a.reviewCount) {
      return b.reviewCount - a.reviewCount;
    }
    if (b.ratingCount !== a.ratingCount) {
      return b.ratingCount - a.ratingCount;
    }
    return (a.student.roll || "").localeCompare(b.student.roll || "");
  });

  return list.slice(0, limit);
}

/**
 * Identify the student with the highest number of written reviews.
 * Returns null if no students have any reviews.
 */
export function getMostReviewedPerson() {
  const topList = getTopReviewedPersons(1);
  return topList.length > 0 ? topList[0] : null;
}
