# DU Physics 104 — Private Peer Review System

> **Identity**: `104 | PHYSICS · UNIVERSITY OF DHAKA`  
> **Working Name**: `104 Peer Review`  
> **Aesthetic Philosophy**: Precision Academic Editorial & Measurement Design (No AI Slop, Vanilla JS, HTML5, CSS3, Firebase).

---

## 1. Project Overview & Ownership

This is a private, high-integrity peer evaluation and perception measurement system designed specifically for **Batch 104, Department of Physics, University of Dhaka**.

### Critical Ownership Principle
* **Developer Owned**: The Firebase and Google Cloud project is strictly owned by the developer's Google account.
* **No Hardcoded Secrets**: Client-side bundles contain **zero** service accounts, private keys, or admin secrets.
* **Server-Authoritative**: Permissions, device restrictions, and evaluation uniqueness are enforced strictly via **Firestore Security Rules**, **Firebase Authentication**, and **Cloud Functions**.

---

## 2. University Email Authorization Architecture

Students authenticate using their official University of Dhaka Physics Department email.

| User Category | Email Regex Pattern | Allowed Capabilities |
| :--- | :--- | :--- |
| **Category A: Unauthenticated** | None | Auth screen only. Cannot view student directory, ratings, or rankings. |
| **Category B: Physics Student** | `^s-\d{10}@phy\.du\.ac\.bd$` (e.g. `s-2023123456@phy.du.ac.bd`) | Read active students, search, view profiles, criterion averages, visible reviews, rankings. **View-only**. |
| **Category C: 2024 Batch Member** | `^s-2024\d{6}@phy\.du\.ac\.bd$` (e.g. `s-2024713443@phy.du.ac.bd`) | All Category B privileges **plus**: submit exactly one immutable rating per target student, self-rate, optional anonymous review. |
| **Administrator** | Verified via protected backend verification | Student CRUD, Criteria configuration, Review moderation, Audit logs, CSV data exports. |

---

## 3. Firebase Setup Guide

Follow these exact steps in the [Firebase Console](https://console.firebase.google.com/):

### Step 1: Create or Open Your Firebase Project
1. Create a project in the Firebase Console (e.g., `du-physics-104`).
2. Upgrade to the **Blaze (Pay as you go)** plan to support Cloud Functions (free tier covers thousands of invocations).

### Step 2: Register Web App & Insert Configuration
1. Go to **Project Settings** > **General** > **Your apps** > Add **Web app** (`</>`).
2. Copy the `firebaseConfig` object and update `src/js/config.js` (or use `firebase-config.example.js`):

```javascript
// src/js/config.js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### Step 3: Configure Authentication (Email Link / Passwordless)
1. In the Firebase Console, navigate to **Authentication** > **Sign-in method**.
2. Enable **Email/Password**.
3. Toggle on **Email link (passwordless sign-in)**.
4. Go to **Settings** > **Authorized domains** and add:
   - Your production domain (e.g., `your-app.web.app` or custom domain).
   - `localhost` for local development.

### Step 4: Provision Cloud Firestore
1. Navigate to **Firestore Database** > **Create database**.
2. Select your desired region (e.g., `asia-south1` or `us-central1`).
3. Start in production mode.

---

## 4. Deploying Security Rules, Indexes & Cloud Functions

Install the Firebase CLI if you haven't already:
```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
```

### Deploy Firestore Security Rules & Composite Indexes
The repository includes strict `firestore.rules` and `firestore.indexes.json`:
```bash
firebase deploy --only firestore
```

### Deploy Cloud Functions
The repository includes backend functions in `/functions` for atomic rating recalculation, device session limits, and admin authentication:
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### Deploy Web Hosting
```bash
npm run build
firebase deploy --only hosting
```

---

## 5. Administration Portal (`/admin`)

The administration interface is served at `/admin` (or `/admin/index.html`):

* **Default Developer Credentials**:
  - **Email**: `admin@phy.du.ac.bd`
  - **Password**: `physics104admin`
* **Production Admin Model**:
  - In production, admin credentials can be stored as salted bcrypt hashes in the protected `/admins` collection or mapped to custom claims via the `adminLogin` Cloud Function.
* **Capabilities**:
  - **Students**: Add/edit students with Google Drive portraits, roll uniqueness check, soft deactivation.
  - **Criteria**: Configure evaluation dimensions with min/max scores (-1 to 4).
  - **Review Moderation**: Soft-hide offensive or improper feedback without data loss.
  - **Exports**: RFC 4180 compliant CSV exports for students, reviews, and criteria.

---

## 6. Google Drive Image Sharing Requirements

When adding student portraits using Google Drive sharing links:
1. Ensure the file permissions in Google Drive are set to:  
   **"Anyone with the link can view"** (`Viewer`).
2. Paste any valid share link, such as:
   - `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`
   - `https://drive.google.com/open?id=FILE_ID`
3. The application automatically extracts the `FILE_ID` and serves it via high-speed CDN:  
   `https://lh3.googleusercontent.com/d/FILE_ID`
4. If an image fails to load or privacy prevents loading, a graceful typographic initials fallback is rendered without breaking card geometry.

---

## 7. Security & Integrity Enforcements

* **Anonymity**: The public student client queries **only** precomputed aggregates and `visible: true` reviews. Raw ratings documents (`ratings/{reviewerUid}_{targetStudentId}`) are strictly unreadable by student clients.
* **Single Rating Constraint**: The deterministic document key `${reviewerUid}_${targetStudentId}` prevents duplicate submissions even under concurrent requests.
* **Immutability**: `firestore.rules` specifies `allow update, delete: if false;` on ratings. Once recorded, a score cannot be edited or erased.
* **Device Limit**: Maximum of 3 concurrent active device sessions enforced per account under `users/{uid}/deviceSessions/{deviceId}`.
* **No Mock Backend in Production**: Direct Firebase SDK connectivity with graceful development preview fallbacks.

---

## 8. Local Development

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Run TypeScript / linter validation
npm run lint

# Compile production bundle into dist/
npm run build
```

---

## 9. Testing & Verification Checklist

- [x] **Email Format Validation**: Rejects malformed emails, personal Gmails, or invalid digit lengths.
- [x] **2024 Batch Detection**: Distinguishes between 2024 voters and view-only physics students.
- [x] **Single Rating Enforcement**: Prevents submitting duplicate ratings for the same peer.
- [x] **No Rating Edits**: Submission buttons and endpoints block modification after recording.
- [x] **Review Length**: Enforces 500-character ceiling with live character counter.
- [x] **Privacy & Anonymity**: Zero exposure of reviewer email, UID, or timestamp linkages to ordinary students.
- [x] **Device Limit**: Tracks active sessions and prompts to revoke when exceeding 3 devices.
- [x] **Light/Dark Theming**: Academic high-contrast light theme default, accessible dark mode, preference persisted in local storage.
- [x] **PWA Ready**: Web app manifest, vector icon, and offline theme metadata.
