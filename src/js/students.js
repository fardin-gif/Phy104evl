/**
 * DU Physics 104 - Students Directory & Data Management
 */
import { 
  collection, 
  getDocs, 
  query, 
  where 
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase.js";
import { isFirebaseConfigured } from "./config.js";
import { parseGoogleDriveUrl } from "./validation.js";
import { getState, setState } from "./state.js";

/**
 * Load all active students from Firestore
 */
export async function loadStudents() {
  const db = getFirebaseDb();

  if (isFirebaseConfigured() && db) {
    try {
      const studentsCol = collection(db, "students");
      const q = query(studentsCol, where("active", "==", true));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const students = [];
        snap.forEach((doc) => {
          const data = doc.data();
          // Normalize Google Drive images
          const parsed = parseGoogleDriveUrl(data.imageUrl || data.imageSource);
          students.push({
            id: doc.id,
            ...data,
            imageUrl: parsed.directImageUrl || data.imageUrl,
          });
        });

        students.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));
        setState({ students });
        return students;
      }
    } catch (err) {
      console.warn("Could not query Firestore students:", err);
    }
  }

  // If no records in database, directory is empty until admin registers students
  setState({ students: [] });
  return [];
}

/**
 * Filter students by search keyword and rated status
 */
export function getFilteredStudents() {
  const { students, searchQuery, activeFilter, userSubmittedRatingIds } = getState();

  const queryClean = searchQuery.trim().toLowerCase();

  return students.filter((student) => {
    // Check search term
    const matchesSearch =
      !queryClean ||
      student.name.toLowerCase().includes(queryClean) ||
      (student.roll && student.roll.toLowerCase().includes(queryClean));

    if (!matchesSearch) return false;

    // Check filter tab
    const hasBeenRated = userSubmittedRatingIds.has(student.id);
    if (activeFilter === "rated") {
      return hasBeenRated;
    } else if (activeFilter === "unrated") {
      return !hasBeenRated;
    }

    return true;
  });
}

/**
 * Generate fallback initials from student name
 */
export function getInitials(name) {
  if (!name) return "DU";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
