import { checkoutErrorCodes, toCheckoutError } from "./checkoutError.js";
import { checkoutPhases } from "./checkoutState.js";

const hostedPaymentConfig = {
  stripe: {
    functionName: "verifyStripe",
    fallbackError: "Stripe order failed",
  },
  googlepay: {
    functionName: "verifyGooglePay",
    fallbackError: "Google Pay order failed",
  },
};

const persistOrder = async (gateway, orderData) => {
  const { order, error } = await gateway.createOrder(orderData);
  if (error) {
    return {
      error: toCheckoutError(error, {
        code: checkoutErrorCodes.orderCreationFailed,
        fallbackMessage: "Order could not be created.",
      }),
    };
  }

  return { orderId: order?.id };
};

export const submitCheckout = async ({
  method,
  orderData,
  gateway,
  onPhaseChange = () => {},
}) => {
  if (method === "cod") {
    onPhaseChange(checkoutPhases.creatingOrder);
    const persisted = await persistOrder(gateway, orderData);
    if (persisted.error) return { kind: "error", error: persisted.error };

    await gateway.notifyOrderSubmitted(persisted.orderId);
    return { kind: "completed", orderId: persisted.orderId };
  }

  const hostedConfig = hostedPaymentConfig[method];
  if (hostedConfig) {
    onPhaseChange(checkoutPhases.creatingOrder);
    const persisted = await persistOrder(gateway, orderData);
    if (persisted.error) return { kind: "error", error: persisted.error };

    await gateway.notifyOrderSubmitted(persisted.orderId);
    onPhaseChange(checkoutPhases.initializingPayment);
    const payment = await gateway.startHostedPayment({
      functionName: hostedConfig.functionName,
      orderId: persisted.orderId,
      amount: orderData.amount,
    });

    if (payment?.success && payment.session_url) {
      return { kind: "redirect", url: payment.session_url };
    }

    return {
      kind: "error",
      error: toCheckoutError(payment?.error, {
        code: checkoutErrorCodes.paymentInitializationFailed,
        fallbackMessage: hostedConfig.fallbackError,
      }),
    };
  }

  if (method === "razorpay") {
    onPhaseChange(checkoutPhases.creatingOrder);
    const persisted = await persistOrder(gateway, orderData);
    if (persisted.error) return { kind: "error", error: persisted.error };

    await gateway.notifyOrderSubmitted(persisted.orderId);
    onPhaseChange(checkoutPhases.initializingPayment);
    const payment = await gateway.requestRazorpayOrder(orderData);

    if (payment?.success) {
      return { kind: "razorpay", order: payment.order };
    }

    return {
      kind: "error",
      error: toCheckoutError(payment?.error, {
        code: checkoutErrorCodes.paymentInitializationFailed,
        fallbackMessage: "Razorpay order failed",
      }),
    };
  }

  return { kind: "ignored" };
};
