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
 * Load administrative datasets from Firestore
 */
export async function loadAdminData() {
  const db = getFirebaseDb();
  if (!isFirebaseConfigured() || !db) {
    return;
  }

  try {
    // 1. Load Students
    const sSnap = await getDocs(query(collection(db, "students"), orderBy("roll", "asc")));
    if (!sSnap.empty) {
      adminState.students = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    // 2. Load Criteria
    const cSnap = await getDocs(query(collection(db, "criteria"), orderBy("displayOrder", "asc")));
    if (!cSnap.empty) {
      adminState.criteria = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      adminState.criteria = [...DEFAULT_CRITERIA_SEED];
    }

    // 3. Load Reviews
    const rSnap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc")));
    if (!rSnap.empty) {
      adminState.reviews = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    console.error("Error loading administrative data from Firestore:", err);
    showAdminToast("Error fetching latest database records: " + err.message, "error");
  }
}

/**
 * Render Active Tab View
 */
export function renderActiveTab() {
  const container = document.getElementById("admin-tab-content");
  if (!container) return;

  document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === adminState.currentTab);
  });

  switch (adminState.currentTab) {
    case "overview":
      renderOverviewTab(container);
      break;
    case "students":
      renderStudentsTab(container);
      break;
    case "criteria":
      renderCriteriaTab(container);
      break;
    case "reviews":
      renderReviewsTab(container);
      break;
    case "exports":
      renderExportTab(container);
      break;
    default:
      renderOverviewTab(container);
  }
}

/**
 * 1. Overview Tab
 */
function renderOverviewTab(container) {
  const totalStudents = adminState.students.length;
  const activeStudents = adminState.students.filter((s) => s.active !== false).length;
  const totalReviews = adminState.reviews.length;
  const hiddenReviews = adminState.reviews.filter((r) => r.visible === false).length;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px;">
      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <div style="font-size:12px; color:var(--text-tertiary); margin-bottom:4px;">Total Directory Students</div>
        <div class="num" style="font-size:24px; font-weight:700; color:var(--text-primary);">${totalStudents}</div>
        <div style="font-size:11.5px; color:var(--status-success-text); margin-top:4px;">${activeStudents} active for review</div>
      </div>

      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <div style="font-size:12px; color:var(--text-tertiary); margin-bottom:4px;">Criteria Dimensions</div>
        <div class="num" style="font-size:24px; font-weight:700; color:var(--text-primary);">${adminState.criteria.length}</div>
        <div style="font-size:11.5px; color:var(--text-secondary); margin-top:4px;">Scoring scale: -1 to 4</div>
      </div>

      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <div style="font-size:12px; color:var(--text-tertiary); margin-bottom:4px;">Anonymous Reviews</div>
        <div class="num" style="font-size:24px; font-weight:700; color:var(--text-primary);">${totalReviews}</div>
        <div style="font-size:11.5px; color:${hiddenReviews > 0 ? "var(--status-danger-text)" : "var(--status-success-text)"}; margin-top:4px;">
          ${hiddenReviews} flagged / hidden
        </div>
      </div>

      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <div style="font-size:12px; color:var(--text-tertiary); margin-bottom:4px;">Database Connection</div>
        <div style="font-size:16px; font-weight:700; color:var(--status-success-text); margin-top:4px; display:flex; align-items:center; gap:6px;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--status-success-text);"></span>
          ${isFirebaseConfigured() ? "Firestore Live" : "Local Demo"}
        </div>
        <div style="font-size:11.5px; color:var(--text-secondary); margin-top:6px;">Collection: <code>admins</code></div>
      </div>
    </div>

    <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:20px;">
      <h3 style="font-size:15px; font-weight:700; margin-bottom:8px;">Quick Administration Actions</h3>
      <p style="font-size:12.5px; color:var(--text-secondary); margin-bottom:16px;">
        Manage cohort rosters, create new evaluation dimensions, moderate feedback comments, or export peer ranking tables.
      </p>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-tab=students]').click()">Manage Students</button>
        <button class="btn btn-secondary btn-sm" onclick="document.querySelector('[data-tab=criteria]').click()">Manage Criteria</button>
        <button class="btn btn-secondary btn-sm" onclick="document.querySelector('[data-tab=reviews]').click()">Moderate Reviews</button>
        <button class="btn btn-secondary btn-sm" onclick="document.querySelector('[data-tab=exports]').click()">Export CSV Reports</button>
      </div>
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
        await updateDoc(doc(db, "students", id), { active: newStatus, updatedAt: serverTimestamp() });
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

      const newStatus = !crit.active;
      crit.active = newStatus;

      const db = getFirebaseDb();
      if (isFirebaseConfigured() && db) {
        await updateDoc(doc(db, "criteria", id), { active: newStatus, updatedAt: serverTimestamp() });
      }

      renderCriteriaTab(container);
    });
  });
}

/**
 * 4. Review Moderation Tab
 */
function renderReviewsTab(container) {
  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="font-size:16px; font-weight:700;">Anonymous Review Moderation</h3>
      <p style="font-size:12px; color:var(--text-secondary);">Manage qualitative peer feedback. Hidden comments will not display on public student profiles.</p>
    </div>

    <div class="rankings-table-wrapper">
      <table class="rankings-table">
        <thead>
          <tr>
            <th>Target Student</th>
            <th>Comment</th>
            <th>Date</th>
            <th>Visibility</th>
            <th style="text-align:right;">Moderation</th>
          </tr>
        </thead>
        <tbody>
          ${
            adminState.reviews.length === 0
              ? `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-tertiary);">No peer review comments recorded yet.</td></tr>`
              : adminState.reviews
                  .map((r) => {
                    const student = adminState.students.find((s) => s.id === r.targetStudentId);
                    const studentName = student ? student.name : "Unknown (" + r.targetStudentId + ")";
                    return `
              <tr>
                <td style="font-weight:600;">${escapeHTML(studentName)}</td>
                <td style="max-width:320px; font-size:12.5px; line-height:1.4;">${escapeHTML(r.reviewText || "")}</td>
                <td class="num" style="font-size:11.5px; color:var(--text-secondary);">${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "Recent"}</td>
                <td>
                  <span style="display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; background:${r.visible !== false ? "var(--status-success-bg)" : "var(--status-danger-bg)"}; color:${r.visible !== false ? "var(--status-success-text)" : "var(--status-danger-text)"};">
                    ${r.visible !== false ? "Visible" : "Hidden"}
                  </span>
                </td>
                <td style="text-align:right;">
                  <button class="btn btn-ghost btn-sm btn-toggle-review" data-id="${r.id}" style="color:${r.visible !== false ? "var(--status-danger-text)" : "var(--status-success-text)"}">
                    ${r.visible !== false ? "Hide Comment" : "Restore"}
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

  container.querySelectorAll(".btn-toggle-review").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const rev = adminState.reviews.find((r) => r.id === id);
      if (!rev) return;

      const newVisible = rev.visible === false ? true : false;
      rev.visible = newVisible;

      const db = getFirebaseDb();
      if (isFirebaseConfigured() && db) {
        await updateDoc(doc(db, "reviews", id), { visible: newVisible, updatedAt: serverTimestamp() });
      }

      showAdminToast(`Review visibility updated to ${newVisible ? "Visible" : "Hidden"}.`, "info");
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
      <p style="font-size:12px; color:var(--text-secondary);">Download authorized datasets formatted with RFC 4180 escaping. Note: Reviewer identity remains protected in compliance with privacy guidelines.</p>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px;">
      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <h4 style="font-size:14px; font-weight:600; margin-bottom:6px;">Students Directory CSV</h4>
        <p style="font-size:12px; color:var(--text-tertiary); margin-bottom:12px;">Roll, Name, Status, Image URL.</p>
        <button id="btn-export-students" class="btn btn-secondary btn-sm" style="width:100%;">Download Students.csv</button>
      </div>

      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
        <h4 style="font-size:14px; font-weight:600; margin-bottom:6px;">Reviews Dataset CSV</h4>
        <p style="font-size:12px; color:var(--text-tertiary); margin-bottom:12px;">Target Student, Review Text, Visibility, Date.</p>
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
    const rows = [["TargetStudentID", "TargetName", "ReviewText", "Visible", "Date"]];
    adminState.reviews.forEach((r) => {
      const student = adminState.students.find((s) => s.id === r.targetStudentId);
      rows.push([r.targetStudentId, student ? student.name : "", r.reviewText, r.visible ? "Yes" : "No", r.createdAt || ""]);
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
        } else {
          critErrorEl.textContent = "Error saving criterion: " + (err.message || "Failed to persist");
        }
        critErrorEl.style.display = "block";
      }
      showAdminToast("Firestore Permission Denied.", "error", 5000);
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
