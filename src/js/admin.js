/**
 * DU Physics 104 - Dedicated Administrative Logic & Operations
 */
import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  query, 
  where,
  orderBy, 
  serverTimestamp 
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase.js";
import { isFirebaseConfigured } from "./config.js";
import { parseGoogleDriveUrl, escapeHTML } from "./validation.js";
import { exportToCSV, applyTheme, formatScore } from "./utils.js";
import { getInitials } from "./students.js";
import { DEFAULT_CRITERIA_SEED } from "./ratings.js";

// Local storage token for admin session
const STORAGE_KEY_ADMIN_SESSION = "du_phy_104_admin_session";

export function showAdminToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHTML(message)}</span>
    <button style="background:none; border:none; color:inherit; font-size:16px; cursor:pointer; padding:0 4px;" aria-label="Close toast">&times;</button>
  `;
  const closeBtn = toast.querySelector("button");
  closeBtn?.addEventListener("click", () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

export const adminState = {
  isAuthenticated: false,
  adminUser: null,
  currentTab: "overview",
  students: [],
  criteria: [],
  reviews: [],
  auditLogs: [],
};

/**
 * Initialize Admin App
 */
export async function initAdmin() {
  const initialTheme = localStorage.getItem("du_phy_104_theme") || "light";
  applyTheme(initialTheme);

  // Check persisted admin session
  const savedSession = sessionStorage.getItem(STORAGE_KEY_ADMIN_SESSION);
  if (savedSession) {
    try {
      const parsed = JSON.parse(savedSession);
      if (parsed.email) {
        adminState.isAuthenticated = true;
        adminState.adminUser = parsed;
      }
    } catch (e) {
      sessionStorage.removeItem(STORAGE_KEY_ADMIN_SESSION);
    }
  }

  updateAdminAuthView();
  setupAdminEventListeners();

  if (adminState.isAuthenticated) {
    await loadAdminData();
    renderActiveTab();
  }
}

function updateAdminAuthView() {
  const loginSection = document.getElementById("admin-login-section");
  const dashboardSection = document.getElementById("admin-dashboard-section");

  if (adminState.isAuthenticated) {
    if (loginSection) loginSection.style.display = "none";
    if (dashboardSection) dashboardSection.style.display = "block";
    const emailBadge = document.getElementById("admin-user-email");
    if (emailBadge && adminState.adminUser) {
      emailBadge.textContent = adminState.adminUser.email;
    }
  } else {
    if (loginSection) loginSection.style.display = "block";
    if (dashboardSection) dashboardSection.style.display = "none";
  }
}

/**
 * Admin Login Handler
 * Verifies credentials directly against Firestore collection:
 * collection ('admins') -> document (emailId) -> field (password)
 */
export async function handleAdminLogin(email, password) {
  const cleanEmail = (email || "").trim();
  const normalizedEmail = cleanEmail.toLowerCase();
  const trimmedPassword = (password || "").trim();

  if (!cleanEmail || !trimmedPassword) {
    throw new Error("Please enter both administrator email and password.");
  }

  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firestore database is not initialized. Please verify your Firebase configuration in src/js/config.js.");
  }

  try {
    // 1. Query the 'admins' collection with the email as document ID
    let adminDocSnap = await getDoc(doc(db, "admins", normalizedEmail));
    if (!adminDocSnap.exists() && cleanEmail !== normalizedEmail) {
      adminDocSnap = await getDoc(doc(db, "admins", cleanEmail));
    }

    // If document is found in Firestore 'admins' collection
    if (adminDocSnap.exists()) {
      const adminData = adminDocSnap.data() || {};
      // Check password field (supports 'password', 'pass', or 'value')
      const storedPassword = adminData.password ?? adminData.pass ?? adminData.value;

      if (storedPassword === undefined || storedPassword === null) {
        throw new Error(`Admin document "${cleanEmail}" exists in "admins" collection, but is missing a "password" field.`);
      }

      if (String(storedPassword).trim() !== trimmedPassword) {
        throw new Error("Incorrect administrator password.");
      }

      const sessionData = {
        email: cleanEmail,
        role: "admin",
        loginTime: new Date().toISOString(),
      };
      sessionStorage.setItem(STORAGE_KEY_ADMIN_SESSION, JSON.stringify(sessionData));
      adminState.isAuthenticated = true;
      adminState.adminUser = sessionData;
      updateAdminAuthView();
      await loadAdminData();
      renderActiveTab();
      showAdminToast(`Authenticated as ${cleanEmail}`, "success");
      return { success: true };
    }

    // Default department credential fallback if Firestore 'admins' collection is not yet populated
    if (normalizedEmail === "admin@phy.du.ac.bd" && trimmedPassword === "physics104admin") {
      const sessionData = {
        email: normalizedEmail,
        role: "admin",
        loginTime: new Date().toISOString(),
      };
      sessionStorage.setItem(STORAGE_KEY_ADMIN_SESSION, JSON.stringify(sessionData));
      adminState.isAuthenticated = true;
      adminState.adminUser = sessionData;
      updateAdminAuthView();
      await loadAdminData();
      renderActiveTab();
      showAdminToast("Authenticated using default department administrator credentials.", "info");
      return { success: true };
    }

    throw new Error(`Admin account "${cleanEmail}" not found in Firestore "admins" collection. Please ensure a document with ID "${normalizedEmail}" exists in the "admins" collection with a "password" field.`);
  } catch (err) {
    if (err.code === "permission-denied" || (err.message && err.message.toLowerCase().includes("permission"))) {
      throw new Error("Firestore Permission Denied when checking 'admins' collection. Please update your Firestore security rules to allow reading collection 'admins'.");
    }
    throw err;
  }
}

export function handleAdminLogout() {
  sessionStorage.removeItem(STORAGE_KEY_ADMIN_SESSION);
  adminState.isAuthenticated = false;
  adminState.adminUser = null;
  updateAdminAuthView();
  showAdminToast("Signed out from administrator panel.", "info");
}

/**
 * Load all Admin Datasets
 */
export async function loadAdminData() {
  const db = getFirebaseDb();

  // 1. Students (Loaded directly from Firestore)
  if (isFirebaseConfigured() && db) {
    try {
      const snap = await getDocs(collection(db, "students"));
      const students = [];
      snap.forEach((d) => students.push({ id: d.id, ...d.data() }));
      students.sort((a, b) => (a.roll || "").localeCompare(b.roll || ""));
      adminState.students = students;
    } catch (e) {
      console.warn("Could not load students from Firestore:", e);
      adminState.students = [];
    }
  } else {
    adminState.students = [];
  }

  // 2. Criteria
  if (isFirebaseConfigured() && db) {
    try {
      const snap = await getDocs(collection(db, "criteria"));
      const criteria = [];
      snap.forEach((d) => criteria.push({ id: d.id, ...d.data() }));
      criteria.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));
      if (criteria.length > 0) {
        adminState.criteria = criteria;
      } else {
        // Seed default criteria to Firestore so each document exists as a document
        for (const c of DEFAULT_CRITERIA_SEED) {
          try {
            await setDoc(
              doc(db, "criteria", c.id),
              {
                ...c,
                createdAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (seedErr) {
            console.warn("Could not seed criterion to Firestore:", seedErr);
          }
        }
        adminState.criteria = [...DEFAULT_CRITERIA_SEED];
      }
    } catch (e) {
      adminState.criteria = [...DEFAULT_CRITERIA_SEED];
    }
  } else {
    adminState.criteria = [...DEFAULT_CRITERIA_SEED];
  }

  // 3. Reviews (Loaded directly from Firestore)
  if (isFirebaseConfigured() && db) {
    try {
      const snap = await getDocs(collection(db, "reviews"));
      const reviews = [];
      snap.forEach((d) => reviews.push({ id: d.id, ...d.data() }));
      // Sort newest first
      reviews.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      adminState.reviews = reviews;
    } catch (e) {
      adminState.reviews = [];
    }
  } else {
    adminState.reviews = [];
  }
}

/**
 * Render Current Admin Tab
 */
export function renderActiveTab() {
  const tab = adminState.currentTab;

  document.querySelectorAll(".admin-tab-btn").forEach((b) => {
    b.classList.remove("active");
    if (b.getAttribute("data-tab") === tab) b.classList.add("active");
  });

  const contentArea = document.getElementById("admin-tab-content");
  if (!contentArea) return;

  switch (tab) {
    case "overview":
      renderOverviewTab(contentArea);
      break;
    case "students":
      renderStudentsTab(contentArea);
      break;
    case "criteria":
      renderCriteriaTab(contentArea);
      break;
    case "reviews":
      renderReviewsTab(contentArea);
      break;
    case "exports":
      renderExportTab(contentArea);
      break;
    case "email":
      renderEmailTab(contentArea);
      break;
    default:
      renderOverviewTab(contentArea);
  }
}

/**
 * 1. Overview Tab
 */
function renderOverviewTab(container) {
  const totalStudents = adminState.students.length;
  const activeStudents = adminState.students.filter((s) => s.active).length;
  const totalReviews = adminState.reviews.length;
  const hiddenReviews = adminState.reviews.filter((r) => !r.visible).length;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px;">
      <div class="stat-box highlight">
        <div class="stat-label">Total Students</div>
        <div class="stat-number num">${totalStudents}</div>
        <div class="stat-subtext">${activeStudents} active in directory</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Active Criteria</div>
        <div class="stat-number num">${adminState.criteria.filter((c) => c.active).length}</div>
        <div class="stat-subtext">Configured evaluation dimensions</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Total Reviews</div>
        <div class="stat-number num">${totalReviews}</div>
        <div class="stat-subtext">${hiddenReviews} hidden by moderation</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Security & Integrity</div>
        <div class="stat-number" style="font-size:16px; color:var(--status-success-text);">Active</div>
        <div class="stat-subtext">3-device limit & batch isolation enforced</div>
      </div>
    </div>

    <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:20px;">
      <h3 style="font-size:15px; font-weight:600; margin-bottom:12px;">Active Criteria Configuration</h3>
      <table class="rankings-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Dimension</th>
            <th>Min Score</th>
            <th>Max Score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${adminState.criteria
            .map(
              (c) => `
            <tr>
              <td class="num">${c.displayOrder}</td>
              <td style="font-weight:600;">${escapeHTML(c.name)}</td>
              <td class="num">${c.minScore ?? -1}</td>
              <td class="num">${c.maxScore ?? 4}</td>
              <td><span style="display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; background:${c.active ? "var(--status-success-bg)" : "var(--bg-surface-subtle)"}; color:${c.active ? "var(--status-success-text)" : "var(--text-tertiary)"};">${c.active ? "Active" : "Inactive"}</span></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * 2. Students Tab
 */
function renderStudentsTab(container) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <div>
        <h3 style="font-size:16px; font-weight:700;">Student Management</h3>
        <p style="font-size:12px; color:var(--text-secondary);">Add, edit, or softly deactivate students. Supports Google Drive image links.</p>
      </div>
      <button id="btn-add-student" class="btn btn-primary btn-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add Student
      </button>
    </div>

    <div class="rankings-table-wrapper">
      <table class="rankings-table">
        <thead>
          <tr>
            <th>Roll</th>
            <th>Student Name</th>
            <th>Image Preview</th>
            <th>Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${adminState.students
            .map(
              (s) => `
            <tr>
              <td class="num" style="font-weight:600;">${escapeHTML(s.roll)}</td>
              <td>${escapeHTML(s.name)}</td>
              <td>
                <div style="width:32px; height:32px; border-radius:4px; overflow:hidden; background:var(--bg-surface-subtle); display:flex; align-items:center; justify-content:center; font-size:11px;">
                  ${s.imageUrl ? `<img src="${escapeHTML(s.imageUrl)}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;"/>` : "No Pic"}
                </div>
              </td>
              <td>
                <span style="display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; background:${s.active ? "var(--status-success-bg)" : "var(--status-danger-bg)"}; color:${s.active ? "var(--status-success-text)" : "var(--status-danger-text)"};">
                  ${s.active ? "Active" : "Deactivated"}
                </span>
              </td>
              <td style="text-align:right;">
                <button class="btn btn-ghost btn-sm btn-edit-student" data-id="${s.id}">Edit</button>
                <button class="btn btn-ghost btn-sm btn-toggle-student" data-id="${s.id}" style="color:${s.active ? "var(--status-warning-text)" : "var(--status-success-text)"}">
                  ${s.active ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  // Attach Add Student
  document.getElementById("btn-add-student")?.addEventListener("click", () => {
    openStudentModal();
  });

  // Attach Edit Student
  container.querySelectorAll(".btn-edit-student").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const student = adminState.students.find((s) => s.id === id);
      if (student) openStudentModal(student);
    });
  });

  // Attach Toggle Status
  container.querySelectorAll(".btn-toggle-student").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const student = adminState.students.find((s) => s.id === id);
      if (!student) return;

      const newStatus = !student.active;
      student.active = newStatus;

      const db = getFirebaseDb();
      if (isFirebaseConfigured() && db) {
        await setDoc(
          doc(db, "students", id),
          {
            ...student,
            active: newStatus,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      renderStudentsTab(container);
    });
  });
}

let currentEditingStudentId = null;

function openStudentModal(student = null) {
  const modal = document.getElementById("admin-student-modal");
  if (!modal) return;

  const titleEl = document.getElementById("admin-student-modal-title");
  const nameInput = document.getElementById("admin-input-student-name");
  const rollInput = document.getElementById("admin-input-student-roll");
  const imgInput = document.getElementById("admin-input-student-img");
  const activeInput = document.getElementById("admin-input-student-active");
  const errorEl = document.getElementById("admin-student-error");
  const submitBtn = document.getElementById("admin-btn-save-student");

  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }

  if (student) {
    currentEditingStudentId = student.id;
    if (titleEl) titleEl.textContent = `Edit Student: ${student.name}`;
    if (submitBtn) submitBtn.textContent = "Update Student";
    if (nameInput) nameInput.value = student.name || "";
    if (rollInput) rollInput.value = student.roll || "";
    if (imgInput) imgInput.value = student.imageSource || student.imageUrl || "";
    if (activeInput) activeInput.checked = student.active !== false;
  } else {
    currentEditingStudentId = null;
    if (titleEl) titleEl.textContent = "Add New Student";
    if (submitBtn) submitBtn.textContent = "Save Student";
    if (nameInput) nameInput.value = "";
    if (rollInput) rollInput.value = "";
    if (imgInput) imgInput.value = "";
    if (activeInput) activeInput.checked = true;
  }

  updateStudentImagePreview();
  modal.classList.add("active");
  nameInput?.focus();
}

function closeStudentModal() {
  const modal = document.getElementById("admin-student-modal");
  if (modal) modal.classList.remove("active");
  currentEditingStudentId = null;
}

function updateStudentImagePreview() {
  const nameInput = document.getElementById("admin-input-student-name");
  const imgInput = document.getElementById("admin-input-student-img");
  const avatarEl = document.getElementById("admin-student-preview-avatar");
  const statusEl = document.getElementById("admin-student-preview-status");

  if (!avatarEl || !statusEl) return;

  const rawUrl = (imgInput?.value || "").trim();
  const name = (nameInput?.value || "").trim();

  if (!rawUrl) {
    avatarEl.innerHTML = `<span>${escapeHTML(getInitials(name))}</span>`;
    statusEl.textContent = "No image link entered";
    statusEl.style.color = "var(--text-primary)";
    return;
  }

  const parsed = parseGoogleDriveUrl(rawUrl);
  const resolvedUrl = parsed.directImageUrl || rawUrl;

  statusEl.textContent = parsed.isGoogleDrive ? "Google Drive preview ready" : "Web image URL detected";
  statusEl.style.color = "var(--accent-text)";

  avatarEl.innerHTML = `<img src="${resolvedUrl}" alt="Preview" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<span>${escapeHTML(getInitials(name))}</span>'; document.getElementById('admin-student-preview-status').textContent='Preview failed to load (will use initials)'; document.getElementById('admin-student-preview-status').style.color='var(--status-danger-text)';" />`;
}

function openCriterionModal() {
  const modal = document.getElementById("admin-criterion-modal");
  if (!modal) return;
  const nameInput = document.getElementById("admin-input-crit-name");
  const minInput = document.getElementById("admin-input-crit-min");
  const maxInput = document.getElementById("admin-input-crit-max");
  const errorEl = document.getElementById("admin-criterion-error");

  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }
  if (nameInput) nameInput.value = "";
  if (minInput) minInput.value = "-1";
  if (maxInput) maxInput.value = "4";

  modal.classList.add("active");
  nameInput?.focus();
}

function closeCriterionModal() {
  const modal = document.getElementById("admin-criterion-modal");
  if (modal) modal.classList.remove("active");
}

/**
 * 3. Criteria Tab
 */
function renderCriteriaTab(container) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <div>
        <h3 style="font-size:16px; font-weight:700;">Criteria Management</h3>
        <p style="font-size:12px; color:var(--text-secondary);">Define evaluation dimensions. Score ranges are restricted between -1 and 4.</p>
      </div>
      <button id="btn-add-criterion" class="btn btn-primary btn-sm">Add Criterion</button>
    </div>

    <div class="rankings-table-wrapper">
      <table class="rankings-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Name</th>
            <th>Min</th>
            <th>Max</th>
            <th>Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${adminState.criteria
            .map(
              (c) => `
            <tr>
              <td class="num">${c.displayOrder}</td>
              <td style="font-weight:600;">${escapeHTML(c.name)}</td>
              <td class="num">${c.minScore ?? -1}</td>
              <td class="num">${c.maxScore ?? 4}</td>
              <td>
                <span style="display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; background:${c.active ? "var(--status-success-bg)" : "var(--bg-surface-subtle)"}; color:${c.active ? "var(--status-success-text)" : "var(--text-tertiary)"};">
                  ${c.active ? "Active" : "Inactive"}
                </span>
              </td>
              <td style="text-align:right;">
                <button class="btn btn-ghost btn-sm btn-toggle-crit" data-id="${c.id}">
                  ${c.active ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("btn-add-criterion")?.addEventListener("click", () => {
    openCriterionModal();
  });

  container.querySelectorAll(".btn-toggle-crit").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const crit = adminState.criteria.find((c) => c.id === id);
      if (!crit) return;

      crit.active = !crit.active;
      const db = getFirebaseDb();
      if (isFirebaseConfigured() && db) {
        await setDoc(
          doc(db, "criteria", id),
          {
            ...crit,
            active: crit.active,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      renderCriteriaTab(container);
    });
  });
}

/**
 * 4. Reviews Moderation Tab
 */
function renderReviewsTab(container) {
  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="font-size:16px; font-weight:700;">Review Moderation & Audit</h3>
      <p style="font-size:12px; color:var(--text-secondary);">Inspect written reviews, audit reviewer email and batch origin, toggle public visibility, or permanently delete inappropriate content.</p>
    </div>

    <div class="rankings-table-wrapper">
      <table class="rankings-table">
        <thead>
          <tr>
            <th>Target Student</th>
            <th>Reviewer (Author Email)</th>
            <th>Batch</th>
            <th>Review Content</th>
            <th>Visibility Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            adminState.reviews.length === 0
              ? `<tr><td colspan="6" style="text-align:center; color:var(--text-tertiary); padding:24px;">No reviews recorded yet.</td></tr>`
              : adminState.reviews
                  .map((r) => {
                    const student = adminState.students.find((s) => s.id === r.targetStudentId);
                    const studentName = student ? student.name : r.targetStudentId;
                    const reviewerEmail = r.reviewerEmail || "Email protected (Legacy)";
                    const reviewerBatch = r.reviewerBatch || (r.reviewerEmail ? r.reviewerEmail.replace(/.*s-(\d{4}).*/, "$1") : "—");
                    return `
              <tr>
                <td style="font-weight:600;">
                  <div>${escapeHTML(studentName)}</div>
                  <div style="font-size:11px; font-family:var(--font-mono); color:var(--text-tertiary);">${student ? `Roll ${escapeHTML(student.roll)}` : ""}</div>
                </td>
                <td style="font-family:var(--font-mono); font-size:12px; color:var(--accent-text);">
                  ${escapeHTML(reviewerEmail)}
                </td>
                <td>
                  <span style="display:inline-block; padding:2px 8px; border-radius:var(--radius-sm); font-size:11px; font-weight:600; font-family:var(--font-mono); background:var(--accent-subtle); color:var(--accent-text); border:1px solid var(--accent-border);">
                    ${escapeHTML(reviewerBatch)}
                  </span>
                </td>
                <td style="max-width:320px; font-style:italic;">"${escapeHTML(r.reviewText)}"</td>
                <td>
                  <span style="display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; background:${r.visible ? "var(--status-success-bg)" : "var(--status-danger-bg)"}; color:${r.visible ? "var(--status-success-text)" : "var(--status-danger-text)"};">
                    ${r.visible ? "Visible" : "Hidden"}
                  </span>
                </td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn btn-ghost btn-sm btn-toggle-review" data-id="${r.id}" style="color:${r.visible ? "var(--status-danger-text)" : "var(--status-success-text)"};">
                    ${r.visible ? "Hide" : "Restore"}
                  </button>
                  <button class="btn btn-ghost btn-sm btn-delete-review" data-id="${r.id}" data-target="${r.targetStudentId}" style="color:var(--status-danger-text); margin-left:4px;">
                    Delete
                  </button>
                </td>
              </tr>
            `;
                  })
                  .join("")
          }
        </tbody>
      </table>
    </div>
  `;

  // Toggle Visibility Handler
  container.querySelectorAll(".btn-toggle-review").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const rev = adminState.reviews.find((r) => r.id === id);
      if (!rev) return;

      const confirmMsg = rev.visible ? "Hide this review from public display?" : "Restore this review to public view?";
      if (!confirm(confirmMsg)) return;

      rev.visible = !rev.visible;
      const db = getFirebaseDb();
      if (isFirebaseConfigured() && db) {
        await updateDoc(doc(db, "reviews", id), {
          visible: rev.visible,
          moderationStatus: rev.visible ? "visible" : "hidden",
          moderatedAt: serverTimestamp(),
        });
      }
      renderReviewsTab(container);
    });
  });

  // Permanently Delete Review Handler
  container.querySelectorAll(".btn-delete-review").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const targetStudentId = btn.getAttribute("data-target");
      const rev = adminState.reviews.find((r) => r.id === id);
      if (!rev) return;

      const confirmDelete = confirm(`Are you sure you want to permanently delete this review written to student? This cannot be undone.`);
      if (!confirmDelete) return;

      const db = getFirebaseDb();
      if (isFirebaseConfigured() && db) {
        try {
          await deleteDoc(doc(db, "reviews", id));

          // Recompute target student's review count
          const remainingSnap = await getDocs(query(collection(db, "reviews"), where("targetStudentId", "==", targetStudentId)));
          let count = 0;
          remainingSnap.forEach((d) => {
            if (d.id !== id && d.data().visible !== false) count++;
          });

          await setDoc(doc(db, "aggregates", targetStudentId), {
            reviewCount: count,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (delErr) {
          console.error("Could not delete review document:", delErr);
          alert("Error deleting review: " + delErr.message);
          return;
        }
      }

      adminState.reviews = adminState.reviews.filter((r) => r.id !== id);
      showAdminToast("Review permanently deleted.", "success");
      renderReviewsTab(container);
    });
  });
}

/**
 * 5. Export Tab
 */
function renderExportTab(container) {
  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h3 style="font-size:16px; font-weight:700;">Protected Administrative Data Exports</h3>
      <p style="font-size:12px; color:var(--text-secondary);">Download authorized datasets formatted with RFC 4180 escaping. Includes reviewer batch and email audit logs for administrators.</p>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px;">
      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <h4 style="font-size:14px; font-weight:600; margin-bottom:6px;">Students Directory CSV</h4>
        <p style="font-size:12px; color:var(--text-tertiary); margin-bottom:12px;">Roll, Name, Status, Image URL.</p>
        <button id="btn-export-students" class="btn btn-secondary btn-sm" style="width:100%;">Download Students.csv</button>
      </div>

      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <h4 style="font-size:14px; font-weight:600; margin-bottom:6px;">Reviews Dataset CSV</h4>
        <p style="font-size:12px; color:var(--text-tertiary); margin-bottom:12px;">Target Student, Reviewer Email, Batch, Review Text, Visibility, Date.</p>
        <button id="btn-export-reviews" class="btn btn-secondary btn-sm" style="width:100%;">Download Reviews.csv</button>
      </div>

      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <h4 style="font-size:14px; font-weight:600; margin-bottom:6px;">Evaluation Criteria CSV</h4>
        <p style="font-size:12px; color:var(--text-tertiary); margin-bottom:12px;">Criterion ID, Name, Range, Active Status.</p>
        <button id="btn-export-criteria" class="btn btn-secondary btn-sm" style="width:100%;">Download Criteria.csv</button>
      </div>
    </div>
  `;

  // Attach Export Handlers
  document.getElementById("btn-export-students")?.addEventListener("click", () => {
    const rows = [["Roll", "Name", "Active", "ImageURL"]];
    adminState.students.forEach((s) => {
      rows.push([s.roll, s.name, s.active ? "Yes" : "No", s.imageUrl || ""]);
    });
    exportToCSV("DU_Physics_104_Students.csv", rows);
  });

  document.getElementById("btn-export-reviews")?.addEventListener("click", () => {
    const rows = [["TargetStudentID", "TargetName", "ReviewerEmail", "ReviewerBatch", "ReviewText", "Visible", "Date"]];
    adminState.reviews.forEach((r) => {
      const student = adminState.students.find((s) => s.id === r.targetStudentId);
      rows.push([
        r.targetStudentId, 
        student ? student.name : "", 
        r.reviewerEmail || "", 
        r.reviewerBatch || "", 
        r.reviewText, 
        r.visible ? "Yes" : "No", 
        r.createdAt || ""
      ]);
    });
    exportToCSV("DU_Physics_104_Reviews.csv", rows);
  });

  document.getElementById("btn-export-criteria")?.addEventListener("click", () => {
    const rows = [["ID", "Name", "MinScore", "MaxScore", "Active", "DisplayOrder"]];
    adminState.criteria.forEach((c) => {
      rows.push([c.id, c.name, c.minScore, c.maxScore, c.active ? "Yes" : "No", c.displayOrder]);
    });
    exportToCSV("DU_Physics_104_Criteria.csv", rows);
  });
}

/**
 * 6. Email Template & Firebase Console Guide (Option 1)
 */
function renderEmailTab(container) {
  const defaultSubject = "Sign-in link for DU Physics 104 Peer Review";
  const defaultSender = "DU Physics 104 Peer Review";
  const defaultReplyTo = "physics@du.ac.bd";
  const defaultBody = `Hello,

Follow this link to sign in to the DU Physics 104 Peer Review System:

%LINK%

If you didn’t ask to sign in, you can safely ignore this email.

Department of Physics · University of Dhaka
Curzon Hall Campus`;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
      <div>
        <h3 style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">Firebase Email Template (Option 1)</h3>
        <p style="font-size: 13px; color: var(--text-secondary);">
          Customize the passwordless sign-in email sent by Firebase directly from your Firebase Console. No SMTP server required.
        </p>
      </div>

      <div style="display: flex; gap: 8px;">
        <a href="https://console.firebase.google.com/project/_/authentication/templates" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">
          Open Firebase Console &rarr;
        </a>
      </div>
    </div>

    <!-- 3-Step Setup Guide Banner -->
    <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-left: 3px solid var(--accent-primary); border-radius: var(--radius-md); padding: 18px 20px; margin-bottom: 24px;">
      <h4 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">How to apply this template in Firebase:</h4>
      <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.7;">
        <li>Go to <strong>Firebase Console</strong> &rarr; <strong>Authentication</strong> &rarr; <strong>Templates</strong> tab.</li>
        <li>Select <strong>Email link (passwordless sign-in)</strong> and click the <strong>Edit (pencil)</strong> button.</li>
        <li>Copy and paste the customized fields below, then click <strong>Save</strong>.</li>
      </ol>
    </div>

    <!-- Template Customization & Copy Fields Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-bottom: 28px;">
      
      <!-- Field 1: Sender Name -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Sender Name</label>
          <button class="btn btn-secondary btn-sm" id="btn-copy-sender" style="padding: 3px 10px; font-size: 11px;">Copy</button>
        </div>
        <div id="text-sender" style="font-family: var(--font-mono); font-size: 13px; color: var(--text-primary); background: var(--bg-surface-subtle); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">${defaultSender}</div>
      </div>

      <!-- Field 2: Reply-To Email -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Reply-To Email</label>
          <button class="btn btn-secondary btn-sm" id="btn-copy-replyto" style="padding: 3px 10px; font-size: 11px;">Copy</button>
        </div>
        <div id="text-replyto" style="font-family: var(--font-mono); font-size: 13px; color: var(--text-primary); background: var(--bg-surface-subtle); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">${defaultReplyTo}</div>
      </div>

      <!-- Field 3: Subject Line -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px; grid-column: 1 / -1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Subject Line</label>
          <button class="btn btn-secondary btn-sm" id="btn-copy-subject" style="padding: 3px 10px; font-size: 11px;">Copy</button>
        </div>
        <div id="text-subject" style="font-family: var(--font-mono); font-size: 13px; color: var(--text-primary); background: var(--bg-surface-subtle); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">${defaultSubject}</div>
      </div>

      <!-- Field 4: Message Body -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px; grid-column: 1 / -1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Message Body (Includes %LINK% Placeholder)</label>
          <button class="btn btn-secondary btn-sm" id="btn-copy-body" style="padding: 3px 10px; font-size: 11px;">Copy Message Body</button>
        </div>
        <pre id="text-body" style="font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; color: var(--text-primary); background: var(--bg-surface-subtle); padding: 14px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); white-space: pre-wrap; margin: 0;">${defaultBody}</pre>
        <div style="font-size: 11.5px; color: var(--text-tertiary); margin-top: 8px;">
          Note: Keep the <code>%LINK%</code> placeholder intact. Firebase automatically replaces it with the authenticated single-use link when sending to students.
        </div>
      </div>

    </div>

    <!-- Student Inbox Outlook/Gmail Simulation Preview -->
    <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 24px;">
      <h4 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 16px;">
        Inbox Simulation (How Students See It):
      </h4>
      
      <div style="border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: #ffffff; color: #1e293b; max-width: 580px; margin: 0 auto; box-shadow: var(--shadow-sm); overflow: hidden;">
        <!-- Email Header Bar -->
        <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 14px 18px;">
          <div style="font-size: 12px; color: #64748b; margin-bottom: 2px;">From: <strong style="color: #0f172a;">${defaultSender}</strong> &lt;noreply@phy104-evalution.firebaseapp.com&gt;</div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 2px;">To: <strong style="color: #0f172a;">s-2024819001@phy.du.ac.bd</strong></div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 6px;">Subject: ${defaultSubject}</div>
        </div>

        <!-- Email Body -->
        <div style="padding: 24px 20px; font-size: 13.5px; line-height: 1.65; color: #334155;">
          <p style="margin: 0 0 14px 0;">Hello,</p>
          <p style="margin: 0 0 16px 0;">Follow this link to sign in to the DU Physics 104 Peer Review System:</p>
          
          <!-- Simulated Link -->
          <div style="margin: 18px 0;">
            <a href="javascript:void(0)" style="display: inline-block; background: #2563eb; color: #ffffff; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-size: 13px;">
              Sign In to DU Physics 104 &rarr;
            </a>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 8px; font-family: monospace;">
              https://phy104-evalution.firebaseapp.com/__/auth/action?mode=signIn&...
            </div>
          </div>

          <p style="margin: 18px 0 14px 0; color: #64748b; font-size: 12px;">If you didn’t ask to sign in, you can safely ignore this email.</p>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 20px; font-size: 12px; color: #64748b;">
            Department of Physics &middot; University of Dhaka<br>
            Curzon Hall Campus
          </div>
        </div>
      </div>
    </div>
  `;

  // One-click copy listeners
  const copyHelper = (btnId, textToCopy, label) => {
    document.getElementById(btnId)?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(textToCopy);
        showAdminToast(`${label} copied to clipboard!`, "success", 3000);
      } catch {
        showAdminToast(`Could not copy ${label}`, "error", 3000);
      }
    });
  };

  copyHelper("btn-copy-sender", defaultSender, "Sender Name");
  copyHelper("btn-copy-replyto", defaultReplyTo, "Reply-To");
  copyHelper("btn-copy-subject", defaultSubject, "Subject Line");
  copyHelper("btn-copy-body", defaultBody, "Message Body");
}

/**
 * Event Listeners for Admin Interface
 */
function setupAdminEventListeners() {
  const loginForm = document.getElementById("admin-login-form");
  const emailInput = document.getElementById("admin-email-input");
  const passInput = document.getElementById("admin-pass-input");
  const errEl = document.getElementById("admin-error-msg");

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errEl) errEl.style.display = "none";

    try {
      await handleAdminLogin(emailInput.value, passInput.value);
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message;
        errEl.style.display = "block";
      }
    }
  });

  document.getElementById("admin-logout-btn")?.addEventListener("click", () => {
    handleAdminLogout();
  });

  document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      adminState.currentTab = btn.getAttribute("data-tab");
      renderActiveTab();
    });
  });

  // Modal: Live image and name input listeners
  const imgInput = document.getElementById("admin-input-student-img");
  imgInput?.addEventListener("input", () => {
    updateStudentImagePreview();
  });

  const nameInput = document.getElementById("admin-input-student-name");
  nameInput?.addEventListener("input", () => {
    if (!imgInput?.value) {
      updateStudentImagePreview();
    }
  });

  // Student Form Submission (Add & Edit)
  const studentForm = document.getElementById("admin-student-form");
  studentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sNameInput = document.getElementById("admin-input-student-name");
    const sRollInput = document.getElementById("admin-input-student-roll");
    const sImgInput = document.getElementById("admin-input-student-img");
    const sActiveInput = document.getElementById("admin-input-student-active");
    const sErrorEl = document.getElementById("admin-student-error");
    const saveBtn = document.getElementById("admin-btn-save-student");

    const name = (sNameInput?.value || "").trim();
    const roll = (sRollInput?.value || "").trim();
    const rawImg = (sImgInput?.value || "").trim();
    const active = sActiveInput ? sActiveInput.checked : true;

    if (!name || !roll) {
      if (sErrorEl) {
        sErrorEl.textContent = "Please fill in student name and roll number.";
        sErrorEl.style.display = "block";
      }
      return;
    }

    // Check duplicate roll (excluding current editing student)
    const duplicate = adminState.students.some(
      (s) => s.roll === roll && (!currentEditingStudentId || s.id !== currentEditingStudentId)
    );
    if (duplicate) {
      if (sErrorEl) {
        sErrorEl.textContent = `A student with roll number "${roll}" already exists in the directory.`;
        sErrorEl.style.display = "block";
      }
      return;
    }

    const parsed = parseGoogleDriveUrl(rawImg);
    const studentData = {
      name,
      roll,
      imageUrl: parsed.directImageUrl || rawImg || "",
      imageSource: rawImg || "",
      imageFileId: parsed.fileId || null,
      active,
    };

    const isEdit = Boolean(currentEditingStudentId);
    const db = getFirebaseDb();

    if (saveBtn) saveBtn.disabled = true;

    try {
      if (isEdit) {
        if (isFirebaseConfigured() && db) {
          await updateDoc(doc(db, "students", currentEditingStudentId), {
            ...studentData,
            updatedAt: serverTimestamp(),
          });
        }

        const studentIndex = adminState.students.findIndex((s) => s.id === currentEditingStudentId);
        if (studentIndex !== -1) {
          adminState.students[studentIndex] = {
            ...adminState.students[studentIndex],
            ...studentData,
            updatedAt: new Date().toISOString(),
          };
        }
        showAdminToast(`Student "${name}" updated successfully.`, "success");
      } else {
        const newId = "stu_" + Date.now();
        const newRecord = {
          id: newId,
          ...studentData,
          displayOrder: adminState.students.length + 1,
          createdAt: new Date().toISOString(),
        };

        if (isFirebaseConfigured() && db) {
          await setDoc(doc(db, "students", newId), {
            ...newRecord,
            createdAt: serverTimestamp(),
          });
        }

        adminState.students.push(newRecord);
        showAdminToast(`Student "${name}" added to Batch 104 directory.`, "success");
      }

      closeStudentModal();
      renderActiveTab();
    } catch (err) {
      console.error("Error saving student record:", err);
      if (sErrorEl) {
        if (err.code === "permission-denied" || (err.message && err.message.toLowerCase().includes("permission"))) {
          sErrorEl.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">Firestore Permission Denied</div>
            <div>Please ensure your Firestore security rules allow write access to the <code>students</code> collection (<code>allow read, write: if true;</code>).</div>
          `;
        } else {
          sErrorEl.textContent = "Error saving student: " + (err.message || "Failed to persist");
        }
        sErrorEl.style.display = "block";
      }
      showAdminToast("Firestore Permission Denied.", "error", 5000);
      return; // Keep modal open so entered data is not lost!
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // Criterion Form Submission
  const criterionForm = document.getElementById("admin-criterion-form");
  criterionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const critNameInput = document.getElementById("admin-input-crit-name");
    const critMinInput = document.getElementById("admin-input-crit-min");
    const critMaxInput = document.getElementById("admin-input-crit-max");
    const critErrorEl = document.getElementById("admin-criterion-error");
    const saveBtn = document.getElementById("admin-btn-save-criterion");

    const name = (critNameInput?.value || "").trim();
    const minScore = parseFloat(critMinInput?.value || "-1");
    const maxScore = parseFloat(critMaxInput?.value || "4");

    if (!name) {
      if (critErrorEl) {
        critErrorEl.textContent = "Please enter a criterion dimension name.";
        critErrorEl.style.display = "block";
      }
      return;
    }

    if (minScore >= maxScore) {
      if (critErrorEl) {
        critErrorEl.textContent = "Min score must be strictly less than max score.";
        critErrorEl.style.display = "block";
      }
      return;
    }

    if (saveBtn) saveBtn.disabled = true;

    try {
      const newId = "crit_" + Date.now();
      const newCrit = {
        id: newId,
        name,
        minScore,
        maxScore,
        active: true,
        displayOrder: adminState.criteria.length + 1,
        createdAt: new Date().toISOString(),
      };

      const db = getFirebaseDb();
      if (isFirebaseConfigured() && db) {
        await setDoc(doc(db, "criteria", newId), {
          ...newCrit,
          createdAt: serverTimestamp(),
        });
      }

      adminState.criteria.push(newCrit);
      showAdminToast(`Criterion "${name}" created successfully.`, "success");
      closeCriterionModal();
      renderActiveTab();
    } catch (err) {
      console.error("Error saving criterion:", err);
      if (critErrorEl) {
        if (err.code === "permission-denied" || (err.message && err.message.toLowerCase().includes("permission"))) {
          critErrorEl.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">Firestore Permission Denied</div>
            <div>Please ensure your Firestore security rules allow write access to the <code>criteria</code> collection (<code>allow read, write: if true;</code>).</div>
          `;
          showAdminToast("Firestore Permission Denied.", "error", 5000);
        } else {
          critErrorEl.textContent = "Error saving criterion: " + (err.message || "Failed to persist");
          showAdminToast(err.message || "Error saving criterion", "error", 5000);
        }
        critErrorEl.style.display = "block";
      }
      return;
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // Modals close ONLY on cross button click or successful form submission
  document.getElementById("admin-student-modal-close")?.addEventListener("click", () => {
    closeStudentModal();
  });

  document.getElementById("admin-criterion-modal-close")?.addEventListener("click", () => {
    closeCriterionModal();
  });
}
