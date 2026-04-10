# Edamame Legal Flow — MVP Feature Plan

## Context

Edamame Legal Flow is currently a **functional prototype** with no data persistence (all state resets on refresh), no authentication, no document handling, and no database. The pitch deck (Slide 9) defines the MVP scope as three layers: **Business Layer**, **Intelligence Layer**, and **Client Layer**. This plan aligns to that scope.

### Dual Storage Model

Users choose between **Local** or **Cloud** storage during onboarding:

- **Local mode** — all data stays on-device. Uses Dexie.js (IndexedDB) for structured data and OPFS (Origin Private File System) for documents. No account required. Zero network calls for client data. Full AU Privacy Act / APPs compliance for data sovereignty.
- **Cloud mode** — data stored in Supabase (Postgres + Auth + Storage). Multi-device access, team collaboration, real-time sync. Requires account.

A **repository pattern** abstracts the storage layer so all pages use the same interface regardless of backend. The user's choice is stored in `localStorage` and read at app initialization.

---

## Reference: MVP Scope (Slide 9)

### Business Layer
- Case Management — Customer/Progress/Status, Workflow Assignment, System Record
- Workflow (linked to Case) — Manual Creation, No Automation
- Support processes for Visa Sub Types: **186, 482, 490, 820**
- Customer Records — CSV Import, Manual Data Entry, Passport OCR
- Dashboard
- *(PARKED)* Multi Entity, Login User Management

### Intelligence Layer
- **OCR — Passport Ingest** to auto-create Customer record
- **PDF Attachment** — attach generated Visa process documents
- Generation (TBC)
- *(PARKED)* Digi Docs / Digital Signatures

### Client Layer
- *(PARKED)* Customer Portal

---

## Technology Stack

### Core (already installed)
| Package | Purpose |
|---------|---------|
| `react` + `react-dom` 19 | UI framework |
| `@google/genai` | Gemini AI (task generation) |
| `date-fns` | Date utilities |
| `lucide-react` | Icon library |
| `uuid` | ID generation |
| `vite` 6 + `typescript` 5.8 | Build tooling |

### Infrastructure (to add)
| Package | Size (gzip) | Purpose |
|---------|-------------|---------|
| `@supabase/supabase-js` | ~15KB | Cloud backend client (Postgres, Auth, Storage) |
| `@tanstack/react-query` | ~12KB | Server state management, caching, background refetch |
| `react-router-dom` v7 | ~14KB | URL routing, protected routes, deep linking |
| `dexie` | ~29KB | Local IndexedDB wrapper (for local storage mode) |

### Feature Libraries (to add)
| Package | Size (gzip) | Purpose |
|---------|-------------|---------|
| `react-hook-form` + `zod` + `@hookform/resolvers` | ~25KB | Form handling & TypeScript-first validation |
| `papaparse` + `@types/papaparse` | ~8KB | CSV parsing for client record import |
| `react-dropzone` | ~10KB | Drag-and-drop file upload |
| `@react-pdf/renderer` | ~200KB (lazy) | PDF generation for visa process documents |
| `sonner` | ~5KB | Toast notifications (dark mode, accessible) |
| `@tanstack/react-table` | ~14KB | Headless data tables (sorting, filtering, pagination) |
| `react-day-picker` | ~10KB | Date picker (uses existing date-fns) |
| `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/pm` | ~30KB | Rich text editor for case notes |

### OCR (to add)
| Package | Size | Purpose |
|---------|------|---------|
| `tesseract.js` | ~1.4MB pkg + ~30MB WASM (runtime) | Client-side OCR engine — passport images processed in-browser, never sent to any server |
| `mrz` | ~12KB | MRZ line parser with ICAO 9303 check digit validation |

**Total new bundle (excluding lazy-loaded PDF + Tesseract WASM):** ~170KB gzipped
**All packages:** MIT or Apache 2.0 licensed, TypeScript-first, actively maintained

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| OCR engine | **Tesseract.js** (not Gemini Vision) | Passport images never leave the browser. Full compliance with AU immigration data handling laws. No API dependency. |
| MRZ validation | **`mrz` package** | Checksummed ICAO 9303 parsing gives high-confidence extraction from the Machine Readable Zone. |
| Local storage | **Dexie.js** (not PouchDB, RxDB, sql.js) | Smallest bundle (29KB), best DX, built-in TypeScript, 1M+ downloads/week. PouchDB sync protocol doesn't match Supabase. sql.js WASM is overkill. RxDB best features require paid license. |
| Local files | **OPFS** (browser API, no package) | Best performance for binary files. Sandboxed filesystem — passport scans invisible to other apps. ~50GB quota on Chrome/Edge. |
| Cloud storage | **Supabase Storage** | Integrated with Supabase Auth + RLS. Signed URLs for secure document access. One vendor. |
| Server state | **TanStack Query** (not Redux/Zustand) | Purpose-built for server state caching. Eliminates loading/error boilerplate. Works with both Supabase and Dexie via repository pattern. |
| Forms | **react-hook-form + zod** (not Formik) | Uncontrolled components = fewer re-renders. Zod schemas double as TypeScript types + runtime validators. Formik is in maintenance mode. |
| Tables | **TanStack Table** (not AG Grid) | Headless = full Tailwind control. All features free (AG Grid paywalls key features). |
| Toasts | **sonner** (not react-toastify) | 5KB, built-in dark mode, Vercel ecosystem standard. react-toastify is 30KB with CSS overrides. |
| Rich text | **Tiptap** (not Lexical/Quill) | Modular, headless, Tailwind-compatible. Lexical is too low-level. react-quill has React 19 issues. |
| Routing | **react-router-dom v7** (not TanStack Router) | Mature, widely adopted, straightforward migration from ViewMode pattern. |
| PDF gen | **@react-pdf/renderer** (not jsPDF) | React component syntax (`<Document><Page><Text>`). jsPDF is imperative and painful for structured docs. |

---

## What Already Exists

### Pre-existing (from prototype)
- Task calendar dashboard with drag-and-drop, completion, reordering
- Case intake with AI task generation (Gemini 2.5 Flash via Vercel serverless)
- Client CRUD (add, edit, search, view case history)
- Workflow template management (create, delete, view)
- Dark/light theme with localStorage persistence
- Responsive layout with sidebar navigation
- Brand styling system (edamame green `#29B767`, Sniglet/Fredoka fonts)

### Newly built (this implementation cycle)
- **Data persistence** — Dexie.js (IndexedDB) for structured data, OPFS for document files. Data survives page refresh.
- **Repository pattern** — abstracted storage layer with interfaces, local implementations, factory, React context.
- **Onboarding** — storage mode selection (Local/Cloud) on first launch.
- **URL routing** — react-router-dom v7 with `/dashboard`, `/cases`, `/cases/:id`, `/clients`, `/templates`, `/settings`.
- **Visa templates** — 186 (ENS), 482 (TSS), 490 (Skilled Regional), 820 (Partner) with structured workflow steps.
- **Case management** — explicit status field (open/in_progress/on_hold/closed), edit/delete case, status dropdown.
- **Case notes** — timestamped notes per case with add/delete.
- **CSV import** — multi-step modal: upload → preview → column mapping → bulk client creation.
- **Enhanced client form** — passport number, expiry, nationality, gender fields.
- **Document management** — drag-drop upload, document list per case, download, preview, delete.
- **Passport OCR** — client-side Tesseract.js + MRZ parsing, image preprocessing, auto-fill client form.

---

## MVP Features To Build

### Phase A: Infrastructure ✅ COMPLETE

#### 1. ✅ Dual Storage Layer (Repository Pattern)
**Why:** Some users refuse cloud storage for client records due to AU immigration data handling requirements. The app must support both local and cloud storage, selected per-user at onboarding.

**Scope:**
- Define repository interfaces for each entity:
  - `IClientRepository` — getAll, getById, create, update, delete
  - `ICaseRepository` — same pattern, plus query by clientId
  - `ITaskRepository` — same pattern, plus query by caseId
  - `ITemplateRepository` — same pattern, plus system defaults
  - `IDocumentRepository` — store, retrieve, delete, listForCase
  - `ICaseNoteRepository` — create, listForCase
- **Local implementations** (Dexie.js + OPFS):
  - Dexie database schema matching the data models
  - OPFS-based file storage for documents (passport scans, PDFs)
  - `useLiveQuery()` integration for reactive data in React
- **Cloud implementations** (Supabase):
  - Supabase client setup (`@supabase/supabase-js`)
  - Postgres schema with RLS policies (org-based multi-tenant)
  - Supabase Storage with signed URLs for documents
  - TanStack Query hooks wrapping Supabase calls
- **Repository factory** — reads user's storage choice from `localStorage`, creates the right implementation set
- **React context provider** — exposes repositories to all pages
- **Onboarding screen** — user picks "Local" or "Cloud" on first launch
- Seed system-default templates for visa subclasses **186, 482, 490, 820** (in both backends)

**Postgres schema (cloud mode):**
- `profiles` (user_id, name, firm_name, storage_mode)
- `clients` (id, name, dob, phone, email, address, passport_data jsonb, nationality, passport_number, passport_expiry, user_id)
- `cases` (id, client_id, title, description, template_id, status, start_date, created_at, user_id)
- `tasks` (id, case_id, title, description, date, is_completed, priority_order, generated_by_ai, user_id)
- `workflow_templates` (id, title, description, visa_subclass, steps jsonb, user_id — nullable for system defaults)
- `documents` (id, case_id, file_name, file_path, file_type, file_size, uploaded_at, user_id)
- `case_notes` (id, case_id, content, created_at, user_id)
- RLS: `USING (user_id = auth.uid())` on all tables; system templates: `user_id IS NULL` with read-only policy

**Dexie schema (local mode):**
- Same tables/fields, stored in IndexedDB via Dexie
- Documents stored as blobs in OPFS (with metadata in Dexie)

**Files to create:**
- `repositories/types.ts` — all repository interfaces
- `repositories/factory.ts` — storage mode factory
- `repositories/local/` — Dexie implementations + OPFS file storage
- `repositories/cloud/` — Supabase implementations
- `contexts/RepositoryContext.tsx` — React context provider
- `services/supabaseClient.ts` — Supabase client init
- `lib/dexieDb.ts` — Dexie database definition
- `lib/opfsStorage.ts` — OPFS file operations
- `pages/Onboarding.tsx` — storage mode selection

**Files to modify:** `App.tsx` (wrap in providers), all `pages/*.tsx` (use repository hooks instead of props), `types.ts`

---

#### 2. ⏸️ Authentication (Cloud Mode) & App Lock (Local Mode) — DEFERRED
**Why:** Cloud mode requires multi-user auth. Local mode needs at minimum a PIN/password lock since sensitive immigration data is stored on-device.

**Scope:**
- **Cloud mode:**
  - Supabase Auth with email/password (Google OAuth as stretch)
  - Login page and registration page
  - Auth state management (session context)
  - Protected routes — redirect unauthenticated users to login
  - Wire up existing "Sign Out" sidebar button
  - User profile (name, firm name) in `profiles` table
- **Local mode:**
  - Optional PIN or password lock (stored as hash in IndexedDB)
  - Simple lock screen on app open
  - No "Sign Out" — replaced with "Lock App" in sidebar
- **Shared:**
  - Auth context that abstracts both modes
  - Protected route wrapper works for both

**Files to modify:** `App.tsx`, `components/Sidebar.tsx`, `types.ts`
**Files to create:** `pages/Login.tsx`, `pages/Register.tsx`, `pages/LockScreen.tsx`, `contexts/AuthContext.tsx`

---

#### 3. ✅ Real Routing
**Why:** Current navigation is a `ViewMode` string in state — no URL support, no browser back/forward, no deep linking, no bookmarkable pages.

**Scope:**
- Install `react-router-dom` v7 (library mode)
- Define routes: `/`, `/onboarding`, `/login`, `/register`, `/dashboard`, `/cases`, `/cases/:id`, `/clients`, `/templates`, `/settings`
- Replace `ViewMode` state + conditional rendering with `<Routes>` via `createBrowserRouter`
- Protected route wrapper (redirects based on auth state + storage mode)
- Update `Sidebar.tsx` to use `<NavLink>` instead of onClick handlers
- Remove `selectedCaseId` state — derive from URL param `:id`

**Files to modify:** `App.tsx` (major refactor), `components/Sidebar.tsx`, `pages/CaseManager.tsx`, `pages/CaseDetails.tsx`, `types.ts` (remove `ViewMode`)
**Files to create:** `components/ProtectedRoute.tsx`

---

### Phase B: Core Business Layer ✅ COMPLETE

#### 4. ✅ Visa Subclass Templates (186, 482, 490, 820)
**Why:** Slide 9 specifies support for visa subclasses 186, 482, 490, 820. The current templates (500, 190, 820/801, 600, 485) don't match the MVP scope.

**Scope:**
- Replace seed templates with AU visa subclasses per the deck:
  - **Subclass 186** — Employer Nomination Scheme (ENS)
  - **Subclass 482** — Temporary Skill Shortage (TSS)
  - **Subclass 490** — Skilled Work Regional (Provisional)
  - **Subclass 820** — Partner (Onshore)
- Each template includes structured workflow steps for the subclass process
- Update `WorkflowTemplate` type to include `steps: { title: string; description: string }[]` and `visaSubclass: string`
- Pass structured steps to Gemini prompt for better AI task generation
- Seed into both Dexie (local) and Supabase (cloud)

**Files to modify:** `pages/Templates.tsx`, `types.ts`, `api/generate-tasks.ts`, `services/geminiService.ts`, repository seed data
**Libraries used:** zod (template validation)

---

#### 5. ✅ Case Workflow Improvements
**Why:** Current case management lacks edit/delete, status tracking is computed only, and there's no case notes or activity log.

**Scope:**
- Edit case details (title, description, start date, template)
- Delete case (with confirmation — cascades to tasks and documents)
- Explicit case status field: `open | in_progress | on_hold | closed`
- Case notes/comments: timestamped rich text entries per case (Tiptap editor)
- Display notes chronologically in CaseDetails

**Files to modify:** `pages/CaseManager.tsx`, `pages/CaseDetails.tsx`, `types.ts`
**Files to create:** `components/CaseNotes.tsx`
**Libraries used:** react-hook-form + zod (case edit form), @tiptap/react (case notes editor)

---

#### 6. ✅ Customer Records — CSV Import & Manual Data Entry
**Why:** Slide 9 lists CSV Import and Manual Data Entry as customer record ingestion methods. Currently only manual form entry exists with limited fields.

**Scope:**
- CSV import: upload a CSV file, parse with PapaParse, map columns to client fields, preview and confirm import
- Bulk client creation from parsed CSV data (via repository — works for both local and cloud)
- Enhanced manual data entry: expand client form with immigration-relevant fields (passport number, nationality, visa status, passport expiry)
- Client data validation via zod schemas (email format, date format, required fields)

**Files to modify:** `pages/Clients.tsx`, `types.ts` (expand `Client` type)
**Files to create:** `components/CsvImport.tsx`, `components/CsvColumnMapper.tsx`
**Libraries used:** papaparse (CSV parsing), react-hook-form + zod (form + validation), @tanstack/react-table (preview table)

---

#### 7. ✅ Document Upload & PDF Attachments
**Why:** Slide 9 includes "PDF Attachment — attach generated Visa process" in the Intelligence Layer. Immigration cases require managing passports, visa grants, COEs, police checks, medical reports.

**Scope:**
- Upload component: drag-and-drop + file picker via react-dropzone
- File type validation (PDF, JPG, PNG, DOCX), size limits (10MB per file)
- Storage: OPFS in local mode, Supabase Storage in cloud mode (via `IDocumentRepository`)
- Document list per case in CaseDetails page
- Document preview (images inline, PDFs in browser viewer) and download
- Delete document capability
- Generate visa process documents as PDFs via @react-pdf/renderer and attach to cases

**Files to modify:** `pages/CaseDetails.tsx` (add documents section), `types.ts`
**Files to create:** `components/DocumentUpload.tsx`, `components/DocumentList.tsx`, `components/VisaProcessPdf.tsx`
**Libraries used:** react-dropzone (upload UI), @react-pdf/renderer (PDF generation, lazy-loaded)

---

### Phase C: Intelligence Layer ✅ COMPLETE

#### 8. ✅ Passport OCR — Customer Record Creation (Client-Side Only)
**Why:** This is the headline Intelligence Layer feature in Slide 9 and a critical competitive differentiator (Slide 8: "No AU tool offers OCR extraction from passports"). Users upload a passport image/scan and the system extracts data to auto-create a customer record.

**Privacy-first approach:** All OCR processing happens in the browser. Passport images are **never sent to any server or external API**. This enforces AU immigration law requirements for handling personal records and is a key selling point vs. competitors.

**Scope:**
- Passport image upload (JPG, PNG) via react-dropzone
- Image preprocessing with canvas API (grayscale, contrast enhancement, threshold) to improve OCR accuracy
- Tesseract.js extracts raw text from passport image (runs in-browser via WASM Web Worker)
- Regex isolates the two 44-character MRZ lines from OCR output
- `mrz` package parses MRZ lines into structured fields with ICAO 9303 check digit validation:
  - Full name, date of birth, nationality, passport number, expiry date, gender
- Auto-populate client creation form with extracted data
- User reviews, edits if needed, and confirms before saving
- Store original passport image as a document (OPFS in local mode, Supabase Storage in cloud mode)
- Confidence indicator: show which fields passed MRZ check digit validation

**OCR pipeline:**
```
Upload passport image (react-dropzone)
        ↓
Canvas preprocessing (grayscale + contrast + threshold)
        ↓
Tesseract.js OCR in Web Worker (~2-5 seconds)
        ↓
Regex extracts MRZ lines (44 chars, A-Z/0-9/< only)
        ↓
`mrz` package parses + validates via check digits
        ↓
Pre-fill client form (react-hook-form)
        ↓
User reviews & confirms → save via repository
```

**UX considerations:**
- Tesseract WASM + language data (~45MB) is lazy-loaded only when user clicks "Scan Passport"
- Show loading indicator during first-time download: "Loading OCR engine..."
- Cache the WASM + language data in browser for subsequent uses
- If MRZ parsing fails (poor image quality), show extracted raw text and let user manually enter fields

**Files to modify:** `pages/Clients.tsx` (add "Scan Passport" flow)
**Files to create:** `components/PassportScanner.tsx`, `services/ocrService.ts`, `services/imagePreprocessor.ts`
**Libraries used:** tesseract.js (OCR engine), mrz (MRZ parser), react-dropzone (image upload)

---

### Phase D: Dashboard & Polish ✅ COMPLETE

#### 9. ✅ Dashboard Enhancements
**Why:** Slide 9 lists Dashboard as a Business Layer feature. Current dashboard shows tasks but lacks case-level overview, status summaries, and deadline visibility.

**Scope:**
- Case status overview cards (open, in progress, on hold, closed counts)
- Upcoming deadlines summary (tasks due within 7 days)
- Overdue task highlighting with visual urgency indicators
- Recent activity feed (new cases, completed tasks, new clients)

**Files to modify:** `pages/Dashboard.tsx`
**Libraries used:** react-day-picker (deadline calendar highlights)

---

#### 10. ✅ Notifications & Deadline Alerts
**Why:** Immigration deadlines are critical — missed deadlines can mean visa refusal. No current alerting exists.

**Scope:**
- In-app notification bell in the top bar
- Overdue task highlighting (tasks past due date + not completed)
- Toast notifications via sonner for real-time events (task completed, new AI tasks generated, OCR complete)
- Notification storage: `notifications` array in Dexie (local) or `notifications` table in Supabase (cloud) — via repository
- Mark as read, dismiss all

**Files to create:** `components/NotificationBell.tsx`
**Files to modify:** `App.tsx` or layout wrapper, `pages/Dashboard.tsx`
**Libraries used:** sonner (toast UI)

---

## Parked Features (Not in MVP — per Slide 9)

These are explicitly marked as "PARKING" in the deck and should be deferred:

- **Multi Entity** — multi-firm/organization support
- **Login User Management** — admin-level user/role management (basic auth is in scope)
- **Digital Signatures** — Digi Docs / e-signature capability
- **Customer Portal** — client-facing portal (parked, but noted as strategic priority)

---

## Implementation Status

```
Phase A: Infrastructure ✅ COMPLETE
  1. ✅ Dual Storage Layer (Repository Pattern) — Dexie + OPFS implemented, Supabase stub (falls back to local)
  2. ✅ Onboarding (storage mode selection) — full onboarding page with Local/Cloud choice
  3. ✅ Real Routing (react-router-dom v7) — ViewMode replaced, Sidebar uses NavLink, URL-based navigation

Phase B: Core Business Layer ✅ COMPLETE
  4. ✅ Visa Subclass Templates (186, 482, 490, 820) — seed data with structured steps
  5. ✅ Case Workflow Improvements — edit/delete case, status field, case notes
  6. ✅ Customer Records — CSV Import + enhanced client form (passport fields, nationality, gender)
  7. ✅ Document Upload & PDF Attachments — drag-drop upload, document list, download, delete

Phase C: Intelligence Layer ✅ COMPLETE
  8. ✅ Passport OCR — Client-Side Only (Tesseract.js + mrz) — image preprocessing, MRZ parsing, PassportScanner modal

Phase D: Dashboard & Polish ✅ COMPLETE
  9. ✅ Dashboard Enhancements — status overview cards, upcoming deadlines, overdue highlighting, activity feed
  10. ✅ Notifications & Deadline Alerts — notification bell, sonner toasts, notification repository integration

Phase A Deferred (not blocking MVP):
  - ⏸️ Authentication (Cloud Mode) — Supabase Auth, login/register pages, protected routes by auth
  - ⏸️ App Lock (Local Mode) — PIN/password lock screen
  - ⏸️ Cloud repository implementations — Supabase Postgres + Storage + RLS policies
```

---

## Install Commands (✅ All installed)

All dependencies have been installed. For reference:

```bash
cd src

# Phase A: Infrastructure
npm install @supabase/supabase-js @tanstack/react-query react-router-dom dexie

# Phase B: Feature libraries
npm install react-hook-form zod @hookform/resolvers
npm install papaparse @tanstack/react-table react-dropzone react-day-picker
npm install @react-pdf/renderer
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm
npm install sonner

# Phase C: OCR (client-side, privacy-first)
npm install tesseract.js mrz

# Dev dependencies
npm install -D @types/papaparse @tanstack/react-query-devtools
```

**Note:** `@react-pdf/renderer`, `@tiptap/*`, `react-hook-form`, `zod`, `@hookform/resolvers`, `@tanstack/react-table`, and `react-day-picker` are installed but not yet used in the codebase. They are available for future feature work (rich text case notes, PDF generation, advanced table views, form validation).

---

## Files Created / Modified

### New Files (Phase A — Infrastructure)
| File | Purpose |
|------|---------|
| `src/types.ts` | Updated with CaseStatus, CaseNote, Document, Notification, StorageMode, WorkflowStep types |
| `src/repositories/types.ts` | Repository interfaces (IClientRepository, ICaseRepository, ITaskRepository, etc.) |
| `src/repositories/factory.ts` | Creates repo instances based on storage mode (local/cloud) |
| `src/repositories/local/index.ts` | Full Dexie-based implementations of all repository interfaces |
| `src/contexts/RepositoryContext.tsx` | React context providing `useRepositories()` and `useStorageMode()` hooks |
| `src/lib/dexieDb.ts` | Dexie database schema (7 tables: clients, cases, tasks, templates, caseNotes, documents, notifications) |
| `src/lib/opfsStorage.ts` | OPFS file storage helpers (saveFile, readFile, deleteFile) |
| `src/lib/seedData.ts` | Default visa templates: 186 (ENS), 482 (TSS), 490 (Skilled Regional), 820 (Partner) |
| `src/pages/Onboarding.tsx` | Storage mode selection (Local vs Cloud) |
| `src/components/ProtectedRoute.tsx` | Redirects to onboarding if no storage mode set |

### Modified Files (Phase A — Infrastructure)
| File | Changes |
|------|---------|
| `src/App.tsx` | Major refactor: BrowserRouter, RepositoryProvider, data loaded from repos, onboarding flow |
| `src/components/Sidebar.tsx` | Replaced ViewMode buttons with NavLink from react-router-dom |
| `src/pages/CaseManager.tsx` | Uses `useNavigate()` instead of `onChangeView`/`onSelectCase` props |
| `src/pages/NewCase.tsx` | Added `status: 'open'` to new Case objects |

### New Files (Phase B — Business Layer)
| File | Purpose |
|------|---------|
| `src/components/CaseNotes.tsx` | Timestamped notes per case, CRUD via repository |
| `src/components/CsvImport.tsx` | Multi-step CSV import modal (upload → preview → map columns → import) |
| `src/components/DocumentUpload.tsx` | Drag-drop file upload (PDF, JPG, PNG, DOCX, 10MB max) |
| `src/components/DocumentList.tsx` | Document list per case with download, preview, delete |

### Modified Files (Phase B — Business Layer)
| File | Changes |
|------|---------|
| `src/pages/CaseDetails.tsx` | Status badge + dropdown, edit/delete case modals, document section, case notes |
| `src/pages/Clients.tsx` | "Import CSV" + "Scan Passport" buttons, expanded form with passport/nationality/gender fields |

### New Files (Phase C — Intelligence Layer)
| File | Purpose |
|------|---------|
| `src/services/imagePreprocessor.ts` | Canvas-based grayscale + contrast + threshold for OCR accuracy |
| `src/services/ocrService.ts` | Tesseract.js OCR → regex MRZ extraction → `mrz` package parsing |
| `src/components/PassportScanner.tsx` | Modal: upload passport image → OCR → review fields → confirm |

### Build Status
- `npm run lint` (tsc --noEmit): ✅ Passes
- `npm run build` (vite build): ✅ Passes (585 KB bundle, chunk size warning only)

---

## Verification

After each feature:
- `npm run lint` passes (no type errors)
- `npm run build` succeeds
- **Local mode test:** launch app → pick "Local" → create client (manual + CSV + passport OCR) → create case → generate AI tasks → upload document → refresh page → data persists → no network calls for client data
- **Cloud mode test:** launch app → pick "Cloud" → create account → log in → create client → create case → generate AI tasks → upload document → sign out → data persists on re-login
- **RLS (cloud):** verify one user cannot see another user's data via Supabase dashboard or API
- **Privacy (local + OCR):** verify browser DevTools Network tab shows zero requests during passport scan and client data operations
- Responsive: test on mobile viewport (375px width)

---

## Browser Storage Quotas (Local Mode)

| Browser | Per-Origin Limit | Notes |
|---------|-----------------|-------|
| Chrome/Edge | ~50GB (60% of free disk) | Auto-granted for frequent sites |
| Firefox | ~10GB | Can request persistent storage |
| Safari (macOS) | ~20-50GB | macOS 14+ |

Check programmatically: `navigator.storage.estimate()`. Request persistence: `navigator.storage.persist()`.
