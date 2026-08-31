# Phase 1 — Current-state audit and engineering baseline

Audit date: 2026-08-31

## Objective

Establish a behavior and engineering baseline before the architecture refactor. This audit is intentionally read-only with respect to application behavior and production data.

## Scope and system map

The repository currently contains three deployable areas:

- `frontend/`: React 18 + Vite customer storefront.
- `admin/`: React 18 + Vite seller/admin application.
- `supabase/`: PostgreSQL migrations and Deno Edge Functions for payments, shipping, email, reorder, order status, deposit holds, and AI chat.

The principal business domains visible in the code are identity, seller profiles, products, rentals, cart, checkout, orders, payments, shipping, reviews, wanted-item requests, notifications, and banners.

The current architecture is a client-heavy Supabase application. Both React applications query public tables directly. Checkout assembles item snapshots and totals in the browser, inserts an order directly, and then invokes payment/email functions. Cart contents and order items are stored as JSON-shaped documents.

## Reproducible local baseline

| Check | Result | Notes |
| --- | --- | --- |
| Frontend production build | Pass | Main JS bundle is 874.01 kB minified / 259.02 kB gzip; Vite reports a chunk-size warning. |
| Admin production build | Pass | Main JS bundle is 408.43 kB minified / 122.38 kB gzip. |
| Frontend lint | Fail | 90 findings: 79 errors and 11 warnings. One finding is a conditional React Hook call. |
| Admin lint | Fail | 244 findings: 236 errors and 8 warnings. Configuration, Jest globals, prop validation, and application findings are mixed together. |
| Admin tests | Fail | 6 suites: 1 passed, 5 failed. 12 tests: 4 passed, 8 failed. Main causes are Jest/Vite `import.meta` incompatibility and stale Sidebar expectations. |
| Frontend tests | Not available | No test script or test suite is configured. |
| Type checking | Not available | Application code is JavaScript and no independent type-check script exists. |
| Database tests/lint | Not available | No local database test suite, seed-based integration tests, or schema assertions are present. |

Commands used:

```sh
cd frontend && npm run lint
cd frontend && npm run build
cd admin && npm run lint
cd admin && npm test -- --runInBand
cd admin && npm run build
```

## Risk register

### P0 — Must be controlled before database migration

1. **The repository is not a reproducible source of the complete database schema.** Migrations alter `orders` and enable RLS on many tables, but there are no versioned creation migrations for core tables such as `orders`, `products`, `carts`, `profiles`, and `users`. A clean environment cannot be reconstructed or tested confidently from Git alone.

2. **Order authority is split between the browser and privileged functions.** The browser builds item snapshots, computes the total, chooses status/payment fields, and inserts directly into `orders`. Server functions later trust persisted order data. This prevents one atomic boundary for price validation, stock/rental availability, order creation, and payment initialization.

3. **No atomic inventory reservation is visible in checkout.** There is no checked-in transaction/RPC that reserves stock or rental dates while creating an order. Concurrent buyers can race, leading to overselling or overlapping rental commitments.

4. **Authorization is incomplete for privileged operations.** The banner policy permits every authenticated user to manage banners. Seller order updates are authorized by seller IDs embedded inside JSON order items, and the policy does not restrict which order columns a seller may change.

### P1 — High-impact scale and maintainability constraints

1. **Hot data is stored and queried as JSON.** Carts are updated as an entire document and seller order visibility scans `jsonb_array_elements(items)`. This creates write contention, weak referential integrity, and poor indexability as traffic/data volume grows.

2. **Unbounded reads are common.** Product and order screens use broad `select("*")` reads without cursor pagination. Storefront startup loads the full product set into a global context.

3. **Large components combine UI, state, persistence, and workflows.** Notable files include `admin/src/pages/Orders.jsx` (779 lines), `frontend/src/pages/PlaceOrder.jsx` (466), and `frontend/src/context/ShopContext.jsx` (393). This raises regression risk during behavior-preserving refactoring.

4. **Quality gates are red or absent.** Builds passing does not establish behavioral equivalence. The frontend has no automated tests; the admin suite is mostly blocked; lint is not currently enforceable.

5. **No checked-in operational baseline exists.** There are no SLOs, load-test scenarios, request/error/latency dashboards, database query baselines, or recovery objectives in the repository.

### P2 — Efficiency and operational improvements

1. The storefront ships a large initial bundle and many multi-hundred-kilobyte or multi-megabyte raster assets.
2. Supabase client versions differ between frontend (`2.57.x`) and admin (`2.76.x`).
3. CORS is broadly configured as `*` across Edge Functions.
4. Root project metadata and documentation are minimal, and there is no root workspace orchestration for lint/test/build.

## Existing strengths to preserve

- RLS is enabled or being enabled for the principal public tables.
- Payment functions authenticate callers, and the Stripe webhook verifies its signature.
- Email delivery includes persisted idempotency keys.
- Several migrations use `IF NOT EXISTS` and guard missing tables, reducing repeat-run failure risk.
- Both applications currently produce deployable production builds.

## Critical behavior contracts to freeze

Before moving code, establish characterization tests for:

1. Email/password and OAuth login, public-user synchronization, and logout.
2. Product browsing, seller-scoped product management, and rental listings.
3. Cart add/update behavior for regular, customized, and rented items.
4. Checkout for COD, Stripe, Google Pay, and Razorpay, including failure/retry behavior.
5. Buyer order visibility, seller order visibility/status changes, reorder, and shipping labels.
6. Rental price/deposit calculation, hold creation/extension, and payment webhook transitions.
7. Email idempotency for registration, order submission, and later order events.
8. RLS denial tests for cross-user cart/order/profile/product access.

## Proposed measurable baseline and initial targets

Production measurements are not derivable from this local repository, so the current values must be collected from Supabase and the hosting platform before setting a final capacity promise. Start with these definitions:

| Signal | Baseline to capture | Initial engineering target |
| --- | --- | --- |
| Storefront availability | 7-day and 30-day success rate | >= 99.9% excluding planned maintenance |
| Read API latency | P50/P95/P99 by endpoint/query | P95 <= 300 ms for cached/catalog reads |
| Checkout latency | P50/P95/P99 excluding external redirect | P95 <= 1 s for order creation |
| Error rate | 4xx/5xx and function failures | Server-side 5xx < 0.1% |
| Database load | CPU, connections, IOPS, cache hit ratio | Peak operation below 70% sustained resource use |
| Capacity | peak RPS and concurrent checkout attempts | Pass 2x observed peak for 30 minutes |
| Correctness | duplicate orders, oversells, overlapping rentals | Zero accepted invariant violations |
| Recovery | deployment rollback and DB restore duration | Define RTO <= 30 min and RPO <= 5 min, then verify |

These are provisional targets, not claims about current production performance.

## Exit criteria for the audit/baseline stage

- [x] Repository structure and deployable units mapped.
- [x] Critical business workflows identified from code.
- [x] Local build, lint, and available-test results recorded.
- [x] Architecture and schema risks prioritized.
- [ ] Export the authoritative production schema into ordered, reviewable migrations.
- [ ] Capture production traffic, latency, error, and database query metrics.
- [ ] Agree on peak RPS/concurrency, SLO, RTO, and RPO targets.
- [ ] Add characterization tests for the checkout/payment and authorization paths.
- [ ] Make lint/test/build reproducible as a root-level CI quality gate.

## Recommended next implementation slice

Do not begin by moving directories. First create the safety harness:

1. Repair the admin test environment and add a frontend test runner.
2. Add characterization tests around cart-to-order payload generation and order authorization.
3. Capture the complete remote schema and normalize it into a reproducible baseline migration.
4. Add database tests for RLS and the core order invariants.
5. Only then extract domain modules while keeping existing routes and payloads stable.

This ordering makes the architecture refactor behavior-preserving and gives the later ID backfill/schema migration a verifiable rollback boundary.
