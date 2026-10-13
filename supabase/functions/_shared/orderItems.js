export const ORDER_ITEM_SELECT_FIELDS = [
  "order_id",
  "line_number",
  "product_id",
  "seller_id",
  "item_type",
  "product_name",
  "quantity",
  "unit_amount",
  "line_amount",
  "currency",
  "size",
  "customization",
  "rental_start_date",
  "rental_end_date",
  "product_snapshot",
].join(", ");

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const toOrderItemSnapshot = (row) => {
  const snapshot = isRecord(row?.product_snapshot)
    ? row.product_snapshot
    : {};
  const snapshotRentInfo = isRecord(snapshot.rentInfo)
    ? snapshot.rentInfo
    : {};
  const isRental = row?.item_type === "rental";

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
    ...(isRental
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

export const resolveOrderItems = ({ normalizedRows }) => {
  const normalized = Array.isArray(normalizedRows) ? normalizedRows : [];

  return {
    items: [...normalized]
      .sort((left, right) => left.line_number - right.line_number)
      .map(toOrderItemSnapshot),
    source: "order_items",
  };
};

export const hydrateOrdersWithItems = async (supabase, orders) => {
  const orderRows = Array.isArray(orders) ? orders : [];
  const orderIds = orderRows.map((order) => order.id).filter(Boolean);
  if (!orderIds.length) return [];

  const { data, error } = await supabase
    .from("order_items")
    .select(ORDER_ITEM_SELECT_FIELDS)
    .in("order_id", orderIds)
    .order("line_number", { ascending: true });

  if (error) throw error;

  const rowsByOrderId = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const rows = rowsByOrderId.get(row.order_id) || [];
    rows.push(row);
    rowsByOrderId.set(row.order_id, rows);
  }

  return orderRows.map((order) => {
    const resolved = resolveOrderItems({
      normalizedRows: rowsByOrderId.get(order.id),
    });

    return {
      ...order,
      items: resolved.items,
      items_source: resolved.source,
    };
  });
};

export const hydrateOrderWithItems = async (supabase, order) => {
  if (!order) return null;
  const [hydratedOrder] = await hydrateOrdersWithItems(supabase, [order]);
  return hydratedOrder;
};
