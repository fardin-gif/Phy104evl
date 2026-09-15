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
 * Render Metric / Stats Strip
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
    <div class="stat-box highlight">
      <div class="stat-label">${strings.stats.students}</div>
      <div class="stat-number num">${totalStudents}</div>
      <div class="stat-subtext">Active 104 Batch Directory</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">${strings.stats.ratings}</div>
      <div class="stat-number num">${totalRatings}</div>
      <div class="stat-subtext">Anonymous Peer Evaluations</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">${strings.stats.reviews}</div>
      <div class="stat-number num">${totalReviews}</div>
      <div class="stat-subtext">Visible Written Feedback</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">${strings.stats.participation}</div>
      <div class="stat-number num">${participationRate}%</div>
      <div class="stat-subtext">Batch Consensus Metric</div>
    </div>
  `;
}

/**
 * Render Student Cards Grid
 */
export function renderStudentGrid() {
  const container = document.getElementById("student-grid-container");
  if (!container) return;

  const filtered = getFilteredStudents();
  const { aggregates, userSubmittedRatingIds, user } = getState();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <div class="empty-state-title">${strings.directory.noResults}</div>
        <p class="empty-state-desc">Try refining your search keyword or clearing the filters.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((student) => {
      const agg = aggregates[student.id];
      const overall = agg ? agg.overallAverage : null;
      const count = agg ? agg.ratingCount || 0 : 0;
      const scoreFormatted = formatScore(overall);
      const isRated = userSubmittedRatingIds.has(student.id);

      return `
      <div class="student-card" data-student-id="${student.id}" tabindex="0" role="button" aria-label="View profile of ${escapeHTML(student.name)}">
        <div class="card-header">
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

        <div class="card-score-row">
          <div class="score-display">
            <span class="score-val num">${scoreFormatted.display}</span>
            <span class="score-denom">/ 4</span>
          </div>
          <div class="rating-count num">${count} ${count === 1 ? "rating" : "ratings"}</div>
        </div>

        <div class="card-footer-action">
          ${isRated ? `<span style="color:var(--status-success-text); font-size:11.5px; font-weight:600; margin-right:auto;">✓ Rated</span>` : ""}
          <span>View Profile</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
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
  const { aggregates, criteria, user, userSubmittedRatingIds } = getState();
  const agg = aggregates[student.id];
  const overall = agg ? agg.overallAverage : null;
  const count = agg ? agg.ratingCount || 0 : 0;
  const scoreFormatted = formatScore(overall);
  const criterionAverages = agg ? agg.criterionAverages || {} : {};
  const isAlreadyRated = userSubmittedRatingIds.has(student.id);

  const modal = document.getElementById("profile-modal");
  const modalContent = document.getElementById("profile-modal-content");
  if (!modal || !modalContent) return;

  // Criteria breakdown HTML
  const criteriaHtml = criteria
    .filter((c) => c.active)
    .map((c) => {
      const avg = criterionAverages[c.id];
      const avgVal = avg !== undefined && avg !== null ? avg : null;
      const pct = avgVal !== null ? Math.max(0, Math.min(100, ((avgVal - (c.minScore ?? -1)) / ((c.maxScore ?? 4) - (c.minScore ?? -1))) * 100)) : 0;
      return `
      <div class="criterion-row">
        <div class="criterion-header">
          <span class="criterion-name">${escapeHTML(c.name)}</span>
          <span class="criterion-score-val num">${avgVal !== null ? avgVal.toFixed(2) : "—"} / ${c.maxScore ?? 4}</span>
        </div>
        <div class="criterion-bar-bg">
          <div class="criterion-bar-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
    })
    .join("");

  // Rating action button section
  let ratingActionHtml = "";
  if (user && user.canSubmitRating) {
    if (isAlreadyRated) {
      ratingActionHtml = `
        <div style="padding: 10px 14px; background: var(--status-success-bg); border: 1px solid var(--status-success-border); color: var(--status-success-text); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px;">
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
      <div style="padding: 8px 12px; background: var(--bg-surface-subtle); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-tertiary);">
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
          <span style="font-size:16px; font-weight:700;" class="num">${scoreFormatted.display}</span>
          <span style="font-size:12px; color:var(--text-tertiary);" class="num">/ 4.00</span>
          <span style="font-size:12px; color:var(--text-tertiary);">(${count} ratings)</span>
        </div>
      </div>
    </div>

    <div style="margin-bottom: var(--space-6);">
      <h3 style="font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-secondary); margin-bottom:var(--space-3);">
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
        <span id="review-count-badge" class="num" style="font-size:12px; font-weight:normal; color:var(--text-tertiary);">Loading...</span>
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
    if (countBadge) countBadge.textContent = `${reviews.length} written`;
    if (reviews.length === 0) {
      reviewsContainer.innerHTML = `
        <div style="padding: var(--space-4); text-align: center; color: var(--text-tertiary); font-size: 13px;">
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

/**
 * Open and Setup Rating Form Modal
 */
export function openRatingModal(student) {
  const { criteria } = getState();
  const activeCriteria = criteria.filter((c) => c.active);
  const modal = document.getElementById("rating-modal");
  const formContent = document.getElementById("rating-form-fields");
  if (!modal || !formContent) return;

  document.getElementById("rating-modal-target-name").textContent = student.name;
  document.getElementById("rating-modal-target-roll").textContent = `Roll ${student.roll}`;

  // Build criteria score selector buttons
  const formHtml = activeCriteria
    .map((c) => {
      const min = c.minScore ?? -1;
      const max = c.maxScore ?? 4;
      const options = [];
      for (let s = min; s <= max; s++) {
        options.push(
          `<button type="button" class="score-btn" data-criterion-id="${c.id}" data-score="${s}">${s}</button>`
        );
      }

      return `
      <div class="rating-form-criterion">
        <div class="rating-criterion-title">${escapeHTML(c.name)}</div>
        <div class="score-options" id="score-group-${c.id}">
          ${options.join("")}
        </div>
      </div>
    `;
    })
    .join("");

  formContent.innerHTML = formHtml;

  // Rating form state
  const currentScores = {};
  const submitBtn = document.getElementById("btn-submit-rating");
  if (submitBtn) submitBtn.disabled = true;

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

  // Handle score button selections
  formContent.querySelectorAll(".score-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cId = btn.getAttribute("data-criterion-id");
      const scoreVal = parseInt(btn.getAttribute("data-score"), 10);

      // Deselect siblings
      const group = document.getElementById(`score-group-${cId}`);
      group?.querySelectorAll(".score-btn").forEach((b) => b.classList.remove("selected"));

      // Select this
      btn.classList.add("selected");
      currentScores[cId] = scoreVal;

      // Check if all active criteria scored
      const allScored = activeCriteria.every((c) => currentScores[c.id] !== undefined);
      if (submitBtn) submitBtn.disabled = !allScored;
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
      showToast(strings.ratingModal.ratingRecorded, "success", 6000);

      // Re-render UI
      renderStats();
      renderStudentGrid();
    } catch (err) {
      showToast(err.message || strings.toasts.genericError, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = strings.ratingModal.submitBtn;
    }
  };

  openModal("rating-modal");
}

/**
 * Render Rankings Measurement View
 */
export function renderRankings() {
  const container = document.getElementById("rankings-container");
  if (!container) return;

  const ranked = calculateRankings();

  if (ranked.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">${strings.rankings.emptyRankings}</div>
      </div>
    `;
    return;
  }

  const rows = ranked
    .map((item, index) => {
      const rankFormatted = String(index + 1).padStart(2, "0");
      const isTopRank = index < 3;
      const scoreFormatted = formatScore(item.overallAverage);

      return `
      <tr data-student-id="${item.student.id}" style="cursor: pointer;">
        <td class="rank-cell ${isTopRank ? "top-rank" : ""}">
          ${rankFormatted}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="student-avatar" style="width: 32px; height: 32px; font-size: 12px;">
              ${
                item.student.imageUrl
                  ? `<img src="${escapeHTML(item.student.imageUrl)}" alt="${escapeHTML(item.student.name)}" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='${getInitials(item.student.name)}'"/>`
                  : getInitials(item.student.name)
              }
            </div>
            <div>
              <div style="font-weight: 600;">${escapeHTML(item.student.name)}</div>
              <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">Roll ${escapeHTML(item.student.roll)}</div>
            </div>
          </div>
        </td>
        <td class="num" style="font-weight: 700; font-size: 15px;">
          ${scoreFormatted.display} <span style="font-size: 11px; color: var(--text-tertiary); font-weight: normal;">/ 4</span>
        </td>
        <td class="num" style="color: var(--text-secondary);">
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
            <th>${strings.rankings.rankHeader}</th>
            <th>${strings.rankings.studentHeader}</th>
            <th>${strings.rankings.overallHeader}</th>
            <th>${strings.rankings.ratingsHeader}</th>
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
