/**
 * DU Physics 104 - Anonymous Reviews Management
 */
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy 
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
      const q = query(
        reviewsCol,
        where("targetStudentId", "==", targetStudentId),
        where("visible", "==", true),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const reviews = [];
      snap.forEach((doc) => {
        const data = doc.data();
        reviews.push({
          id: doc.id,
          targetStudentId: data.targetStudentId,
          reviewText: data.reviewText,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : new Date().toISOString(),
        });
      });
      return reviews;
    } catch (err) {
      console.warn("Could not load reviews from Firestore:", err);
    }
  }

  return [];
}
