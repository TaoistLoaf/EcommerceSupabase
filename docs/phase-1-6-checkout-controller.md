# Phase 1.6 — Checkout presentation controller

## Goal

Remove checkout orchestration from `PlaceOrder` so the page owns only form and payment-method UI concerns.

## Final frontend layers

```text
PlaceOrder.jsx                         presentation page
  -> useCheckoutController.js         presentation controller
      -> submitCheckout.js            application workflow
      -> checkoutState.js             application state model
      -> validateCheckout.js          application validation
      -> domain/orders/*              pure domain transformations
      -> checkoutGateway.js           infrastructure access
      -> createRazorpayOptions.js      provider browser adapter
```

The controller owns validation, state transitions, single-flight protection, outcome handling, redirects, cart clearing, notifications, and Razorpay verification. All external capabilities are passed in as dependencies.

## Verification

- Storefront: 35/35 tests pass.
- Storefront production build passes.
- Checkout-related lint passes.
- Razorpay options are tested without loading the provider SDK.
- No live payment request was made.

## Architecture phase exit

The checkout UI now has stable domain, application, presentation, and infrastructure boundaries. The next material step should be database-contract discovery and a server-authoritative order command rather than further directory movement.
