# Phase 1.4 — Checkout validation and single-flight submission

## Goal

Reject invalid checkout requests before they write orders and prevent duplicate submissions from the same mounted checkout page.

## Validation rules

- At least one valid order item must exist.
- Subtotal must be finite and greater than zero.
- Delivery fee must be finite and non-negative.
- The combined total must remain finite.
- Payment method must be one of COD, Stripe, Google Pay, or Razorpay.

Validation is implemented as a pure application-layer function so the same cases can later be reused by a server-side order command. Client validation improves feedback but is not a security boundary.

## Duplicate-submit protection

The page uses a single-flight guard in addition to the disabled submit button. The guard acquires a synchronous in-memory lock before the asynchronous order workflow starts and always releases it in `finally`, including failure cases.

This prevents two rapid clicks in one page instance from creating two concurrent requests. It does not protect against retries from another tab, device, process, or network client.

## Required server follow-up

True idempotency requires a client-generated idempotency key backed by a database uniqueness constraint and an atomic server-side order command/RPC. No key is currently persisted because the checked-in schema does not yet define a safe target column.

## Verification

- Storefront: 28/28 tests pass.
- Admin: 20/20 tests pass.
- Storefront production build passes.
- Checkout-related lint passes.
- No live payment request was made.
