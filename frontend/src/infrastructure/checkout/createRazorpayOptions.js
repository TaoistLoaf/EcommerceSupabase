export const createRazorpayOptions = ({
  key,
  order,
  onPayment,
  onDismiss,
}) => ({
  key,
  amount: order.amount,
  currency: order.currency,
  name: "Order Payment",
  description: "Order Payment",
  order_id: order.id,
  receipt: order.receipt,
  handler: onPayment,
  modal: { ondismiss: onDismiss },
});
