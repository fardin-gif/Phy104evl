/**
 * DU Physics 104 - UI View Renderer & Component Handlers
 */
import { getState, setState } from "./state.js";
import { getFilteredStudents, getInitials } from "./students.js";
import { formatScore } from "./utils.js";
import { escapeHTML } from "./validation.js";
import { strings } from "../translations/en.js";
import { loadStudentReviews } from "./reviews.js";
import { hasUserRatedStudent, submitRating } from "./ratings.js";
import { calculateRankings } from "./rankings.js";
import { fetchUserDeviceSessions, revokeDeviceSession } from "./deviceSessions.js";
import { logoutUser } from "./auth.js";
import { getFirebaseDb } from "./firebase.js";
import { doc, getDoc } from "firebase/firestore";
import { isFirebaseConfigured, APP_CONFIG } from "./config.js";

/**
 * Toast Notification System
 */
export function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <span>${escapeHTML(message)}</span>
    <button class="btn-ghost" style="padding:2px 6px; font-size:16px;" aria-label="Close">&times;</button>
  `;

  const closeBtn = toast.querySelector("button");
  closeBtn.addEventListener("click", () => {
    toast.remove();
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 200);
    }
  }, duration);
}

/**
 * Modal Management
 */
export function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
  }
}

/**
 * Render Header & Navigation
 */
export function renderHeader() {
  const { user, theme } = getState();
  const authBtnContainer = document.getElementById("header-auth-section");
  if (!authBtnContainer) return;

  if (user && user.isAuthenticated) {
    authBtnContainer.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <button id="btn-open-account" class="btn btn-secondary btn-sm" title="Account Details">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span class="num">${user.roll || "Account"}</span>
        </button>
        <button id="btn-theme-toggle" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
        </button>
        <button id="btn-logout" class="btn btn-ghost btn-sm" title="Sign Out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
    `;

    document.getElementById("btn-open-account")?.addEventListener("click", () => {
      openAccountModal();
    });

    document.getElementById("btn-logout")?.addEventListener("click", async () => {
      await logoutUser();
      showToast("Signed out safely.", "info");
    });
  } else {
    authBtnContainer.innerHTML = `
      <button id="btn-theme-toggle" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/></svg>
      </button>
    `;
  }

  // Bind theme toggle
  document.getElementById("btn-theme-toggle")?.addEventListener("click", () => {
    const current = getState().theme;
    const next = current === "dark" ? "light" : "dark";
    setState({ theme: next });
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("du_phy_104_theme", next);
  });
}

/**
 * Render Metric / Stats Strip (Scientific Measurement Panels)
 */
export function renderStats() {
  const { students, aggregates } = getState();
  const container = document.getElementById("stats-strip-container");
  if (!container) return;

  const totalStudents = students.filter((s) => s.active).length;
  let totalRatings = 0;
  let totalReviews = 0;

  for (const agg of Object.values(aggregates)) {
    totalRatings += agg.ratingCount || 0;
    totalReviews += agg.reviewCount || 0;
  }

  const participationRate =
    totalStudents > 0 ? Math.min(100, Math.round((totalRatings / totalStudents) * 100)) : 0;

  container.innerHTML = `
    <div class="stat-box">
      <div class="stat-box-index">01 / STUDENTS</div>
      <div class="stat-number">${totalStudents}</div>
      <div class="stat-label">${strings.stats.students}</div>
      <div class="stat-subtext">Active Batch Directory</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-index">02 / EVALUATIONS</div>
      <div class="stat-number">${totalRatings}</div>
      <div class="stat-label">${strings.stats.ratings}</div>
      <div class="stat-subtext">Anonymous Peer Ratings</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-index">03 / REVIEWS</div>
      <div class="stat-number">${totalReviews}</div>
      <div class="stat-label">${strings.stats.reviews}</div>
      <div class="stat-subtext">Visible Written Notes</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-index">04 / CONSENSUS</div>
      <div class="stat-number">${participationRate}%</div>
      <div class="stat-label">${strings.stats.participation}</div>
      <div class="stat-subtext">Batch Consensus Metric</div>
    </div>
  `;
}

/**
 * Render Student Cards Grid (Designed Identity Index)
 */
export function renderStudentGrid() {
  const container = document.getElementById("student-grid-container");
  if (!container) return;

  const filtered = getFilteredStudents();
  const { aggregates, userSubmittedRatingIds } = getState();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <div class="empty-state-title">${strings.directory.noResults}</div>
        <p class="empty-state-desc">No students match your query. Try a different search term or filter.</p>
      </div>
    `;
    return;
  }

  const threshold = APP_CONFIG.MIN_RATINGS_THRESHOLD ?? 3;

  container.innerHTML = filtered
    .map((student, idx) => {
      const agg = aggregates[student.id];
      const count = agg ? agg.ratingCount || 0 : 0;
      const isThresholdMet = count >= threshold;
      const overall = isThresholdMet && agg ? agg.overallAverage : null;
      const scoreFormatted = formatScore(overall);
      const isRated = userSubmittedRatingIds.has(student.id);
      const indexStr = String(idx + 1).padStart(2, "0");

      return `
      <div class="student-card" data-student-id="${student.id}" tabindex="0" role="button" aria-label="View profile of ${escapeHTML(student.name)}">
        <div class="card-top-row">
          <span class="card-index">${indexStr}</span>
          <div class="student-avatar" id="avatar-${student.id}">
            ${
              student.imageUrl
                ? `<img src="${escapeHTML(student.imageUrl)}" alt="${escapeHTML(student.name)}" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='${getInitials(student.name)}'"/>`
                : getInitials(student.name)
            }
          </div>
          <div class="card-title-group">
            <h3 class="student-name">${escapeHTML(student.name)}</h3>
            <div class="student-roll">Roll ${escapeHTML(student.roll)}</div>
          </div>
        </div>

        <div class="card-metric-divider"></div>

        <div class="card-score-row">
          <div class="score-display">
            ${
              isThresholdMet
                ? `<span class="score-val">${scoreFormatted.display}</span><span class="score-denom">/ 4</span>`
                : `<span class="score-val score-val-hidden">—</span>`
            }
          </div>
          <div class="rating-count">${count} ${count === 1 ? "rating" : "ratings"}</div>
        </div>
        ${
          !isThresholdMet
            ? `<div class="card-threshold-note">${count === 0 ? "No ratings yet" : `${count}/3 ratings — results hidden until 3 submissions`}</div>`
            : ""
        }

        <div class="card-footer-action">
          ${isRated ? `<span class="rated-status-tag">✓ Rated</span>` : `<span></span>`}
          <span class="inspect-link-text">
            <span>Inspect</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        </div>
      </div>
    `;
    })
    .join("");

  // Attach card click listeners
  container.querySelectorAll(".student-card").forEach((card) => {
    card.addEventListener("click", () => {
      const studentId = card.getAttribute("data-student-id");
      const student = filtered.find((s) => s.id === studentId);
      if (student) {
        openStudentProfile(student);
      }
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
  });
}

/**
 * Open and Render Student Profile Modal
 */
export async function openStudentProfile(student) {
  setState({ activeStudentProfile: student });
  let { aggregates, criteria, user, userSubmittedRatingIds } = getState();
  let agg = aggregates[student.id];

  // If aggregate is missing from local state, fetch from Firestore
  if (!agg) {
    const db = getFirebaseDb();
    if (isFirebaseConfigured() && db) {
      try {
        const aggSnap = await getDoc(doc(db, "aggregates", student.id));
        if (aggSnap.exists()) {
          agg = aggSnap.data();
          aggregates = { ...aggregates, [student.id]: agg };
          setState({ aggregates });
        }
      } catch (e) {
        console.warn("Could not fetch aggregate for student profile:", e);
      }
    }
  }

  // Check if current user has already rated this student
  let isAlreadyRated = userSubmittedRatingIds.has(student.id);
  if (!isAlreadyRated && user && user.uid) {
    isAlreadyRated = await hasUserRatedStudent(user.uid, student.id);
  }

  const threshold = APP_CONFIG.MIN_RATINGS_THRESHOLD ?? 3;
  const count = agg ? agg.ratingCount || 0 : 0;
  const isThresholdMet = count >= threshold;
  const overall = isThresholdMet && agg ? agg.overallAverage : null;
  const scoreFormatted = formatScore(overall);
  const criterionAverages = agg ? agg.criterionAverages || {} : {};

  const modal = document.getElementById("profile-modal");
  const modalContent = document.getElementById("profile-modal-content");
  if (!modal || !modalContent) return;

  // Criteria breakdown HTML with calibrated measurement gauges (only when threshold is met)
  const criteriaHtml = isThresholdMet
    ? criteria
        .filter((c) => c.active)
        .map((c) => {
          const avg = criterionAverages[c.id];
          const avgVal = avg !== undefined && avg !== null ? avg : null;
          const pct = avgVal !== null ? Math.max(0, Math.min(100, ((avgVal - (c.minScore ?? -1)) / ((c.maxScore ?? 4) - (c.minScore ?? -1))) * 100)) : 0;
          return `
          <div class="criterion-row">
            <div class="criterion-header">
              <span class="criterion-name">${escapeHTML(c.name)}</span>
              <span class="criterion-score-val">${avgVal !== null ? avgVal.toFixed(2) : "—"} / ${c.maxScore ?? 4}</span>
            </div>
            <div class="criterion-bar-bg">
              <div class="criterion-bar-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
        })
        .join("")
    : `
      <div style="padding: 16px; background: var(--bg-surface-subtle); border: 1px dashed var(--border-default); border-radius: var(--radius-sm); text-align: center; color: var(--text-tertiary); font-size: 12.5px; line-height: 1.5;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 6px; display: block; opacity: 0.6;"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <strong style="color: var(--text-secondary); display: block; margin-bottom: 2px;">Evaluation Dimensions Hidden</strong>
        Currently received <strong>${count} of 3</strong> required ratings. Dimension score averages unlock automatically once 3 classmates have submitted their evaluations.
      </div>
    `;

  // Rating action button section
  let ratingActionHtml = "";
  if (user && user.canSubmitRating) {
    if (isAlreadyRated) {
      ratingActionHtml = `
        <div style="padding: 10px 14px; background: var(--status-success-bg); border: 1px solid var(--status-success-border); color: var(--status-success-text); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
          ${strings.profile.alreadyRatedBadge}
        </div>
      `;
    } else {
      ratingActionHtml = `
        <button id="btn-open-rate-student" class="btn btn-primary btn-lg" style="width: 100%;">
          ${strings.profile.rateStudentBtn}
        </button>
      `;
    }
  } else if (user && user.isDepartment) {
    ratingActionHtml = `
      <div style="padding: 8px 12px; background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-tertiary); text-align: center;">
        ${strings.profile.viewOnlyNotice}
      </div>
    `;
  }

  modalContent.innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar-lg">
        ${
          student.imageUrl
            ? `<img src="${escapeHTML(student.imageUrl)}" alt="${escapeHTML(student.name)}" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='${getInitials(student.name)}'"/>`
            : getInitials(student.name)
        }
      </div>
      <div class="profile-info">
        <h2 class="profile-name">${escapeHTML(student.name)}</h2>
        <div class="profile-roll">DU Roll: ${escapeHTML(student.roll)}</div>
        <div class="profile-metric-badge">
          ${
            isThresholdMet
              ? `<span style="font-size:15px; font-weight:700; font-family:var(--font-mono);">${scoreFormatted.display}</span>
                 <span style="font-size:11.5px; color:var(--text-tertiary); font-family:var(--font-mono);">/ 4.00</span>`
              : `<span style="font-size:13px; font-weight:600; color:var(--text-tertiary); font-family:var(--font-mono);">Score Hidden</span>`
          }
          <span style="font-size:11.5px; color:var(--text-tertiary); margin-left: 4px;">(${count} ${count === 1 ? "rating" : "ratings"}${!isThresholdMet ? " · min 3 required" : ""})</span>
        </div>
      </div>
    </div>

    <div style="margin-bottom: var(--space-6);">
      <h3 style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-tertiary); margin-bottom:var(--space-3);">
        ${strings.profile.criteriaHeading}
      </h3>
      <div class="criteria-list">
        ${criteriaHtml}
      </div>
    </div>

    <div style="margin-bottom: var(--space-6);">
      ${ratingActionHtml}
    </div>

    <div class="reviews-section">
      <div class="reviews-section-title">
        <span>${strings.profile.reviewsHeading}</span>
        <span id="review-count-badge" style="font-size:11px; font-family:var(--font-mono); font-weight:normal; color:var(--text-tertiary);">Loading...</span>
      </div>
      <div id="student-reviews-container">
        <div style="padding: var(--space-4); text-align: center; color: var(--text-tertiary); font-size: 13px;">Loading anonymous reviews...</div>
      </div>
    </div>
  `;

  openModal("profile-modal");

  // Attach rating open button
  document.getElementById("btn-open-rate-student")?.addEventListener("click", () => {
    closeModal("profile-modal");
    openRatingModal(student);
  });

  // Load reviews asynchronously
  const reviews = await loadStudentReviews(student.id);
  const reviewsContainer = document.getElementById("student-reviews-container");
  const countBadge = document.getElementById("review-count-badge");
  if (reviewsContainer) {
    if (!isThresholdMet) {
      if (countBadge) countBadge.textContent = "Locked";
      reviewsContainer.innerHTML = `
        <div style="padding: var(--space-4); text-align: center; color: var(--text-tertiary); font-size: 12.5px; line-height: 1.5;">
          ${strings.profile.thresholdNotice}
        </div>
      `;
    } else {
      if (countBadge) countBadge.textContent = `${reviews.length} written`;
      if (reviews.length === 0) {
        reviewsContainer.innerHTML = `
          <div style="padding: var(--space-4); text-align: center; color: var(--text-tertiary); font-size: 12.5px;">
            ${strings.profile.noReviewsYet}
          </div>
        `;
      } else {
        reviewsContainer.innerHTML = reviews
          .map(
            (r) => `
          <div class="review-item">
            "${escapeHTML(r.reviewText)}"
          </div>
        `
          )
          .join("");
      }
    }
  }
}

/**
 * Open and Setup Rating Form Modal (Star-Based Gamified & Precise Interaction)
 */
export function openRatingModal(student) {
  const { criteria } = getState();
  const activeCriteria = criteria.filter((c) => c.active);
  const modal = document.getElementById("rating-modal");
  const formContent = document.getElementById("rating-form-fields");
  if (!modal || !formContent) return;

  document.getElementById("rating-modal-target-name").textContent = student.name;
  document.getElementById("rating-modal-target-roll").textContent = `Roll ${student.roll}`;

  // Build star ratings for each active criterion
  const formHtml = activeCriteria
    .map((c) => {
      const min = c.minScore ?? -1;
      const max = c.maxScore ?? 4;
      const starButtons = [];

      for (let s = min; s <= max; s++) {
        starButtons.push(`
          <button 
            type="button" 
            class="star-rating-btn" 
            data-criterion-id="${c.id}" 
            data-score="${s}"
            title="Score: ${s > 0 ? "+" + s : s}"
            aria-label="Score ${s} for ${escapeHTML(c.name)}"
          >
            <svg viewBox="0 0 24 24" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span class="star-val">${s > 0 ? "+" + s : s}</span>
          </button>
        `);
      }

      return `
      <div class="rating-criterion-card" id="criterion-card-${c.id}">
        <div class="rating-criterion-header">
          <div class="rating-criterion-title">${escapeHTML(c.name)}</div>
          <div class="rating-criterion-status" id="criterion-status-${c.id}">Not rated</div>
        </div>
        <div class="star-rating-row" id="star-row-${c.id}">
          ${starButtons.join("")}
        </div>
      </div>
    `;
    })
    .join("");

  formContent.innerHTML = `
    <div class="rating-progress-container">
      <div class="rating-progress-meta">
        <span id="rating-progress-label">Evaluated 0 of ${activeCriteria.length} dimensions</span>
        <span id="rating-progress-percent">0%</span>
      </div>
      <div class="rating-progress-bar-bg">
        <div id="rating-progress-bar-fill" class="rating-progress-bar-fill" style="width: 0%;"></div>
      </div>
    </div>
    ${formHtml}
  `;

  // Rating form state
  const currentScores = {};
  const submitBtn = document.getElementById("btn-submit-rating");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submit Anonymous Rating";
  }

  const charCounter = document.getElementById("review-char-count");
  const reviewInput = document.getElementById("rating-review-text");
  if (reviewInput) {
    reviewInput.value = "";
    reviewInput.addEventListener("input", () => {
      const len = reviewInput.value.length;
      if (charCounter) charCounter.textContent = `${len} / 500`;
      if (len > 500) {
        charCounter.style.color = "var(--status-danger-text)";
      } else {
        charCounter.style.color = "var(--text-tertiary)";
      }
    });
  }

  // Update progress bar & submit button state
  function updateEvaluationProgress() {
    const scoredCount = Object.keys(currentScores).length;
    const total = activeCriteria.length;
    const pct = total > 0 ? Math.round((scoredCount / total) * 100) : 0;

    const labelEl = document.getElementById("rating-progress-label");
    const pctEl = document.getElementById("rating-progress-percent");
    const barEl = document.getElementById("rating-progress-bar-fill");

    if (labelEl) labelEl.textContent = `Evaluated ${scoredCount} of ${total} dimensions`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;

    const allScored = activeCriteria.every((c) => currentScores[c.id] !== undefined);
    if (submitBtn) submitBtn.disabled = !allScored;
  }

  // Handle star ratings: hover preview & selection
  activeCriteria.forEach((c) => {
    const row = document.getElementById(`star-row-${c.id}`);
    if (!row) return;

    const buttons = Array.from(row.querySelectorAll(".star-rating-btn"));

    buttons.forEach((btn, btnIdx) => {
      const scoreVal = parseInt(btn.getAttribute("data-score"), 10);

      // Mouse enter: preview stars up to hovered button
      btn.addEventListener("mouseenter", () => {
        buttons.forEach((b, idx) => {
          if (idx <= btnIdx) {
            b.classList.add("hovered");
          } else {
            b.classList.remove("hovered");
          }
        });
      });

      // Click: set selection
      btn.addEventListener("click", () => {
        currentScores[c.id] = scoreVal;

        // Update selected classes across buttons in row
        buttons.forEach((b, idx) => {
          if (idx <= btnIdx) {
            b.classList.add("selected");
          } else {
            b.classList.remove("selected");
          }
        });

        // Update status label
        const statusEl = document.getElementById(`criterion-status-${c.id}`);
        if (statusEl) {
          statusEl.classList.add("rated");
          const sign = scoreVal > 0 ? "+" : "";
          statusEl.textContent = `Selected: ${sign}${scoreVal} / 4`;
        }

        updateEvaluationProgress();
      });
    });

    // Mouse leave row: clear hover states
    row.addEventListener("mouseleave", () => {
      buttons.forEach((b) => b.classList.remove("hovered"));
    });
  });

  // Submit button handler
  submitBtn.onclick = async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = strings.ratingModal.submittingBtn;

    try {
      const reviewText = reviewInput ? reviewInput.value.trim() : "";
      await submitRating({
        targetStudentId: student.id,
        scores: currentScores,
        reviewText,
      });

      closeModal("rating-modal");
      showToast(strings.ratingModal.ratingRecorded, "success", 5000);

      // Re-render UI
      renderStats();
      renderStudentGrid();

      // Immediately reopen the student profile to display the updated rating and review
      openStudentProfile(student);
    } catch (err) {
      showToast(err.message || strings.toasts.genericError, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = strings.ratingModal.submitBtn;
    }
  };

  openModal("rating-modal");
}

/**
 * Render Rankings Measurement View (Scientific Measurement Index)
 */
export function renderRankings() {
  const container = document.getElementById("rankings-container");
  if (!container) return;

  const ranked = calculateRankings();

  if (ranked.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">${strings.rankings.emptyRankings}</div>
        <p class="empty-state-desc">Evaluations have not yet been recorded for batch rankings computation.</p>
      </div>
    `;
    return;
  }

  const threshold = APP_CONFIG.MIN_RATINGS_THRESHOLD ?? 3;

  const rows = ranked
    .map((item, index) => {
      const isThresholdMet = item.ratingCount >= threshold;
      const rankFormatted = String(index + 1).padStart(2, "0");
      const isTopRank = isThresholdMet && index < 3;
      const scoreFormatted = formatScore(isThresholdMet ? item.overallAverage : null);

      return `
      <tr data-student-id="${item.student.id}" style="cursor: pointer;">
        <td class="rank-cell ${isTopRank ? "top-rank" : ""}">
          ${isThresholdMet ? rankFormatted : `<span style="color:var(--text-tertiary); font-size:11px;">—</span>`}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="student-avatar" style="width: 32px; height: 32px; font-size: 11.5px;">
              ${
                item.student.imageUrl
                  ? `<img src="${escapeHTML(item.student.imageUrl)}" alt="${escapeHTML(item.student.name)}" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='${getInitials(item.student.name)}'"/>`
                  : getInitials(item.student.name)
              }
            </div>
            <div>
              <div style="font-weight: 600; font-size: 13.5px;">${escapeHTML(item.student.name)}</div>
              <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">Roll ${escapeHTML(item.student.roll)}</div>
            </div>
          </div>
        </td>
        <td style="font-weight: 700; font-size: 14px; font-family: var(--font-mono);">
          ${
            isThresholdMet
              ? `${scoreFormatted.display} <span style="font-size: 11px; color: var(--text-tertiary); font-weight: normal;">/ 4</span>`
              : `<span style="font-size: 11.5px; font-weight: normal; color: var(--text-tertiary); font-style: italic;">Hidden (< 3 ratings)</span>`
          }
        </td>
        <td style="color: var(--text-secondary); font-family: var(--font-mono); font-size: 12px;">
          ${item.ratingCount} ${item.ratingCount === 1 ? "rating" : "ratings"}
        </td>
      </tr>
    `;
    })
    .join("");

  container.innerHTML = `
    <div class="rankings-table-wrapper">
      <table class="rankings-table">
        <thead>
          <tr>
            <th style="width: 64px;">INDEX</th>
            <th>STUDENT IDENTIFIER</th>
            <th style="width: 160px;">PERCEPTION MEAN</th>
            <th style="width: 140px;">SAMPLE SIZE</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  // Attach row click listeners
  container.querySelectorAll("tbody tr").forEach((row) => {
    row.addEventListener("click", () => {
      const studentId = row.getAttribute("data-student-id");
      const { students } = getState();
      const student = students.find((s) => s.id === studentId);
      if (student) {
        openStudentProfile(student);
      }
    });
  });
}

/**
 * Open and Render User Account Modal (Device limit manager, permissions, logout)
 */
export async function openAccountModal() {
  const { user } = getState();
  if (!user) return;

  const modal = document.getElementById("account-modal");
  const modalBody = document.getElementById("account-modal-body");
  if (!modal || !modalBody) return;

  const statusText = user.isBatch2024
    ? strings.account.batch2024Status
    : strings.account.departmentStatus;

  modalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div class="form-group">
        <label class="form-label">${strings.account.emailLabel}</label>
        <div style="font-family: var(--font-mono); font-size: 14px; font-weight: 600; color: var(--text-primary);">${escapeHTML(user.email)}</div>
      </div>

      <div class="form-group">
        <label class="form-label">${strings.account.statusLabel}</label>
        <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: ${user.isBatch2024 ? "var(--accent-text)" : "var(--text-secondary)"}; font-weight: 500;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${user.isBatch2024 ? "#10b981" : "#3b82f6"};"></span>
          ${statusText}
        </div>
      </div>

      <div style="border-top: 1px solid var(--border-subtle); padding-top: var(--space-4);">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-2);">
          <span style="font-size: 13px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary);">${strings.account.devicesTitle}</span>
          <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">${strings.account.devicesLimitNotice}</span>
        </div>
        <div id="device-sessions-list" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12px; color: var(--text-tertiary);">Loading active device sessions...</div>
        </div>
      </div>
    </div>
  `;

  openModal("account-modal");

  // Load device sessions
  const sessions = await fetchUserDeviceSessions(user.uid);
  const listEl = document.getElementById("device-sessions-list");
  if (listEl) {
    const active = sessions.filter((s) => !s.revoked);
    if (active.length === 0) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-tertiary);">Current active session authenticated.</div>`;
    } else {
      listEl.innerHTML = active
        .map(
          (s) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-surface-subtle); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
          <div>
            <div style="font-size: 13px; font-weight: 500;">${escapeHTML(s.userAgent || "Browser Session")}</div>
            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">${escapeHTML(s.deviceId)}</div>
          </div>
          <button class="btn btn-ghost btn-sm revoke-device-btn" data-device-id="${s.deviceId}" style="color: var(--status-danger-text);">
            Revoke
          </button>
        </div>
      `
        )
        .join("");

      listEl.querySelectorAll(".revoke-device-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const dId = btn.getAttribute("data-device-id");
          btn.disabled = true;
          const ok = await revokeDeviceSession(user.uid, dId);
          if (ok) {
            showToast(strings.toasts.deviceRevoked, "success");
            openAccountModal(); // Refresh modal
          }
        });
      });
    }
  }
}
