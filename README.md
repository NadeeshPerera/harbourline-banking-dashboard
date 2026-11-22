# 🏦 Harbourline Bank: Retail Banking Dashboard

A full-stack **online banking dashboard**: accounts, statements, spending analytics and money transfers with real banking rules.
**Next.js + TypeScript** frontend, **ASP.NET Core 8 Web API** backend.

![CI](https://github.com/NadeeshPerera/harbourline-banking-dashboard/actions/workflows/ci.yml/badge.svg)
![Next.js](https://img.shields.io/badge/Next.js_15-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?logo=reactquery&logoColor=white)
![.NET 8](https://img.shields.io/badge/.NET_8-512BD4?logo=dotnet&logoColor=white)
![EF Core](https://img.shields.io/badge/EF_Core-512BD4)

**▶ Live demo:** _coming soon_

<!-- screenshot: docs/screenshot.png -->

> **Harbourline Bank is fictional.** The hosted demo runs a browser-side ledger with the same rules as the API, so it works without a server. Run the API locally to use the real backend.
> Demo sign-in: `alex.tan@demo.harbourline.sg` / `Demo@1234`

---

## Features

| | |
|---|---|
| 💳 **Accounts overview** | Total balance, account cards with masked numbers, a 6-month cash-flow chart, spending by category with the change from last month, recent activity. |
| 📄 **Transactions** | Search, account, category and date-range filters, **stored in the URL** so views can be shared and the back button works. Server-side pagination with running balances. |
| 💸 **Transfers** | Form → review → receipt. Pay your own accounts or saved payees. |
| 🛡️ **Banking rules** (enforced on the server) | Balance checks; a **S$5,000 per day** limit to third parties (Singapore calendar day); **idempotency keys**, so retries and double-clicks never pay twice; a reused key with a different body returns `409`; optimistic concurrency, so simultaneous transfers can't overspend. |
| 📊 **Analytics** | Income and expenses per month. Transfers between your own accounts are excluded, as a real bank would. |
| 🔐 **Auth** | JWT bearer tokens, hashed passwords (ASP.NET Identity `PasswordHasher`), the same error for unknown email or wrong password, per-customer data isolation (tested). |
| ♿ **Accessibility** | Labelled form fields with linked error messages, `aria-current` navigation, live regions, and screen-reader tables behind the charts. |

## Architecture

```
frontend/  Next.js 15 (App Router) · TypeScript · Tailwind · TanStack Query · React Hook Form + Zod · Recharts
   └─ BankApi interface
        ├─ HttpBankApi  ──HTTP/JSON──▶  backend/  ASP.NET Core 8 minimal APIs · EF Core (SQLite) · JWT
        └─ DemoBankApi  (in-browser ledger with the same rules, for the hosted demo)
```

**Design decisions**

- **Money is integer cents everywhere.** No floating point from the input box (`"1,234.5"` → `123450`) to the database. Tested, including the `0.29 × 100` case.
- **One API contract.** `frontend/src/lib/types.ts` and `backend/src/Harbourline.Api/Common/Contracts.cs` describe the same JSON shapes: camelCase, enums as strings, errors as RFC 7807 `problem+json`.
- **Idempotent transfers.** The client creates one `Idempotency-Key` per reviewed transfer. The server stores `(user, key)` behind a **unique index** together with a hash of the request, so a retry returns the original receipt.
- **Singapore time.** "Today", date filters and monthly buckets use UTC+8 (no DST), with a fixed offset, so results are the same on Windows and Linux.
- **Testable time.** The API takes a .NET 8 `TimeProvider`. Tests use `FakeTimeProvider` to move past midnight (the daily limit resets) and past token expiry (`401`).
- **Server state belongs to TanStack Query**, not a global store. A transfer invalidates accounts, transactions and analytics, so everything refreshes together.

## Getting started

**Frontend only (demo mode):**
```bash
cd frontend
npm install
npm run dev            # http://localhost:3000
```

**Full stack:**
```bash
# 1. API: http://localhost:5080 (Swagger at /swagger)
cd backend/src/Harbourline.Api
dotnet run --launch-profile http

# 2. Frontend, pointed at the API
cd frontend
echo NEXT_PUBLIC_API_URL=http://localhost:5080 > .env.local
npm run dev -- -p 3001  # http://localhost:3001
```
The API creates and seeds a local SQLite database on first run. Development uses a non-secret JWT key from `appsettings.Development.json`. In any other environment, set `Jwt__Key` (32+ bytes) through an environment variable or user-secrets.

## Tests

| Layer | Tooling | What's covered |
|---|---|---|
| Frontend | Vitest + React Testing Library | Money parsing and formatting, every ledger rule, the transfer flow end to end (validation, double-click safety, server errors) |
| Backend | xUnit + `WebApplicationFactory` + in-memory SQLite | Auth, data isolation between customers, filters and pagination, idempotency, `409` on key reuse, insufficient funds, daily-limit reset at SG midnight, token expiry, analytics |

```bash
cd frontend && npm test
cd backend && dotnet test
```

CI (GitHub Actions) runs lint, type-check, tests and build for the frontend, and a warnings-as-errors build plus tests for the API, on every push and pull request.

## Roadmap

See **[ROADMAP.md](ROADMAP.md)**: CSV export, budgets, OTP for large transfers, scheduled payments, SignalR live balances, refresh-token cookies, Playwright and more.

## Author

**Nadeesh Perera**, Frontend-focused Software Engineer (React · TypeScript · Next.js · .NET)
[LinkedIn](https://www.linkedin.com/in/nadeesh-perera-984461214) · [GitHub](https://github.com/NadeeshPerera)
