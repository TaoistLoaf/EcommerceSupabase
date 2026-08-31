export const checkoutPhases = Object.freeze({
  idle: "idle",
  validating: "validating",
  creatingOrder: "creating_order",
  initializingPayment: "initializing_payment",
  awaitingProvider: "awaiting_provider",
  redirecting: "redirecting",
  completed: "completed",
  failed: "failed",
});

export const initialCheckoutState = Object.freeze({
  phase: checkoutPhases.idle,
  error: null,
});

const allowedTransitions = {
  [checkoutPhases.idle]: [checkoutPhases.validating],
  [checkoutPhases.validating]: [checkoutPhases.creatingOrder, checkoutPhases.failed],
  [checkoutPhases.creatingOrder]: [
    checkoutPhases.initializingPayment,
    checkoutPhases.completed,
    checkoutPhases.failed,
  ],
  [checkoutPhases.initializingPayment]: [
    checkoutPhases.awaitingProvider,
    checkoutPhases.redirecting,
    checkoutPhases.failed,
  ],
  [checkoutPhases.awaitingProvider]: [checkoutPhases.completed, checkoutPhases.failed],
  [checkoutPhases.redirecting]: [checkoutPhases.failed],
  [checkoutPhases.completed]: [],
  [checkoutPhases.failed]: [checkoutPhases.validating],
};

export const checkoutStateReducer = (state, event) => {
  if (event.type === "reset") return initialCheckoutState;
  if (event.type !== "transition") return state;

  const allowed = allowedTransitions[state.phase] || [];
  if (!allowed.includes(event.phase)) return state;

  return {
    phase: event.phase,
    error: event.phase === checkoutPhases.failed ? event.error || null : null,
  };
};

export const isCheckoutBusy = (state) =>
  ![checkoutPhases.idle, checkoutPhases.failed].includes(state.phase);
