<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Edamame Legal Flow

**AI-powered case and task management for immigration lawyers and study abroad agencies**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)
[![Gemini](https://img.shields.io/badge/Gemini-AI-4285F4?logo=google)](https://ai.google.dev)
[![CI](https://github.com/wandering-pork/edemame/actions/workflows/ci.yml/badge.svg)](https://github.com/wandering-pork/edemame/actions/workflows/ci.yml)

</div>

---

## Overview

Edamame Legal Flow is a web application that helps immigration practitioners stay on top of their caseload. It combines traditional case and client management with **AI-generated task scheduling** — paste in a case description and workflow guide, and Gemini automatically produces a chronologically ordered task list with suggested dates.

Originally built with [Google AI Studio](https://ai.studio/apps/1c0e5b8b-4436-4c66-8cf8-e735e0184e98).

---

## Features

- **Authentication** — Email/password registration and login (Supabase Auth) gates the whole app
- **Dashboard** — Visual task calendar; mark tasks complete, reorder by priority, browse by date
- **Case Management** — Create and track immigration cases linked to clients and workflow templates
- **AI Task Generation** — Google Gemini produces a structured task schedule from a case description and workflow guide
- **Passport Scanner (OCR)** — Upload passport images and auto-extract personal details using Gemini Vision API; includes manual entry fallback
- **Visa Eligibility Advisor** — 4-step wizard collects client profile and assesses eligibility across 9 Australian visa types; suggests recommended pathway and can pre-select template for new cases
- **Client Management** — Store and manage client personal information; quick visa eligibility check from client card
- **Workflow Templates** — Predefined procedures for common visa types, fully editable
- **Dark / Light Mode** — Theme preference persisted in `localStorage`

### Included Workflow Templates

| Template | Visa Type |
|----------|-----------|
| Student Visa 500 | Australian student visa |
| Skilled Nominated 190 | State-nominated skilled migration |
| Partner Visa 820/801 | Onshore partner visa |
| Visitor Visa 600 | Temporary visitor |
| Temporary Graduate 485 | Post-study work stream |

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| UI Framework | React 19 |
| Language | TypeScript 5.8 |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS (CDN) |
| AI | Google Gemini (`@google/genai`) |
| Auth | Supabase Auth (`@supabase/supabase-js`) |
| Routing | React Router v7 |
| Local Storage | Dexie.js (IndexedDB) + OPFS |
| Icons | Lucide React |
| Date Utilities | date-fns |
| ID Generation | uuid |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18 or later recommended)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A [Supabase project](https://supabase.com/dashboard) (free tier is fine) — required for login/registration, since auth gates the whole app

### Installation

1. **Clone the repo and install dependencies:**
   ```bash
   git clone <repo-url>
   cd src
   npm install
   ```

2. **Configure your API keys:**

   Open `.env.local` and set:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here

   # From your Supabase project's Settings → API page
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

   Without the Supabase values, the app still loads but registration/login will fail with a network error — nothing past `/login` is reachable.

3. **Start the development server:**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`. Register an account, then log in to reach the dashboard.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |

---

## Project Structure

```
edemame/
├── api/                     # Vercel serverless functions
│   ├── generate-tasks.ts    # Task generation from case descriptions
│   ├── scan-passport-gemini.ts  # Passport OCR using Gemini Vision
│   └── check-eligibility.ts # Visa eligibility assessment
├── src/
│   ├── App.tsx              # Root component — all app state, routing, AuthProvider
│   ├── index.tsx            # React DOM entry point
│   ├── index.html           # HTML shell with Tailwind CDN config
│   ├── types.ts             # All TypeScript type definitions
│   ├── vite.config.ts       # Vite config (API key injection, path aliases)
│   ├── vite-env.d.ts        # Vite client type reference (import.meta.env typing)
│   ├── components/
│   │   ├── Sidebar.tsx      # Navigation sidebar
│   │   ├── ProtectedRoute.tsx  # Redirects to /login when unauthenticated
│   │   ├── PassportScanner.tsx  # Passport upload & OCR modal
│   │   ├── Logo.tsx         # Logo variants and brand components
│   │   └── ...
│   ├── contexts/
│   │   ├── AuthContext.tsx     # useAuth() — Supabase session state, sign up/in/out
│   │   ├── RepositoryContext.tsx  # Storage-mode repository provider
│   │   └── SidebarContext.tsx
│   ├── repositories/        # Storage abstraction (local = Dexie, cloud = Supabase stub)
│   ├── lib/
│   │   ├── supabaseClient.ts   # Supabase client singleton
│   │   ├── dexieDb.ts          # IndexedDB schema (local storage mode)
│   │   └── opfsStorage.ts      # Local file storage (local storage mode)
│   ├── pages/
│   │   ├── Login.tsx        # Email/password login
│   │   ├── Register.tsx     # Registration + email confirmation state
│   │   ├── Dashboard.tsx    # Task calendar (main view)
│   │   ├── CaseManager.tsx  # Case list + new case form
│   │   ├── CaseDetails.tsx  # Per-case view + AI task generation
│   │   ├── NewCase.tsx      # Case intake form
│   │   ├── Clients.tsx      # Client management
│   │   ├── VisaAdvisor.tsx  # 4-step visa eligibility wizard
│   │   ├── Templates.tsx    # Workflow template editor
│   │   └── Settings.tsx     # User preferences + sign-out
│   └── services/
│       ├── geminiService.ts # AI task generation
│       └── ocrService.ts    # Passport OCR via Gemini Vision
```

---

## Authentication

Login/registration (Supabase Auth, email/password) gates the entire app — there's no anonymous access, even in local storage mode.

1. Visit `/register` to create an account (name, email, password). If your Supabase project requires email confirmation (default), you'll see a "check your email" screen before you can log in.
2. Visit `/login` to sign in. "Forgot password?" sends a reset email via Supabase.
3. Once authenticated, you're routed into the app and asked (once) to choose **Local** or **Cloud** storage at `/onboarding` — this is a separate choice from your account and controls where your case/client/task data lives, not who can log in. Cloud storage mode is not fully implemented yet (falls back to local/IndexedDB).
4. Sign out from **Settings → Account** (the sidebar's "Sign Out" link is unwired leftover UI — it doesn't do anything).

**Production:** the deployed app at `edemame.vercel.app` uses its own Supabase project (`edamame-legal-flow`), configured with that domain as its Auth Site URL and redirect URL allow-list. The Vercel project's `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` env vars point at the same project as local dev.

---

## How AI Task Generation Works

1. Open a case in **Case Details**
2. The case's linked workflow template provides a structured guide
3. Click **Generate Tasks** — this calls `geminiService.ts` which sends the case description + workflow guide to Gemini
4. Gemini returns a structured JSON array of tasks with suggested date offsets
5. Tasks are added to the case and appear on the Dashboard calendar

---

## Passport Scanner (OCR)

The passport scanner streamlines client intake by automatically extracting passport data:

1. Click **Scan Passport** in the NewCase form or Clients page
2. Upload a photo of a passport biodata page (JPG/PNG)
3. Image is sent to `/api/scan-passport-gemini` which uses **Gemini Vision API** to extract:
   - First name, last name, date of birth, nationality
   - Passport number, expiry date, gender
4. Extracted fields appear in an editable form for verification
5. If OCR fails, fall back to **Continue with Manual Entry** to fill fields manually

---

## Visa Eligibility Advisor

Assess visa eligibility across 9 Australian visa types:

1. Click **Visa Advisor** in the sidebar (or **Check Eligibility** on any client card)
2. Complete a 4-step wizard:
   - **Step 1:** Personal information (name, DOB, nationality, current AU location)
   - **Step 2:** Immigration goal (Work / Study / Family / PR / Visit) + intended duration
   - **Step 3:** Conditional details based on goal (occupation, education, relationship, etc.)
   - **Step 4:** Supporting factors (English proficiency, health, criminal history)
3. Click **Submit** → Gemini assesses eligibility for all visa types
4. View verdict cards for each visa (Qualifies / Possibly / Unlikely / Needs More Info)
   - Each card shows key reasons and gaps to address
5. Click **Open New Case** on any qualified visa → creates case with that visa template pre-selected

**Assessed Visa Types:** Skilled Independent (189), Skilled Nominated (190), Temporary Skill Shortage (482), Employer Nominated Scheme (186), Student (500), Partner (820), Temporary Graduate (485), Visitor (600), Working Holiday (417)

---

## License

Private project. All rights reserved.
