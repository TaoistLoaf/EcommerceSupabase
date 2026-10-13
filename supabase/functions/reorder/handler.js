const ORDER_NUMBER_PATTERN = /^[0-9]{14}-[A-F0-9]{6}-[0-9]{8,}$/;

const jsonResponse = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, X-Client-Info, apikey, Content-Type",
      "Content-Type": "application/json",
    },
  });

const mapReorderError = (error) => {
  const message = error instanceof Error
    ? error.message
    : String(error?.message || error);
  if (message.includes("Order not found")) {
    return { status: 404, message: "Order not found" };
  }
  if (message.includes("Order items are not normalized")) {
    return {
      status: 409,
      message: "This historical order is still being migrated.",
    };
  }
  if (message.includes("No reorderable items")) {
    return {
      status: 422,
      message: "This order has no items available to reorder.",
    };
  }
  return { status: 500, message: "Unable to reorder items" };
};

export const createReorderHandler = ({ authenticate, reorder, logger = console }) =>
  async (request) => {
    if (request.method === "OPTIONS") {
      return jsonResponse({ success: true }, 200);
    }
    if (request.method !== "POST") {
      return jsonResponse({ success: false, message: "Method not allowed" }, 405);
    }

    const auth = await authenticate(request.headers.get("Authorization") || "");
    if (!auth) {
      return jsonResponse({ success: false, message: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const orderNumber = String(body.orderNumber || "").trim().toUpperCase();
    if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
      return jsonResponse(
        { success: false, message: "A valid order number is required" },
        400
      );
    }

    try {
      const result = await reorder({ client: auth.client, orderNumber });
      return jsonResponse(
        { success: true, message: "Order items added to your cart.", result },
        200
      );
    } catch (error) {
      logger.error("Reorder transaction failed:", error);
      const mapped = mapReorderError(error);
      return jsonResponse({ success: false, message: mapped.message }, mapped.status);
    }
  };

export { ORDER_NUMBER_PATTERN, mapReorderError };
