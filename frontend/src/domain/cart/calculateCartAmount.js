export const calculateCartAmount = (cartItems, products) => {
  let totalAmount = 0;

  for (const productId in cartItems) {
    const product = products.find(
      (candidate) => String(candidate.id) === String(productId)
    );
    if (!product) continue;

    for (const sizeKey in cartItems[productId]) {
      const entry = cartItems[productId][sizeKey];
      if (typeof entry === "object" && entry.rentInfo) {
        totalAmount += entry.rentInfo.totalPrice || 0;
      } else {
        const quantity = typeof entry === "object" ? entry.quantity : entry;
        if (quantity > 0) totalAmount += product.price * quantity;
      }
    }
  }

  return totalAmount;
};
