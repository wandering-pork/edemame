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

- **Dashboard** — Visual task calendar; mark tasks complete, reorder by priority, browse by date
- **Case Management** — Create and track immigration cases linked to clients and workflow templates
- **AI Task Generation** — Google Gemini produces a structured task schedule from a case description and workflow guide
- **Client Management** — Store and manage client personal information
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
| Icons | Lucide React |
| Date Utilities | date-fns |
| ID Generation | uuid |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18 or later recommended)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)

### Installation

1. **Clone the repo and install dependencies:**
   ```bash
   git clone <repo-url>
   cd src
   npm install
   ```

2. **Configure your API key:**

   Open `.env.local` and set your Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`.

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
src/
├── App.tsx                  # Root component — all app state and navigation
├── index.tsx                # React DOM entry point
├── index.html               # HTML shell with Tailwind CDN config
├── types.ts                 # All TypeScript type definitions
├── vite.config.ts           # Vite config (API key injection, path aliases)
├── components/
│   ├── Sidebar.tsx          # Navigation sidebar
│   ├── Logo.tsx             # Logo variants and brand components
│   └── ...
├── pages/
│   ├── Dashboard.tsx        # Task calendar (main view)
│   ├── CaseManager.tsx      # Case list
│   ├── CaseDetails.tsx      # Per-case view + AI task generation
│   ├── NewCase.tsx          # Case intake form
│   ├── Clients.tsx          # Client management
│   ├── Templates.tsx        # Workflow template editor
│   └── Settings.tsx         # User preferences
└── services/
    └── geminiService.ts     # Gemini AI integration
```

---

## How AI Task Generation Works

1. Open a case in **Case Details**
2. The case's linked workflow template provides a structured guide
3. Click **Generate Tasks** — this calls `geminiService.ts` which sends the case description + workflow guide to Gemini
4. Gemini returns a structured JSON array of tasks with suggested date offsets
5. Tasks are added to the case and appear on the Dashboard calendar

---

## License

Private project. All rights reserved.
