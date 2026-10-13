import { describe, expect, test } from "@jest/globals";
import { getFunctionErrorMessage } from "~/infrastructure/functions/functionError.js";

describe("function error messages", () => {
  test("surfaces the Edge Function JSON error", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: {
        clone: () => ({
          json: async () => ({
            error: "UPS carrier account is not activated.",
          }),
        }),
      },
    };

    await expect(getFunctionErrorMessage(error, "Request failed"))
      .resolves.toBe("UPS carrier account is not activated.");
  });

  test("uses the client message when no JSON response is available", async () => {
    await expect(getFunctionErrorMessage(
      { message: "Network error" },
      "Request failed"
    )).resolves.toBe("Network error");
  });
});
