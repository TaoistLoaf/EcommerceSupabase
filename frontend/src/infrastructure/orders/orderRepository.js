import { attachOrderItemReadModels } from "../../domain/orders/orderItemReadModel.js";

const ORDER_FIELDS = [
  "id",
  "items",
  "status",
  "payment",
  "paymentmethod",
  "date",
  "created_at",
  "buyer_id",
  "shipping_tracking_number",
  "shipping_tracking_url",
].join(",");

const ORDER_ITEM_FIELDS = [
  "order_id",
  "line_number",
  "product_id",
  "seller_id",
  "item_type",
  "product_name",
  "quantity",
  "unit_amount",
  "line_amount",
  "size",
  "customization",
  "rental_start_date",
  "rental_end_date",
  "product_snapshot",
].join(",");

export const createOrderRepository = (supabase) => ({
  async findBuyerOrders({ userId, page, pageSize, status, orderId }) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("orders")
      .select(ORDER_FIELDS, { count: "exact" })
      .or(`buyer_id.eq.${userId},user_id.eq.${userId}`);

    if (status) query = query.eq("status", status);
    if (orderId) query = query.eq("id", orderId);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const orders = Array.isArray(data) ? data : [];
    const orderIds = orders.map((order) => order.id);
    if (!orderIds.length) return { orders: [], count: count || 0 };

    const { data: itemRows, error: itemError } = await supabase
      .from("order_items")
      .select(ORDER_ITEM_FIELDS)
      .in("order_id", orderIds)
      .order("line_number", { ascending: true });

    if (itemError) {
      console.warn("Using legacy order items:", itemError.message);
    }

    return {
      orders: attachOrderItemReadModels(
        orders,
        itemError ? [] : itemRows || []
      ),
      count: count || 0,
    };
  },
});
