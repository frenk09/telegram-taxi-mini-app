import type { PriceEstimate, Tariff } from "@taxi/shared";

export const calculateTripEstimate = (
  tariff: Tariff,
  distanceKm: number,
  durationMin: number
): PriceEstimate => {
  const totalPrice =
    tariff.minPrice +
    distanceKm * tariff.pricePerKm +
    durationMin * tariff.pricePerMinute;

  return {
    city: tariff.city,
    distanceKm,
    durationMin,
    basePrice: tariff.minPrice,
    totalPrice: Math.round(totalPrice)
  };
};
