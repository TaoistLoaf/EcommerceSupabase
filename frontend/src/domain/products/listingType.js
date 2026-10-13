export const LISTING_TYPES = Object.freeze({
  SALE: "sale",
  RENTAL: "rental",
});

export const isRentalListing = (product) =>
  product?.listing_type
    ? product.listing_type === LISTING_TYPES.RENTAL
    : product?.rentable === true;

