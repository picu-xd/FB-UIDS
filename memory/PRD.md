# FB Checker — Mobile App PRD

## Overview
A React Native (Expo) mobile app that recreates the **FB Checker control room** experience from `https://account-verifier-fb.emergentagent.host` as a fully native, JWT-authenticated, MongoDB-backed tool. Users paste messy text containing `UID:Pass` / `Email:Pass` records, the **Smart Parser** auto-extracts and de-duplicates them, the user can then save them to their personal database, run **mock validation** on selected/all accounts, and review live stats from a Command Center dashboard.

## ⚠️ Safety / Compliance
- **No real authentication** is ever attempted against Facebook or any third-party service.
- The "check" flow is a **MOCK heuristic** running locally (longer & more complex passwords are rated more likely to be valid).
- The Settings screen surfaces an explicit disclaimer.
- App is intended as a **personal data-cleanup / parser utility** + portfolio demo of the original web tool.

## Tech
- Backend: FastAPI + Motor (Async MongoDB)
- Frontend: Expo SDK 54 + Expo Router (file-based)
- Auth: JWT (Bearer token, AsyncStorage-persisted)
- Storage: MongoDB (`fb_checker_db`)
- Theme: Dark "control room / terminal" archetype, monospaced typography, neon green accents

## Screens
| Path | Purpose |
|---|---|
| `/` | Splash → redirect to `/login` or `/(tabs)/parser` |
| `/login` | Email/password login, pre-filled with admin demo |
| `/register` | Create new operator |
| `/(tabs)/parser` | Smart Parser: paste, parse, dedupe, save |
| `/(tabs)/accounts` | Target Database: list, filter, mock-check, delete |
| `/(tabs)/stats` | Command Center: total, valid/invalid widgets, ratio bar, activity log |
| `/(tabs)/settings` | User info, disclaimer, logout |

## Backend Endpoints
- `POST /api/auth/register|login|logout` — JWT auth
- `GET  /api/auth/me`
- `POST /api/accounts/parse` — extract pairs from messy text
- `POST /api/accounts/bulk` — save de-duplicated parsed accounts (per user)
- `GET  /api/accounts?status=...` — list user accounts
- `DELETE /api/accounts/{id}` — delete one
- `POST /api/accounts/bulk-delete` — bulk delete
- `POST /api/accounts/check` — MOCK validate accounts
- `GET  /api/stats` — dashboard metrics + recent activity

## Data Model (MongoDB)
- `users { email, password_hash, name, role, created_at }` — unique index on email
- `accounts { user_id, identifier, password, type, status, note, created_at, checked_at }` — index on (user_id, created_at)
- `login_attempts { identifier, count, locked_until }` — brute-force protection
- `activity_log { user_id, type, account_id, result, ts }`

## Key UX Details
- Pre-filled login (admin@fbchecker.com / admin123) for instant demo
- Sticky **Save N Accounts** CTA appears after parsing
- Mock check sheet has 0–2000 ms inter-batch delay slider + live progress bar
- Status filter chips: ALL / PENDING / VALID / INVALID
- Eye-toggle on Accounts screen reveals or masks passwords
- Pull-to-refresh on Accounts and Stats
- Brute-force lockout after 5 failed login attempts (15 min)

## Smart Business Enhancement
**Cloud-synced data** (MongoDB) means a single user can run the parser from multiple devices and resume work — vs the original web demo which was purely local/in-memory. Combined with the JWT login, this turns a one-shot parser tool into a **personal data hub** ready for premium tiers (e.g., increased account quotas, scheduled cleanup, export to CSV).

## Future Action Items (post v1)
- Export accounts as CSV / JSON
- Tagging / notes per account
- Scheduled re-checks
- Optional email/Google social login
- Public sharing of stats dashboards
