import { describe, expect, jest, test } from "@jest/globals";
import { createSellerOrderRepository } from "~/infrastructure/orders/orderRepository.js";

describe("seller order repository", () => {
  test("queries normalized lines with orders and removes unrelated orders", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          items: [],
          order_items: [
            { line_number: 1, seller_id: "seller-1", product_name: "Mine" },
          ],
        },
        {
          id: 2,
          items: [],
          order_items: [
            { line_number: 1, seller_id: "seller-2", product_name: "Other" },
          ],
        },
      ],
      error: null,
    });
    const select = jest.fn(() => ({ order }));
    const supabase = { from: jest.fn(() => ({ select })) };

    const orders = await createSellerOrderRepository(supabase).findAll(
      "seller-1"
    );

    expect(supabase.from).toHaveBeenCalledWith("orders");
    expect(select.mock.calls[0][0]).toContain("order_items(");
    expect(orders).toHaveLength(1);
    expect(orders[0].items[0].name).toBe("Mine");
  });

  test("surfaces query failures", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: null, error: new Error("read failed") }),
        }),
      }),
    };

    await expect(
      createSellerOrderRepository(supabase).findAll("seller-1")
    ).rejects.toThrow("read failed");
  });
});
