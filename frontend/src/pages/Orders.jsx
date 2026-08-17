import { useCallback, useContext, useEffect, useState } from "react";
import { ShopContext } from "../context/ShopContext";
import Title from "../components/Title";
import { supabase } from "../supabaseClient";

const PAGE_SIZE_OPTIONS = [5, 10, 20];
const ORDER_STATUS_OPTIONS = [
  "Order Placed",
  "Packing",
  "Shipped",
  "Out for delivery",
  "Delivered",
  "Cancelled",
];

const Orders = () => {
  const { user, token, getUserCart, userId, navigate } = useContext(ShopContext);
  const [orderData, setOrderData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalOrders, setTotalOrders] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [orderIdSearch, setOrderIdSearch] = useState("");

  // ✅ Load only orders for the current user
  const loadOrderData = useCallback(async () => {
    if (!user?.id) {
      setOrderData([]);
      setTotalOrders(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const baseSelect =
        "id, items, status, payment, paymentmethod, date, created_at, buyer_id";
      const ownerFilter = `buyer_id.eq.${user.id},user_id.eq.${user.id}`;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const trimmedOrderId = orderIdSearch.trim();
      const searchedOrderId = trimmedOrderId ? Number(trimmedOrderId) : null;

      if (trimmedOrderId && !Number.isInteger(searchedOrderId)) {
        setOrderData([]);
        setTotalOrders(0);
        return;
      }

      // Apply filters before range so Supabase counts and returns the filtered page.
      const applyFilters = (query) => {
        let nextQuery = query.or(ownerFilter);

        if (statusFilter) {
          nextQuery = nextQuery.eq("status", statusFilter);
        }
        if (searchedOrderId) {
          nextQuery = nextQuery.eq("id", searchedOrderId);
        }

        return nextQuery
          .order("created_at", { ascending: false })
          .range(from, to);
      };

      let {
        data,
        error,
        count,
      } = await applyFilters(
        supabase
          .from("orders")
          .select(`${baseSelect}, shipping_tracking_number, shipping_tracking_url`, {
            count: "exact",
          })
      );

      if (error && error.message?.includes("shipping_tracking")) {
        const fallback = await applyFilters(
          supabase.from("orders").select(baseSelect, { count: "exact" })
        );

        data = fallback.data;
        error = fallback.error;
        count = fallback.count;
      }

      if (error) {
        console.error("❌ Supabase fetch error:", error);
        return;
      }

      const formattedOrders = (data || []).map((order) => ({
        id: order.id,
        status: order.status,
        payment: order.payment,
        paymentmethod: order.paymentmethod,
        date: order.date || order.created_at,
        items: order.items || [],
        shippingTrackingNumber: order.shipping_tracking_number || "",
        shippingTrackingUrl: order.shipping_tracking_url || "",
      }));

      setOrderData(formattedOrders);
      setTotalOrders(count || 0);
    } catch (error) {
      console.error("🔥 loadOrderData error:", error);
    } finally {
      setLoading(false);
    }
  }, [orderIdSearch, page, pageSize, statusFilter, user?.id]);

  useEffect(() => {
    setPage(1);
  }, [user?.id, pageSize, statusFilter, orderIdSearch]);

  useEffect(() => {
    loadOrderData();
  }, [loadOrderData]);

  const clearFilters = () => {
    setStatusFilter("");
    setOrderIdSearch("");
  };

  const totalPages = Math.max(Math.ceil(totalOrders / pageSize), 1);
  const firstVisibleOrder = totalOrders === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisibleOrder = Math.min(page * pageSize, totalOrders);
  const hasFilters = Boolean(statusFilter || orderIdSearch.trim());
  const shouldShowPagination = totalOrders > pageSize;

  // ✅ Reorder feature
  const handleReorder = async (orderId) => {
    console.log("🧠 Sending reorder request for order_id:", orderId);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reorder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            user_id: userId,
            order_id: orderId,
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        alert("🛒 Items added to your cart!");
        await getUserCart(userId);
        navigate("/cart");
      } else {
        alert(data.message || "Reorder failed");
      }
    } catch (err) {
      console.error("handleReorder error:", err);
      alert("Reorder failed: " + err.message);
    }
  };

  // ✅ UI Rendering
  if (!user)
    return (
      <div className="text-center py-20 text-gray-500 text-lg">
        Please log in to view your orders.
      </div>
    );

  return (
    <div className="border-t pt-16">
      <div className="text-2xl mb-6">
        <Title text1={"MY"} text2={"ORDERS"} />
      </div>

      <div className="mb-6 grid gap-3 border border-gray-200 bg-white p-4 text-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">Order ID</span>
          <input
            type="search"
            value={orderIdSearch}
            onChange={(event) => setOrderIdSearch(event.target.value)}
            placeholder="Search order #"
            className="border border-gray-300 px-3 py-2 outline-none focus:border-black"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="border border-gray-300 px-3 py-2 outline-none focus:border-black"
          >
            <option value="">All statuses</option>
            {ORDER_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Per page</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="border border-gray-300 px-3 py-2 outline-none focus:border-black"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="border border-gray-300 px-3 py-2 text-gray-700 hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500 text-lg">
          Loading your orders...
        </div>
      ) : orderData.length === 0 ? (
        <div className="text-center py-20 text-gray-500 text-lg">
          {hasFilters
            ? "No orders match your filters."
            : "You haven’t placed any orders yet."}
        </div>
      ) : (
        <div>
          {orderData.map((order) => (
            <div key={order.id} className="py-4 border-t border-b text-gray-700">
              <p className="font-semibold mb-2">
                Order #{order.id}{" "}
                <span className="text-sm text-gray-500 ml-2">
                  {new Date(order.date).toLocaleDateString()}
                </span>
              </p>

              {order.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-6 text-sm mb-3 bg-gray-50 p-3 rounded"
                >
                  <img
                    className="w-16 sm:w-20 rounded border"
                    src={item.images?.[0] || ""}
                    alt={item.name}
                  />
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-gray-600">
                      {order.paymentmethod}
                      {item.size && item.size !== "One Size"
                        ? ` | Size: ${item.size}`
                        : ""}{" "}
                      | Qty: {item.quantity}
                    </p>
                    {item.customization && (
                      <p className="text-xs text-gray-500 mt-1">
                        ✏️ Custom:{" "}
                        {item.customization.lines
                          ?.filter(Boolean)
                          .join(" • ") || "None"}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-between items-center mt-3">
                <p className="text-sm text-gray-500">
                  Status:{" "}
                  <span className="font-medium text-black">{order.status}</span>
                </p>
                <button
                  onClick={() => handleReorder(order.id)}
                  className="border px-4 py-2 text-sm font-medium rounded-sm text-green-600 hover:bg-green-50"
                >
                  Reorder
                </button>
              </div>

              {(order.shippingTrackingNumber || order.shippingTrackingUrl) && (
                <div className="mt-3 text-sm text-gray-600">
                  {order.shippingTrackingNumber && (
                    <p>
                      Tracking #:{" "}
                      <span className="font-medium text-black">
                        {order.shippingTrackingNumber}
                      </span>
                    </p>
                  )}
                  {order.shippingTrackingUrl && (
                    <a
                      href={order.shippingTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Track shipment
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {shouldShowPagination && (
        <div className="mt-6 flex flex-col gap-3 border-t pt-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {firstVisibleOrder}-{lastVisibleOrder} of {totalOrders} orders
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1 || loading}
              className="border border-gray-300 px-3 py-2 hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              First
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={page <= 1 || loading}
              className="border border-gray-300 px-3 py-2 hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(current + 1, totalPages))
              }
              disabled={page >= totalPages || loading}
              className="border border-gray-300 px-3 py-2 hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
