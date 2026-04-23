<div align="center">

# Edamame Legal Flow

**AI-powered case, task, and document management for Australian / NZ immigration lawyers and study abroad agencies**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google)](https://ai.google.dev)
[![Dexie](https://img.shields.io/badge/Dexie-IndexedDB-F96415)](https://dexie.org)
[![CI](https://github.com/wandering-pork/edemame/actions/workflows/ci.yml/badge.svg)](https://github.com/wandering-pork/edemame/actions/workflows/ci.yml)

</div>

---

## Purpose

Edamame Legal Flow is an end-to-end case management platform purpose-built for **Australian and New Zealand immigration practitioners** — from sole agents through to enterprise firms — and for study abroad agencies that support visa applications.

It replaces the fragmented, rule-based tools that dominate the incumbent market (Migration Manager, Officio, Clio, Smokeball) with an **AI-first workflow engine** that turns a plain-language case description and a workflow template into a structured, dated task schedule in seconds. The same AI layer powers passport OCR, visa eligibility assessment, and a case-aware chat assistant, so practitioners spend less time on administrative scaffolding and more time advising clients.

**Market position:** no existing AU/NZ incumbent offers AI-powered document processing, applicant self-service, and multi-jurisdiction support in one product — Edamame targets that gap.

---

## Feature Highlights

### AI-Powered

- **AI Task Generation** — Google Gemini 2.5 Flash reads the case description + workflow template and generates a chronologically ordered task list with suggested date offsets. Tasks drop straight onto the Dashboard calendar.
- **Visa Eligibility Advisor** — Four-step wizard collects client profile, immigration goals, conditional details, and supporting factors. Gemini returns verdicts (`qualifies` / `possibly` / `unlikely` / `needs_more_info`) across **9 Australian visa subclasses**, plus a recommended pathway and a suggested template keyword that pre-selects a template when opening a new case.
- **Passport OCR** — Upload a passport biodata page; Gemini Vision extracts name, DOB, nationality, passport number, expiry date, and gender. Client-side image preprocessing (grayscale + contrast boost) improves accuracy. Manual-entry fallback if OCR fails.
- **Focus Mode Chat** — Case-aware AI assistant inside Case Details. The backend builds a system prompt from the case context so answers are grounded in the specific matter.

### Case & Client Management

- **Dashboard** — Week-view task calendar with scope filters (mine / team / all), drag-to-reorder priority, completion toggles, and overdue / today / upcoming grouping.
- **Case Manager** — Search and list cases, create from a workflow template, assign to team members, track status (`open` / `in_progress` / `on_hold` / `closed`).
- **Case Details** — Per-case hub for tasks, notes, documents, checklists, the PDF bundler, the Partner 820 submission builder, AI task generation, and Focus Mode chat.
- **Case Notes** — Per-case timestamped notes with Ctrl+Enter submit, newest-first ordering.
- **Clients** — CRUD, search, quick-launch visa eligibility check, and **CSV bulk import** with step-by-step preview and column mapping (powered by Papa Parse).
- **Workflow Templates** — System defaults plus user-created templates; fully editable.

### Document Management

- **Drag-and-drop document upload** (PDF, DOCX, images) with file-type icons and image thumbnails.
- **Partner 820 Bundle Builder** — Australia's Partner visa requires evidence grouped by *aspects of the relationship* (Financial / Household / Social / Commitment) plus identity, sponsor, and police/health slots. Edamame tags each document by aspect, suggests tags via filename heuristics, and auto-produces ImmiAccount-ready bundles.
- **PDF Packager** — Merges selected documents into one or more PDFs, auto-split to a configurable size target (default 5 MB) to fit ImmiAccount upload limits. Built on `pdf-lib`.
- **Checklist Templates** — Pre-built document requirement checklists per visa subclass (186, 482, 490, 820) with status tracking (`pending` / `uploaded` / `verified` / `waived`).
- **OPFS file storage** — Document blobs are stored in the browser's Origin Private File System, keeping files local and private.

### Team Collaboration

- **Team Dashboard** — Workload badges per member, case / task distribution, activity feed, and role-based display (partner / lawyer / assistant).
- **Team Members** — Add, edit, and remove members; reassign cases with a tracked assignment history on each case.
- **Notifications** — In-app bell with read / unread toggle, mark-all-as-read, and auto-generated overdue-task warnings.

### Platform

- **Local-first persistence** — All data is stored locally in IndexedDB via Dexie; documents live in OPFS. Works offline after first load.
- **Repository pattern** — Pluggable storage backend; cloud mode is stubbed out for future Supabase integration.
- **Onboarding flow** — First-run storage-mode picker seeds default team members, clients, cases, and templates.
- **Dark / Light mode** — Class-based Tailwind theming, preference persisted in `localStorage`.
- **Toast notifications** — Non-blocking feedback via Sonner.

---

## Included Workflow Templates

| Template | Visa Type |
|----------|-----------|
| Student Visa 500 | Australian student visa |
| Skilled Nominated 190 | State-nominated skilled migration |
| Partner Visa 820/801 | Onshore partner visa (with dedicated bundle builder) |
| Visitor Visa 600 | Temporary visitor |
| Temporary Graduate 485 | Post-study work stream |

**Visa Eligibility Advisor** assesses these plus Skilled Independent 189, Temporary Skill Shortage 482, Employer Nominated 186, and Working Holiday 417.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| UI | React 19, TypeScript 5.8, Tailwind CSS |
| Build | Vite 6 |
| Routing | React Router v7 |
| Forms | React Hook Form + Zod |
| Data fetching | TanStack Query, TanStack Table |
| AI | Google Gemini 2.5 Flash (`@google/genai`) |
| Local DB | Dexie (IndexedDB) |
| File storage | Origin Private File System (OPFS) |
| PDF | `pdf-lib` |
| CSV | Papa Parse |
| OCR | Gemini Vision API (client-side preprocessing) |
| Dates | `date-fns`, `react-day-picker` |
| Uploads | `react-dropzone` |
| Toasts | Sonner |
| Icons | Lucide React |
| IDs | `uuid` |
| Cloud (stubbed) | Supabase SDK |

---

## Architecture

### Dual Runtime

- **Frontend:** React 19 SPA built with Vite 6. Tailwind is loaded via CDN with an inline config in `src/index.html`.
- **Backend:** Vercel serverless functions in the **root-level `api/`** directory (not `src/api/`):
  - `POST /api/generate-tasks` — structured-JSON task generation from a case description and workflow guide
  - `POST /api/check-eligibility` — visa eligibility assessment with structured JSON schema
  - `POST /api/scan-passport-gemini` — passport biodata extraction via Gemini Vision
  - `POST /api/focus-chat` — case-aware streaming chat

### State & Persistence

App state is held in `App.tsx` as React hooks and mirrored to Dexie via a repository layer (`src/repositories/`). A `RepositoryContext` exposes the current backend (local by default) so components do not touch storage directly. Theme and onboarding status are kept in `localStorage`.

### Routing

React Router v7 drives navigation. A `ProtectedRoute` wrapper enforces completion of onboarding (storage-mode pick) before any app route is rendered.

---

## Project Structure

```
edemame/
├── api/                           # Vercel serverless functions
│   ├── generate-tasks.ts
│   ├── check-eligibility.ts
│   ├── scan-passport-gemini.ts
│   └── focus-chat.ts
├── src/
│   ├── App.tsx                    # Root component, routing, state orchestration
│   ├── index.tsx                  # React DOM entry
│   ├── index.html                 # HTML shell + Tailwind CDN config
│   ├── types.ts                   # All shared TypeScript types
│   ├── components/                # Reusable UI
│   │   ├── BundleBuilder820.tsx
│   │   ├── CaseNotes.tsx
│   │   ├── CsvImport.tsx
│   │   ├── DocumentList.tsx
│   │   ├── DocumentUpload.tsx
│   │   ├── NotificationBell.tsx
│   │   ├── PassportScanner.tsx
│   │   ├── PdfPackager.tsx
│   │   ├── ProgressRing.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── Sidebar.tsx
│   │   ├── StatusBadge.tsx
│   │   └── TaskPriority.tsx
│   ├── pages/                     # Page-level views
│   │   ├── LandingPage.tsx
│   │   ├── Onboarding.tsx
│   │   ├── Dashboard.tsx
│   │   ├── CaseManager.tsx
│   │   ├── CaseDetails.tsx
│   │   ├── NewCase.tsx
│   │   ├── Clients.tsx
│   │   ├── VisaAdvisor.tsx
│   │   ├── Templates.tsx
│   │   ├── TeamDashboard.tsx
│   │   ├── TeamMembers.tsx
│   │   └── Settings.tsx
│   ├── services/                  # Client-side API wrappers
│   │   ├── geminiService.ts
│   │   ├── ocrService.ts
│   │   └── imagePreprocessor.ts
│   ├── lib/
│   │   ├── dexieDb.ts             # IndexedDB schema
│   │   ├── opfsStorage.ts         # File blob storage
│   │   ├── aspects820.ts          # Partner 820 aspect metadata
│   │   ├── checklistTemplates.ts  # Per-subclass document checklists
│   │   ├── pdfBundle.ts           # PDF merge / split utilities
│   │   └── seedData.ts            # First-run defaults
│   ├── repositories/              # Pluggable storage backends
│   │   ├── factory.ts
│   │   ├── types.ts
│   │   └── local/                 # Dexie-backed implementation
│   ├── contexts/
│   │   ├── RepositoryContext.tsx
│   │   └── SidebarContext.tsx
│   └── styles/typography.css
├── CLAUDE.md                      # AI assistant guidance
├── MVP_PLAN.md                    # Product plan
└── vercel.json
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18 or later
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)

### Installation

```bash
git clone <repo-url> edemame
cd edemame/src
npm install
```

### Configure your API key

Create `src/.env.local`:

```env
GEMINI_API_KEY=your_api_key_here
```

The Vite config injects the key at build time, and the root-level Vercel functions read it from the server environment at runtime.

### Run the app

```bash
npm run dev       # Vite dev server on http://localhost:3000
```

### Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |

---

## How the AI Flows Work

### Task generation

1. Open a case in **Case Details** and click **Generate Tasks**.
2. `geminiService.ts` POSTs the case description, linked workflow guide, and start date to `/api/generate-tasks`.
3. The serverless function calls Gemini 2.5 Flash with a structured JSON schema (`title`, `description`, `daysOffset`).
4. The response is parsed into `Task[]`, dates are computed from `daysOffset + startDate`, and the tasks are saved to the repository and rendered on the Dashboard.

### Passport OCR

1. Click **Scan Passport** in the New Case or Clients form.
2. The image is preprocessed client-side (`imagePreprocessor.ts` — grayscale + 1.2× contrast) and sent as base64 to `/api/scan-passport-gemini`.
3. Gemini Vision returns the extracted fields.
4. The user reviews and edits before confirming — or switches to manual entry if OCR fails.

### Visa eligibility

1. Open the **Visa Advisor** page (or **Check Eligibility** on a client card).
2. Complete the four-step wizard: personal info → immigration goal → conditional details → supporting factors.
3. The wizard POSTs the collected profile to `/api/check-eligibility`.
4. Gemini returns a JSON report with per-visa verdicts, reasoning, and gaps, plus an overall recommendation and a suggested template keyword.
5. Clicking **Open New Case** on a qualified visa pre-selects the matching template in the Case Manager.

### Partner 820 bundle building

1. Upload documents to a Partner 820 case; tag each with its evidence aspect (Financial, Household, Social, Commitment) or ID / Sponsor / Police & Health slot.
2. The **820 Bundle Builder** groups documents by aspect, merges them with `pdf-lib`, and auto-splits the output to stay under ImmiAccount's per-file size limit.
3. Download bundles with ImmiAccount-friendly filenames, ready to upload.

---

## Strategic Context

See `MVP_PLAN.md` for the product plan and the pitch deck (`EDAMAME BIG DECK.pptx`, if present) for competitive analysis and the phased roadmap:

- **Phase 1 (0–6 mo)** — foundation + VEVO / ImmiAccount integration
- **Phase 2 (6–12 mo)** — AI layer + NZ expansion
- **Phase 3 (12–18 mo)** — scale + template marketplace

**Pricing model (planned):** $65 – $135 per user per month (Essentials / Professional / Enterprise) plus usage-based AI credits.

---

## License

Private project. All rights reserved.
