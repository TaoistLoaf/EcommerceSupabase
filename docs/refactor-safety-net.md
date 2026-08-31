# Refactor safety net

## What this first slice protects

- Admin authentication boundaries and current Supabase email login behavior.
- Seller-scoped admin navigation.
- Product list reads, deletion, and order-management behavior already covered by Jest.
- Storefront conversion from cart data to the existing order-item payload, including regular items, customization, and rentals.
- Cart subtotal behavior, rental quote behavior, and the persisted order payload contract.

## Why the order-item logic is a pure function

`buildOrderItems` depends only on its inputs and returns a value. It does not render UI or call Supabase. That makes it a stable characterization seam: during the future schema migration, the old and new implementations can receive the same fixtures and their outputs can be compared directly.

Characterization tests answer “what does the system do today?” They are especially useful before refactoring legacy code. They are not a claim that the current design is ideal.

## Run the safety net

```sh
cd admin
npm test -- --runInBand
npm run build

cd ../frontend
npm test
npm run build
```

## Testing layers to add next

1. Pure unit tests for cart totals, rental/deposit calculations, and order state transitions.
2. Component tests for storefront cart and checkout validation.
3. Edge Function tests for authentication, amount validation, idempotency, and webhook replay.
4. Local Supabase integration tests for RLS and concurrent inventory/rental reservation.
5. End-to-end smoke tests for login, checkout, payment redirect, and seller fulfillment.

Payment readiness and test/live-environment limitations are tracked separately in `docs/payment-readiness-notes.md`; provider activation failures must not be hidden by application test workarounds.

The practical rule is to keep most tests at the pure-function and database-contract layers, with a smaller number of browser end-to-end tests for critical journeys.
