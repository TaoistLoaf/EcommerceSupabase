export const buildOrderItems = (cartItems, products) => {
  const orderItems = [];

  for (const productId in cartItems) {
    for (const sizeKey in cartItems[productId]) {
      const entry = cartItems[productId][sizeKey];
      const quantity = typeof entry === "object" ? entry.quantity : entry;
      if (!quantity || quantity <= 0) continue;

      const product = products.find(
        (candidate) => String(candidate.id) === String(productId)
      );
      if (!product) continue;

      const orderItem = structuredClone(product);
      orderItem.size =
        typeof entry === "object" && entry.baseSize
          ? entry.baseSize
          : sizeKey.split("|custom:")[0];
      orderItem.size_key = sizeKey;
      orderItem.quantity = quantity;

      if (typeof entry === "object" && entry.customization) {
        orderItem.customization = entry.customization;
      }
      if (typeof entry === "object" && entry.rentInfo) {
        orderItem.rentInfo = entry.rentInfo;
      }

      orderItems.push(orderItem);
    }
  }

  return orderItems;
};
