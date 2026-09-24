/**
 * DU Physics 104 - Main Application Entry Point
 */
import { initFirebase } from "./firebase.js";
import { 
  initAuthListener, 
  sendEmailLinkAuth, 
  handleEmailLinkCallback,
  signInWithGoogle
} from "./auth.js";
import { loadStudents } from "./students.js";
import { loadCriteria, loadAggregates, loadUserSubmittedRatings } from "./ratings.js";
import { loadUserSubmittedReviews } from "./reviews.js";
import { 
  renderHeader, 
  renderStats, 
  renderStudentGrid, 
  renderRankings, 
  showToast, 
  closeModal 
} from "./ui.js";
import { subscribe, getState, setState } from "./state.js";
import { debounce, applyTheme } from "./utils.js";
import { isValidDepartmentEmail } from "./validation.js";
import { initRouter } from "./router.js";
import { strings } from "../translations/en.js";

async function bootstrap() {
  console.log("Initializing DU Physics 104 Private Peer Review System...");

  // Apply theme
  const initialTheme = localStorage.getItem("du_phy_104_theme") || "light";
  applyTheme(initialTheme);

  // Initialize Firebase SDK
  initFirebase();

  // Check if opened from email link
  try {
    const userFromLink = await handleEmailLinkCallback();
    if (userFromLink) {
      showToast("Verification complete. Welcome to DU Physics 104!", "success");
    }
  } catch (err) {
    console.warn("Email link callback note:", err);
    showToast(err.message || strings.toasts.linkExpired, "error");
  }

  // Subscribe UI renders to state changes
  subscribe((state) => {
    renderHeader();
    if (state.user && state.user.canViewData) {
      renderStats();
      if (state.currentView === "directory") {
        renderStudentGrid();
      } else if (state.currentView === "rankings") {
        renderRankings();
      }
    }
  });

  // Listen to Auth State
  initAuthListener(async (user) => {
    if (user && user.canViewData) {
      await Promise.all([
        loadStudents(), 
        loadCriteria(), 
        loadAggregates(),
        loadUserSubmittedRatings(user.uid),
        loadUserSubmittedReviews(user.uid)
      ]);
      renderStats();
      renderStudentGrid();
    }
    initRouter();
  });

  // Setup DOM Event Handlers
  setupEventListeners();

  // Close modals on overlay backdrop click
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });

    overlay.querySelectorAll(".modal-close").forEach((closeBtn) => {
      closeBtn.addEventListener("click", () => closeModal(overlay.id));
    });
  });
}

function setupEventListeners() {
  // Google Sign-In (1-Click, No Email Quota Limits)
  const googleSignInBtn = document.getElementById("btn-google-sign-in");
  const authErrorEl = document.getElementById("auth-error-msg");

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener("click", async () => {
      if (authErrorEl) authErrorEl.style.display = "none";
      googleSignInBtn.disabled = true;
      const originalHtml = googleSignInBtn.innerHTML;
      googleSignInBtn.innerHTML = `
        <span style="display:inline-block; animation:spin 1s linear infinite;">⏳</span>
        <span>Signing in with Google...</span>
      `;

      try {
        await signInWithGoogle();
        showToast("Signed in successfully with your Google account!", "success");
      } catch (err) {
        if (authErrorEl) {
          // Check for popup closed by user
          if (err.code === "auth/popup-closed-by-user") {
            authErrorEl.textContent = "Sign-in cancelled. Please complete the Google sign-in popup.";
          } else {
            authErrorEl.textContent = err.message || "Could not sign in with Google. Please try again.";
          }
          authErrorEl.style.display = "block";
        }
      } finally {
        googleSignInBtn.disabled = false;
        googleSignInBtn.innerHTML = originalHtml;
      }
    });
  }

  // Auth Form (Passwordless Email Link)
  const authForm = document.getElementById("auth-form");
  const emailInput = document.getElementById("auth-email-input");
  const authSubmitBtn = document.getElementById("auth-submit-btn");

  if (authForm && emailInput) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim().toLowerCase();

      if (!isValidDepartmentEmail(email)) {
        if (authErrorEl) {
          authErrorEl.textContent = strings.auth.invalidEmailError;
          authErrorEl.style.display = "block";
        }
        return;
      }

      if (authErrorEl) authErrorEl.style.display = "none";
      if (authSubmitBtn) {
        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = strings.auth.sendingLink;
      }

      try {
        await sendEmailLinkAuth(email);
        showToast("Verification email link dispatched! Please inspect your university inbox.", "success", 7000);
        const feedback = document.getElementById("auth-sent-feedback");
        if (feedback) feedback.style.display = "block";
      } catch (err) {
        if (authErrorEl) {
          let msg = err.message || strings.toasts.genericError;
          if (err.code === "auth/quota-exceeded" || (err.message && err.message.includes("quota-exceeded"))) {
            msg = "Firebase: Exceeded Email quota. Please try again few moments later.";
          }
          authErrorEl.textContent = msg;
          authErrorEl.style.display = "block";
        }
      } finally {
        if (authSubmitBtn) {
          authSubmitBtn.disabled = false;
          authSubmitBtn.textContent = strings.auth.sendLinkBtn;
        }
      }
    });
  }

  // Directory Search & Filter
  const searchInput = document.getElementById("directory-search-input");
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      debounce((e) => {
        setState({ searchQuery: e.target.value });
        renderStudentGrid();
      }, 150)
    );
  }

  // Filter Buttons ('all', 'rated', 'unrated')
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.getAttribute("data-filter") || "all";
      setState({ activeFilter: filter });
      renderStudentGrid();
    });
  });
}

// Boot on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
