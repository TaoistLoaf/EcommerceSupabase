import { toSellerOrderReadModel } from "../../domain/orders/orderItemReadModel.js";

const ORDER_ITEM_FIELDS = [
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

export const createSellerOrderRepository = (supabase) => ({
  async findAll(sellerId) {
    const { data, error } = await supabase
      .from("orders")
      .select(`*,order_items(${ORDER_ITEM_FIELDS})`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (Array.isArray(data) ? data : [])
      .map((order) => toSellerOrderReadModel(order, sellerId))
      .filter((order) => order.items.length > 0);
  },
});
