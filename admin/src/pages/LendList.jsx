import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { toast } from "react-toastify";
import { createSellerCatalogRepository } from "../infrastructure/catalog/sellerCatalogRepository.js";

const catalogRepository = createSellerCatalogRepository(supabase);

const LendList = ({ user }) => {
  const [items, setItems] = useState([]);

  // ---------------- Fetch Rental Items ----------------
  const fetchLendItems = async () => {
    try {
      setItems(await catalogRepository.findRentalListings(user?.id));
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error(error.message);
    }
  };

  // ---------------- Delete Item ----------------
  const removeItem = async (item) => {
    try {
      await catalogRepository.deleteRentalListing({
        id: item.id,
        sellerId: user?.id,
        sourceTable: item.source_table,
      });

      toast.success("Rental item deleted successfully!");
      fetchLendItems();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message);
    }
  };

  useEffect(() => {
    if (user?.id) fetchLendItems();
  }, [user]);

  // ---------------- Render ----------------
  return (
    <div>
      <p className="mb-4 text-lg font-semibold">All Rental Items</p>

      <div className="flex flex-col gap-2">
        {/* ---------- Table Header ---------- */}
        <div className="hidden md:grid grid-cols-[1fr_2fr_1fr_1fr_1fr_1fr_1fr] bg-gray-100 border text-sm font-medium p-2">
          <p>Image</p>
          <p>Name</p>
          <p>Category</p>
          <p>Est. Value</p>
          <p>Price/Day</p>
          <p>Availability</p>
          <p className="text-center">Action</p>
        </div>

        {/* ---------- Item Rows ---------- */}
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_2fr_1fr] md:grid-cols-[1fr_2fr_1fr_1fr_1fr_1fr_1fr] border items-center text-sm p-2"
            >
              {/* Image */}
              <img
                className="w-14 h-14 object-cover rounded"
                src={item.images?.[0]}
                alt={item.name}
              />

              {/* Name */}
              <p className="truncate">{item.name}</p>

              {/* Category */}
              <p>{item.category}</p>

              {/* Estimated Value */}
              <p>${item.replacement_value?.toFixed(2) || "—"}</p>

              {/* Price Per Day */}
              <p>${item.price?.toFixed(2)}</p>

              {/* Availability */}
              <p>
                {item.available_from
                  ? `${item.available_from} → ${item.available_to || "∞"}`
                  : "Always Available"}
              </p>

              {/* Action */}
              <button
                onClick={() => removeItem(item)}
                className="text-red-500 text-center font-bold hover:text-red-700"
              >
                ✕
              </button>
            </div>
          ))
        ) : (
          <p className="text-gray-500 text-center py-6">
            No rental items found.
          </p>
        )}
      </div>
    </div>
  );
};

export default LendList;
