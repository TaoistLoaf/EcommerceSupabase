import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createOrderRepository } from "./orderRepository.js";

const createClient = ({ orders, orderItems, itemError = null }) => ({
  from(table) {
    if (table === "orders") {
      const query = {
        select: () => query,
        or: () => query,
        eq: () => query,
        order: () => query,
        range: async () => ({ data: orders, error: null, count: orders.length }),
      };
      return query;
    }

    const query = {
      select: () => query,
      in: () => query,
      order: async () => ({ data: orderItems, error: itemError }),
    };
    return query;
  },
});

describe("order repository", () => {
  test("loads one page and hydrates it with normalized lines", async () => {
    const repository = createOrderRepository(
      createClient({
        orders: [{ id: 7, items: [{ name: "Legacy" }] }],
        orderItems: [
          {
            order_id: 7,
            line_number: 1,
            product_id: "product-1",
            product_name: "Normalized",
            quantity: 2,
          },
        ],
      })
    );

    const result = await repository.findBuyerOrders({
      userId: "buyer-1",
      page: 1,
      pageSize: 10,
      status: "",
      orderId: null,
    });

    assert.equal(result.count, 1);
    assert.equal(result.orders[0].items[0].name, "Normalized");
    assert.equal(result.orders[0].itemsSource, "order_items");
  });

  test("returns legacy lines if the normalized query is unavailable", async () => {
    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      const repository = createOrderRepository(
        createClient({
          orders: [{ id: 8, items: [{ name: "Legacy" }] }],
          orderItems: null,
          itemError: new Error("read failed"),
        })
      );

      const result = await repository.findBuyerOrders({
        userId: "buyer-1",
        page: 1,
        pageSize: 10,
        status: "",
        orderId: null,
      });

      assert.equal(result.orders[0].items[0].name, "Legacy");
      assert.equal(result.orders[0].itemsSource, "orders.items");
    } finally {
      console.warn = originalWarn;
    }
  });
});
