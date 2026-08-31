export const buildOrderPayload = ({
  address,
  items,
  amount,
  deliveryFee,
  paymentMethod,
  userId,
  now = new Date(),
}) => ({
  address,
  items,
  amount: amount + deliveryFee,
  paymentmethod: paymentMethod,
  payment: false,
  status: "Order Placed",
  date: now.toISOString(),
  user_id: userId,
  buyer_id: userId,
});
