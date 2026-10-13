const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const toOrderItemReadModel = (row) => {
  const snapshot = isRecord(row?.product_snapshot)
    ? row.product_snapshot
    : {};
  const snapshotRentInfo = isRecord(snapshot.rentInfo)
    ? snapshot.rentInfo
    : {};
  const rental = row?.item_type === "rental";

  return {
    ...snapshot,
    id: row?.product_id ?? snapshot.id,
    seller_id: row?.seller_id ?? snapshot.seller_id,
    name: row?.product_name ?? snapshot.name,
    quantity: row?.quantity ?? snapshot.quantity ?? 1,
    price: row?.unit_amount ?? snapshot.price,
    size: row?.size ?? snapshot.size,
    customization: isRecord(row?.customization)
      ? row.customization
      : snapshot.customization,
    ...(rental
      ? {
          rentable: true,
          rentInfo: {
            ...snapshotRentInfo,
            startDate: row?.rental_start_date ?? snapshotRentInfo.startDate,
            endDate: row?.rental_end_date ?? snapshotRentInfo.endDate,
            rentFee: row?.line_amount ?? snapshotRentInfo.rentFee,
            totalPrice: snapshotRentInfo.totalPrice ?? row?.line_amount,
          },
        }
      : {}),
  };
};

export const selectOrderItemReadModels = ({ normalizedRows }) => {
  const normalized = Array.isArray(normalizedRows) ? normalizedRows : [];

  return {
    items: [...normalized]
      .sort((left, right) => left.line_number - right.line_number)
      .map(toOrderItemReadModel),
    source: "order_items",
  };
};

export const attachOrderItemReadModels = (orders, normalizedRows) => {
  const rowsByOrderId = new Map();

  for (const row of Array.isArray(normalizedRows) ? normalizedRows : []) {
    const rows = rowsByOrderId.get(row.order_id) || [];
    rows.push(row);
    rowsByOrderId.set(row.order_id, rows);
  }

  return (Array.isArray(orders) ? orders : []).map((order) => {
    const resolved = selectOrderItemReadModels({
      normalizedRows: rowsByOrderId.get(order.id),
    });

    return {
      ...order,
      items: resolved.items,
      itemsSource: resolved.source,
    };
  });
};
