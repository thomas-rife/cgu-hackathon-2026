// AAA LA/Long Beach diesel average: $8.0968/US gal on 2026-11-14,
// rounded to cents as a fixed, editable demo baseline for Southern California.
export const DEFAULT_DIESEL_PRICE = 8.10;
export const DIESEL_PRICE_DATE = "Nov 14, 2026";
export const DIESEL_PRICE_SOURCE = "https://gasprices.aaa.com/?state=CA";
export const LOADED_TRUCK_MPG = 6;

// EPA diesel-combustion factor: 10,180 g CO2 per US gallon (tailpipe only).
export const DIESEL_CO2_KG_PER_GALLON = 10.18;
export const CO2_FACTOR_SOURCE = "https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references";

export function estimateRouteImpact(miles: number, dieselPrice: number | null) {
  const gallons = miles / LOADED_TRUCK_MPG;
  return {
    gallons,
    fuelCost: dieselPrice === null ? null : gallons * dieselPrice,
    co2Kg: gallons * DIESEL_CO2_KG_PER_GALLON,
  };
}
