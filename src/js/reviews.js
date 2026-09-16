/**
 * DU Physics 104 - Anonymous Reviews Management
 */
import { 
  collection, 
  getDocs, 
  query, 
  where 
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase.js";
import { isFirebaseConfigured } from "./config.js";

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
