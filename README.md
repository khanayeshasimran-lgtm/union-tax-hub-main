# Union Tax Hub

A full-stack internal operations platform for tax firms — managing leads, client cases, document pipelines, revenue tracking, and team performance from a single interface.

---

## Overview

Union Tax Hub is built for tax operations teams who need a unified system to handle the full client lifecycle: from initial lead capture through call workflows, client intake, case management, document collection, estimation approval, and revenue tracking.

Every feature is multi-tenant, role-aware, and audit-logged out of the box.

---

## Features

### Lead & Call Management

* Lead assignment with round-robin rotation engine
* Call disposition logging with attempt tracking
* Automated retry scheduling for unanswered leads
* CSV import with preview and validation

### Case Pipeline

* 7-stage Kanban board (New → Converted → Intake Submitted → File Received → Estimation Approved → In Progress → Completed)
* Drag-and-drop stage transitions
* Stage history tracking with timestamps
* Pipeline bottleneck analytics

### Client Intake & Estimations

* Multi-section intake form with SSN masking
* Automatic case stage advancement on intake submission
* Admin estimation approval / rejection workflow with reason logging

### Document Center

* Per-case required document checklists
* File upload with organization-scoped storage paths
* Per-document approval workflow (Uploaded → Under Review → Approved / Rejected)
* Signed URL downloads (60-second expiry)
* Automatic case progression when all documents are approved

### Revenue Tracking

* Revenue entry per case with payment method tracking
* 24-hour lock enforcement via database trigger
* Admin override for locked entries
* Pipeline stage correlation

### Team & Leaderboard

* Revenue, productivity, and conversion leaderboards
* Agent performance KPI cards
* Daily leaderboard refresh via scheduled cron job

### Audit Trail

* Immutable audit logs on all critical tables
* Before/after JSONB snapshots on every change
* Full explorer with filters, date range, and CSV export

### Follow-Ups

* Priority color-coded follow-up queue
* Overdue detection with automated marking
* Status filter tabs and CSV import

---

## Tech Stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite                              |
| UI       | shadcn/ui, Tailwind CSS                                 |
| Backend  | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| State    | TanStack Query                                          |
| Routing  | React Router v6                                         |

---

## Database Architecture

* **17 tables** with full row-level security (RLS)
* **35+ RLS policies** enforcing organization-scoped data isolation
* **17 triggers** for business logic automation
* **15 database functions** (SECURITY DEFINER)
* **13 views** including materialized leaderboard
* **37 indexes** including partial indexes on critical query patterns
* Realtime subscriptions on leads, cases, follow-ups, and revenue

---

## Roles

| Role            | Access                                      |
| --------------- | ------------------------------------------- |
| `super_admin`   | Full system access across all organizations |
| `admin`         | Full access within their organization       |
| `agent`         | Own leads, assigned cases, follow-ups       |
| `tax_processor` | Case processing and document review         |
| `client`        | Client portal (own documents only)          |

New signups default to `agent`. Admins can promote users via the Settings page or directly in the database.

---

## Local Development

**Requirements:** Node.js 18+, npm

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev
```

The application runs at:

```
http://localhost:8080
```

---

## Environment Configuration

This project connects to a Supabase backend.

Configure the following environment variables:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

These values are used in:

```
src/integrations/supabase/client.ts
```

---

## Deployment

The application can be deployed on any modern frontend hosting platform such as:

* Vercel
* Netlify
* Cloudflare Pages
* AWS Amplify

Build the project:

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

---

## Automation

Three scheduled cron jobs are used for system automation:

* **02:00 AM UTC daily** — Rotates overdue leads to least-loaded agents
* **Every hour** — Marks overdue follow-ups
* **Daily** — Refreshes materialized leaderboard view

---

## Project Structure

```
src/
├── components/        # Shared UI components
│   ├── AppLayout.tsx
│   ├── AppSidebar.tsx
│   └── ErrorBoundary.tsx
├── hooks/
│   └── useAuth.ts     # Auth context with role/profile loading
├── integrations/
│   └── supabase/      # Supabase client and type definitions
├── pages/             # One file per route
│   ├── Dashboard.tsx
│   ├── Leads.tsx
│   ├── CallWorkflow.tsx
│   ├── FollowUps.tsx
│   ├── Cases.tsx
│   ├── ClientIntake.tsx
│   ├── Estimations.tsx
│   ├── Documents.tsx
│   ├── Revenue.tsx
│   ├── Leaderboard.tsx
│   ├── AuditTrail.tsx
│   ├── Settings.tsx
│   └── Auth.tsx
└── App.tsx            # Routes and authentication guards
```
