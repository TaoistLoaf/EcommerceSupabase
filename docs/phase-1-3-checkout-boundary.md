# Phase 1.3 — Checkout application boundary

## Goal

Separate checkout orchestration from React UI and infrastructure details without changing the persisted order or payment request contracts.

## Resulting structure

```text
PlaceOrder.jsx
  -> application/checkout/submitCheckout.js
      -> infrastructure/checkout/checkoutGateway.js
          -> Supabase, Edge Functions, Axios, fetch
```

- The page owns form state, navigation, toasts, redirects, and the Razorpay browser widget.
- The application layer owns the COD/Stripe/Google Pay/Razorpay workflow order and returns explicit outcomes.
- The gateway owns Supabase query chains and HTTP request formats.
- Domain modules continue to own pure cart, rental, and order-payload calculations.

## Preserved contracts

- Orders are still inserted into `orders` and return `id`.
- Order emails still invoke `sendOrderEmails` with `order_submitted`.
- Stripe still calls `verifyStripe` with `{ orderId, amount }` and a Bearer token.
- Google Pay still calls `verifyGooglePay` with `{ orderId, amount }` and a Bearer token.
- Razorpay still uses `/api/order/razorpay` and `/api/order/verifyRazorpay`.
- No real provider request is made by the test suite.

## Verification

- Storefront: 21/21 tests pass.
- Admin: 20/20 tests pass.
- Storefront production build passes.
- Checkout/domain/application/infrastructure lint passes.

## Next boundary

Phase 1.4 should add explicit checkout validation and submission-state/idempotency guards. Because those change invalid-input behavior, they should be reviewed separately from this behavior-preserving extraction.
