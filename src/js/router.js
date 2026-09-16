/**
 * DU Physics 104 - Simple Client Router & View Switcher
 */
import { getState, setState } from "./state.js";
import { renderRankings } from "./ui.js";

export function initRouter() {
  window.addEventListener("hashchange", handleRouteChange);
  handleRouteChange();
}

export function navigateTo(hash) {
  window.location.hash = hash;
}

function handleRouteChange() {
  const hash = window.location.hash || "#/students";
  const { user } = getState();

  const authView = document.getElementById("view-auth");
  const appViewsContainer = document.getElementById("main-authenticated-content");
  const directoryView = document.getElementById("view-directory");
  const rankingsView = document.getElementById("view-rankings");
  const mobileNav = document.getElementById("mobile-bottom-nav");

  // If unauthenticated: lock to Auth screen
  if (!user || !user.canViewData) {
    if (authView) authView.style.display = "block";
    if (appViewsContainer) appViewsContainer.style.display = "none";
    if (mobileNav) mobileNav.style.display = "none";
    return;
  }

  // Authenticated: show main app views
  if (authView) authView.style.display = "none";
  if (appViewsContainer) appViewsContainer.style.display = "block";
  if (mobileNav) mobileNav.style.display = ""; // Let CSS media query control display (flex on mobile, none on desktop)

  // Navigation tabs state
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.remove("active");
    if (link.getAttribute("href") === hash) {
      link.classList.add("active");
    }
  });

  if (hash === "#/rankings") {
    if (directoryView) directoryView.style.display = "none";
    if (rankingsView) {
      rankingsView.style.display = "block";
      renderRankings();
    }
    setState({ currentView: "rankings" });
  } else {
    if (directoryView) directoryView.style.display = "block";
    if (rankingsView) rankingsView.style.display = "none";
    setState({ currentView: "directory" });
  }
}
