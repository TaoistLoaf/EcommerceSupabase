import { describe, expect, it, vi } from "vitest";
import { createReorderHandler } from "./handler.js";

const createRequest = (body, method = "POST") =>
  new Request("http://localhost/reorder", {
    method,
    headers: { Authorization: "Bearer buyer-token" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

const createDependencies = (overrides = {}) => ({
  authenticate: vi.fn().mockResolvedValue({
    user: { id: "buyer-1" },
    client: { name: "buyer-client" },
  }),
  reorder: vi.fn().mockResolvedValue({
    order_number: "20261006120000-ABCDEF-00000007",
    added_line_count: 2,
    skipped_line_count: 0,
  }),
  logger: { error: vi.fn() },
  ...overrides,
});

describe("reorder handler", () => {
  it("requires authentication", async () => {
    const dependencies = createDependencies({
      authenticate: vi.fn().mockResolvedValue(null),
    });
    const response = await createReorderHandler(dependencies)(
      createRequest({ orderNumber: "20261006120000-ABCDEF-00000007" })
    );

    expect(response.status).toBe(401);
    expect(dependencies.reorder).not.toHaveBeenCalled();
  });

  it("rejects an invalid public order number", async () => {
    const dependencies = createDependencies();
    const response = await createReorderHandler(dependencies)(
      createRequest({ orderNumber: "7" })
    );

    expect(response.status).toBe(400);
    expect(dependencies.reorder).not.toHaveBeenCalled();
  });

  it("normalizes the public order number and calls the database contract", async () => {
    const dependencies = createDependencies();
    const response = await createReorderHandler(dependencies)(
      createRequest({ orderNumber: "20261006120000-abcdef-00000007" })
    );

    expect(response.status).toBe(200);
    expect(dependencies.reorder).toHaveBeenCalledWith({
      client: { name: "buyer-client" },
      orderNumber: "20261006120000-ABCDEF-00000007",
    });
  });

  it.each([
    ["Order not found", 404],
    ["Order items are not normalized", 409],
    ["No reorderable items", 422],
    ["database unavailable", 500],
  ])("maps %s to HTTP %s", async (message, expectedStatus) => {
    const dependencies = createDependencies({
      reorder: vi.fn().mockRejectedValue(new Error(message)),
    });
    const response = await createReorderHandler(dependencies)(
      createRequest({ orderNumber: "20261006120000-ABCDEF-00000007" })
    );

    expect(response.status).toBe(expectedStatus);
  });
});
