import { describe, expect, jest, test } from "@jest/globals";
import { createSellerCatalogRepository } from "~/infrastructure/catalog/sellerCatalogRepository.js";

const queryResult = (result) => {
  const query = {
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.order = jest.fn(() => query);
  query.delete = jest.fn(() => query);
  query.insert = jest.fn(() => query);
  return query;
};

describe("seller catalog repository", () => {
  test("uses canonical product fields when the expanded schema is available", async () => {
    const query = queryResult({
      data: [{ id: "product-1", catalog_section: "products" }],
      error: null,
    });
    const supabase = { from: jest.fn(() => query) };

    const rows = await createSellerCatalogRepository(supabase)
      .findSaleListings("seller-1");

    expect(rows).toHaveLength(1);
    expect(query.eq).toHaveBeenCalledWith("catalog_section", "products");
  });

  test("falls back to legacy products when catalog_section is missing", async () => {
    const missingColumn = queryResult({
      data: null,
      error: {
        code: "42703",
        message: "column products.catalog_section does not exist",
      },
    });
    const legacy = queryResult({ data: [{ id: "product-1" }], error: null });
    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(missingColumn)
        .mockReturnValueOnce(legacy),
    };

    const rows = await createSellerCatalogRepository(supabase)
      .findSaleListings("seller-1");

    expect(rows).toEqual([{ id: "product-1" }]);
    expect(supabase.from).toHaveBeenNthCalledWith(2, "products");
  });

  test("reads and normalizes lend_items when listing_type is missing", async () => {
    const missingColumn = queryResult({
      data: null,
      error: {
        code: "42703",
        message: "column products.listing_type does not exist",
      },
    });
    const legacy = queryResult({
      data: [{
        id: 7,
        image_urls: ["rental.jpg"],
        price_per_day: 12,
        estimated_value: 80,
      }],
      error: null,
    });
    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(missingColumn)
        .mockReturnValueOnce(legacy),
    };

    const [row] = await createSellerCatalogRepository(supabase)
      .findRentalListings("seller-1");

    expect(supabase.from).toHaveBeenNthCalledWith(2, "lend_items");
    expect(row).toEqual(expect.objectContaining({
      images: ["rental.jpg"],
      price: 12,
      replacement_value: 80,
      source_table: "lend_items",
    }));
  });

  test("deletes a legacy rental from its actual source table", async () => {
    const query = queryResult({ error: null });
    const supabase = { from: jest.fn(() => query) };

    await createSellerCatalogRepository(supabase).deleteRentalListing({
      id: 7,
      sellerId: "seller-1",
      sourceTable: "lend_items",
    });

    expect(supabase.from).toHaveBeenCalledWith("lend_items");
    expect(query.eq).toHaveBeenCalledWith("seller_id", "seller-1");
  });

  test("retries sale creation without canonical columns on the legacy schema", async () => {
    const missingColumn = queryResult({
      error: { code: "PGRST204", message: "listing_type was not found" },
    });
    const legacy = queryResult({ error: null });
    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(missingColumn)
        .mockReturnValueOnce(legacy),
    };

    await createSellerCatalogRepository(supabase).createSaleListing({
      name: "Sale item",
      listing_type: "sale",
      catalog_section: "products",
    });

    expect(legacy.insert).toHaveBeenCalledWith([{
      name: "Sale item",
      rentable: false,
    }]);
  });

  test("retries rental creation against lend_items on the legacy schema", async () => {
    const missingColumn = queryResult({
      error: { code: "42703", message: "column products.listing_type does not exist" },
    });
    const legacy = queryResult({ error: null });
    const supabase = {
      from: jest.fn()
        .mockReturnValueOnce(missingColumn)
        .mockReturnValueOnce(legacy),
    };

    await createSellerCatalogRepository(supabase).createRentalListing({
      seller_id: "seller-1",
      name: "Rental item",
      description: "Description",
      category: "Tools",
      images: ["rental.jpg"],
      price: 9,
      replacement_value: 100,
      max_rental_days: 30,
      stock: 1,
    });

    expect(supabase.from).toHaveBeenNthCalledWith(2, "lend_items");
    expect(legacy.insert).toHaveBeenCalledWith([expect.objectContaining({
      image_urls: ["rental.jpg"],
      price_per_day: 9,
      estimated_value: 100,
    })]);
  });
});
