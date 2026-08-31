# Payment readiness notes

Audit date: 2026-08-31

No live payment was attempted during the refactor-safety-net work. Payment providers and production data were not mutated.

## External configuration — observe, do not force-fix

These cannot be verified from the repository alone and may be expected while the product remains in test mode:

- Whether `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are test-mode or live-mode values.
- Whether the production Stripe account is activated and allowed to accept payments.
- Whether Google Pay is enabled for Stripe Checkout and the production domain is registered/eligible.
- Whether Razorpay is activated and whether `VITE_BACKEND_URL` points to a deployed backend implementing `/api/order/razorpay` and `/api/order/verifyRazorpay`.
- Whether redirect URLs and webhook endpoints are registered in each provider dashboard.

Failures caused by these items should be reported as **payment-provider configuration blockers**, not repaired by weakening validation or bypassing payment checks.

## Code-level findings — independent of provider activation

### P0: displayed/stored total can differ from Stripe Checkout line items

The storefront stores `amount = cart subtotal + delivery fee`, but it does not currently persist `shipping_fee`. `verifyStripe` builds Checkout line items from product/rental items plus `order.shipping_fee`. When that column is zero or null, the line items omit the delivery fee.

The function detects the mismatch and logs that it will use `order.amount` as the source of truth, but the Checkout Session is still created from the mismatching `line_items`. This can cause Stripe to charge less than the stored order total.

This was **marked but not changed** in this safety-net slice. Before enabling real payments, add a server-authoritative pricing contract and a failing test for this mismatch.

### P1: Google Pay route is implemented as Stripe Checkout card payment

`verifyGooglePay` creates a Stripe Checkout Session with `payment_method_types: ["card"]`. It does not directly integrate the Google Pay API. Wallet presentation therefore depends on Stripe account settings, browser/device eligibility, and domain configuration.

### P1: client-provided price snapshots remain authoritative upstream

Orders are created from browser-computed product snapshots and totals. Payment functions read the persisted order, but the order itself was not priced atomically from server-side catalog data. Test mode does not cause this risk; it is an application trust-boundary issue.

## Readiness gate before live payment activation

- [ ] Server recalculates price, delivery, rental fee, tax, and deposit from authoritative data.
- [ ] Order creation and inventory/rental reservation occur in one transaction.
- [ ] Stripe Checkout amount exactly equals the stored payable amount.
- [ ] Payment initialization is idempotent per order.
- [ ] Webhook replay tests prove idempotent state transitions.
- [ ] Test-mode success, cancel, decline, timeout, and duplicate-submit scenarios pass.
- [ ] Provider account activation, production keys, domains, redirects, and webhooks are verified separately.
