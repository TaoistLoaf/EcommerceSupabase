const isMissingCatalogColumn = (error) => {
  const message = String(error?.message || "");
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column .*\.(listing_type|catalog_section) does not exist/i.test(message) ||
    /could not find the ['"]?(listing_type|catalog_section)['"]? column/i.test(message)
  );
};

const normalizeLegacyRental = (item) => ({
  ...item,
  images: Array.isArray(item.image_urls) ? item.image_urls : [],
  price: item.price_per_day,
  replacement_value: item.estimated_value,
  listing_type: "rental",
  catalog_section: "services",
  source_table: "lend_items",
});

export const createSellerCatalogRepository = (supabase) => ({
  async findSaleListings(sellerId) {
    const canonical = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("catalog_section", "products")
      .order("created_at", { ascending: false });

    if (!canonical.error) return canonical.data || [];
    if (!isMissingCatalogColumn(canonical.error)) throw canonical.error;

    const legacy = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

    if (legacy.error) throw legacy.error;
    return legacy.data || [];
  },

  async findRentalListings(sellerId) {
    const canonical = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("listing_type", "rental")
      .eq("catalog_section", "services")
      .order("created_at", { ascending: false });

    if (!canonical.error) {
      return (canonical.data || []).map((item) => ({
        ...item,
        source_table: "products",
      }));
    }
    if (!isMissingCatalogColumn(canonical.error)) throw canonical.error;

    const legacy = await supabase
      .from("lend_items")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

    if (legacy.error) throw legacy.error;
    return (legacy.data || []).map(normalizeLegacyRental);
  },

  async createSaleListing(listing) {
    const canonical = await supabase.from("products").insert([listing]);
    if (!canonical.error) return;
    if (!isMissingCatalogColumn(canonical.error)) throw canonical.error;

    const legacyListing = { ...listing };
    delete legacyListing.listing_type;
    delete legacyListing.catalog_section;
    const { error } = await supabase.from("products").insert([{
      ...legacyListing,
      rentable: false,
    }]);
    if (error) throw error;
  },

  async createRentalListing(listing) {
    const canonical = await supabase.from("products").insert([listing]);
    if (!canonical.error) return;
    if (!isMissingCatalogColumn(canonical.error)) throw canonical.error;

    const { error } = await supabase.from("lend_items").insert([{
      seller_id: listing.seller_id,
      name: listing.name,
      description: listing.description,
      category: listing.category,
      image_urls: listing.images,
      estimated_value: listing.replacement_value,
      price_per_day: listing.price,
      max_rental_days: listing.max_rental_days,
      stock: listing.stock,
      available_from: listing.available_from || null,
      available_to: listing.available_to || null,
    }]);
    if (error) throw error;
  },

  async deleteSaleListing({ id, sellerId }) {
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id)
      .eq("seller_id", sellerId);
    if (error) throw error;
  },

  async deleteRentalListing({ id, sellerId, sourceTable }) {
    const table = sourceTable === "lend_items" ? "lend_items" : "products";
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", id)
      .eq("seller_id", sellerId);
    if (error) throw error;
  },
});

export { isMissingCatalogColumn, normalizeLegacyRental };
