# Phase 1.5 — Checkout state machine and error model

## State model

```text
idle
  -> validating
  -> creating_order
  -> initializing_payment
  -> redirecting | awaiting_provider
  -> completed

Any active stage -> failed -> validating (retry)
```

Illegal transitions are ignored. An explicit reset returns the workflow to `idle`.

## Stable error categories

- `authentication_required`
- validation-specific codes such as `empty_cart` and `invalid_subtotal`
- `order_creation_failed`
- `payment_initialization_failed`
- `payment_verification_failed`
- `unexpected_error`

Provider and infrastructure messages are retained for user feedback while the stable code can be used by future structured logging and metrics.

## UI behavior

- Busy states disable order submission.
- COD completes after persistence and notification.
- Hosted payments enter `redirecting` before navigation.
- Razorpay enters `awaiting_provider`; dismissal resets the workflow.
- Failed workflows become retryable.

## Verification

- Storefront: 34/34 tests pass.
- Storefront production build passes.
- Checkout-related lint passes.
- No live payment request was made.
