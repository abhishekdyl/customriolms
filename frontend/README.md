# Riosmart LMS — Admin Frontend

Next.js 15 / TypeScript / Tailwind v4 / shadcn/ui-style components / TanStack Query / Framer Motion.

## Setup
```bash
cd frontend
npm install
cp .env.example .env.local   # point NEXT_PUBLIC_API_URL at your running backend
npm run dev
```

## What's actually wired to the backend

| Page | Status |
|---|---|
| `/login`, `/register` | Real — calls `/api/v1/auth/*`, stores JWT in localStorage |
| `/accept-invite` | Real — calls `/api/v1/users/accept-invite` |
| `/teams` | Real — full CRUD against `/api/v1/teams` |
| `/users` | Real — invite, role change, remove against `/api/v1/users` |
| `/categories` | Real — full CRUD against `/api/v1/categories` |
| `/forgot-password` | Placeholder — no backend endpoint exists |
| `/dashboard`, `/courses`, `/recognition`, `/notifications`, `/settings` | Placeholder — each names exactly what backend piece is missing |

This list will go stale as the backend grows — treat it as a snapshot, not a promise. Check `backend/app/api/v1/router.py` for the current source of truth on which routers are actually wired in.

## Design source
Every page here is a direct port of the corresponding screen in the `lms_screens.jsx` mockup (fonts, colors, copy, layout) — that file remains the design reference for anything not yet built here. Auth token routing, error states, and the org-detection/OTP login flow in the mockup are the two biggest things simplified for this first pass: plain email+password login only, no OTP path yet (no `login_method` field on the real Org model).

## Component library
`components/ui/*` are hand-written to match shadcn/ui's standard output (same API, same file shape) rather than pulled via the CLI, since this was built outside a normal npm environment. Running `npx shadcn@latest add <component>` for anything new should slot in cleanly alongside them.
