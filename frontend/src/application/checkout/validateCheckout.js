const supportedPaymentMethods = new Set([
  "cod",
  "stripe",
  "googlepay",
  "razorpay",
]);

const invalid = (code, message) => ({ valid: false, code, message });

export const validateCheckout = ({
  items,
  subtotal,
  deliveryFee,
  paymentMethod,
}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return invalid("empty_cart", "Your cart has no valid items.");
  }

  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return invalid("invalid_subtotal", "Order subtotal is invalid.");
  }

  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
    return invalid("invalid_delivery_fee", "Delivery fee is invalid.");
  }

  if (!Number.isFinite(subtotal + deliveryFee)) {
    return invalid("invalid_total", "Order total is invalid.");
  }

  if (!supportedPaymentMethods.has(paymentMethod)) {
    return invalid("unsupported_payment", "Unsupported payment method.");
  }

  return { valid: true };
};
