# Roadmap

Planned features, in order. Each item is sized to be one pull request, with tests, that keeps CI green.
When an item ships, tick it and link the PR.

Rules for every item:
- Keep the **frontend demo ledger** (`frontend/src/api/demo`) and the **.NET API** in sync. Same rules, same JSON contract (`frontend/src/lib/types.ts` ↔ `backend/.../Common/Contracts.cs`).
- Money is integer cents end to end.
- Add or update tests on every layer you touch (Vitest/RTL for the frontend, xUnit integration tests for the API).
- Accessible by default: labelled controls, keyboard support, visible focus, text alternatives for charts.

## Backlog

- [ ] **1. Export transactions to CSV.** Add an "Export CSV" button on Transactions that exports the *current filters* (all pages). Backend: `GET /api/transactions/export?…` returns `text/csv` with a correct filename. Escape commas and quotes properly; test it.
- [ ] **2. Dark mode.** System preference plus a toggle in the sidebar, saved in `localStorage`. Charts and badges must keep WCAG AA contrast in both themes.
- [ ] **3. Monthly category budgets.** Let users set a budget per category (e.g. Dining S$400). Show progress bars on Overview, amber at 80% and red at 100%. Backend: `GET/PUT /api/budgets`; the demo ledger mirrors it.
- [ ] **4. Add and manage payees.** "Add payee" form (name, bank, account number with format validation), plus delete with confirmation. New payees get a 12-hour cooling-off period (max S$1,000 per transfer) as a fraud control; enforce it on the server.
- [ ] **5. One-time PIN for large transfers.** Transfers above S$1,000 to third parties require a 6-digit OTP step (demo: the code is shown on screen; backend: a 5-minute single-use code bound to the idempotency key). Lock out after 3 wrong attempts.
- [ ] **6. Scheduled and recurring transfers.** Schedule a transfer for a future date or monthly. List and cancel them. Backend: a hosted service runs due transfers with the same idempotency rules.
- [ ] **7. Pay by mobile number (instant-payment style).** Look up a payee by mobile number (demo directory), show a masked name for confirmation, then pay.
- [ ] **8. Statement PDF.** Download a monthly statement for an account as PDF (opening and closing balance, all lines).
- [ ] **9. Real-time balance updates.** SignalR hub pushes `balanceChanged` after a transfer, so other open tabs update without a refresh. Reconnect with backoff.
- [ ] **10. httpOnly refresh-token cookie.** Replace the sessionStorage token with a short-lived access token plus a rotating refresh token in an httpOnly, Secure, SameSite cookie. Add silent refresh in the API client.
- [ ] **11. EF Core migrations.** Replace `EnsureCreated` with migrations, and add a `dotnet ef` section to the README.
- [ ] **12. Playwright end-to-end tests.** Sign in → transfer → see it on Transactions, running against the demo build in CI.
- [ ] **13. Audit log.** Record sign-ins, transfers and payee changes with timestamp and IP. Add a "Security activity" page.
- [ ] **14. Internationalisation.** English + 简体中文 using `next-intl`, with locale-aware dates and currency.
- [ ] **15. Lazy-load charts.** Load Recharts with `next/dynamic` so the Overview first load drops well below the current 236 kB, and show skeletons while it loads. Measure before and after in the PR.
- [ ] **16. Docker Compose.** `docker compose up` runs the API and frontend together, and the README documents it.

## Done

_Nothing yet: the first scheduled PR will land here._
