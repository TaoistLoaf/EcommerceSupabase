export const buildOrderPayload = ({
  address,
  items,
  amount,
  deliveryFee,
  paymentMethod,
  userId,
  checkoutRequestId,
}) => ({
  checkout_request_id: checkoutRequestId,
  address,
  items,
  amount: amount + deliveryFee,
  paymentmethod: paymentMethod,
  payment: false,
  status: "Order Placed",
  buyer_id: userId,
});
