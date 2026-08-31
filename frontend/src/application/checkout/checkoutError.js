export const checkoutErrorCodes = Object.freeze({
  authenticationRequired: "authentication_required",
  validationFailed: "validation_failed",
  orderCreationFailed: "order_creation_failed",
  paymentInitializationFailed: "payment_initialization_failed",
  paymentVerificationFailed: "payment_verification_failed",
  unexpected: "unexpected_error",
});

export const toCheckoutError = (
  error,
  { code = checkoutErrorCodes.unexpected, fallbackMessage = "Checkout failed." } = {}
) => ({
  code,
  message:
    (typeof error === "string" && error) ||
    error?.message ||
    fallbackMessage,
});
