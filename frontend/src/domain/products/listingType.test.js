import { describe, expect, it } from "vitest";
import { isRentalListing, LISTING_TYPES } from "./listingType.js";

describe("isRentalListing", () => {
  it("uses the canonical listing type", () => {
    expect(isRentalListing({ listing_type: LISTING_TYPES.RENTAL })).toBe(true);
    expect(isRentalListing({ listing_type: LISTING_TYPES.SALE })).toBe(false);
  });

  it("supports the legacy flag during a rolling deployment", () => {
    expect(isRentalListing({ rentable: true })).toBe(true);
    expect(isRentalListing({ rentable: false })).toBe(false);
  });

  it("does not allow the legacy flag to override the canonical value", () => {
    expect(
      isRentalListing({ listing_type: LISTING_TYPES.SALE, rentable: true })
    ).toBe(false);
  });
});

