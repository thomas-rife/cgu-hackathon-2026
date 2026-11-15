"use client";

import PopoutDialog from "./popout-dialog";
import { CES_SOURCE_URL } from "@/lib/ces-config";
import {
  CO2_FACTOR_SOURCE,
  DEFAULT_DIESEL_PRICE,
  DIESEL_PRICE_DATE,
  DIESEL_PRICE_SOURCE,
  LOADED_TRUCK_MPG,
} from "@/lib/route-metrics";

export default function HowItWorks({
  onClose,
  price,
  onPriceChange,
}: {
  onClose: () => void;
  price?: string;
  onPriceChange?: (value: string) => void;
}) {
  const editable = price !== undefined && !!onPriceChange;
  const validPrice =
    !editable ||
    (price.trim() !== "" &&
      Number.isFinite(Number(price)) &&
      Number(price) > 0);
  return (
    <PopoutDialog title="How FleetForward works" onClose={onClose}>
      <div className="space-y-5 text-xs leading-relaxed text-slate-600">
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            What data are we using?
          </h3>
          <p>
            Road network and truck routing use ArcGIS. A chosen departure time
            uses historical traffic for a typical Monday, not live traffic.
            Warehouse locations come from the Southern California warehouses
            layer. Neighborhood data comes from{" "}
            <a
              href={CES_SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              CalEnviroScreen 4.0 census tracts
            </a>
            .
          </p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            What’s simulated/estimated?
          </h3>
          <p>
            Shipments, appointments, road disruptions, and warehouse names are
            demo scenarios. Warehouse names are aliases for real locations.
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Estimates & assumptions
          </h3>
          <p>
            Fuel cost = route miles ÷ {LOADED_TRUCK_MPG} mpg for a loaded semi ×
            diesel price. The{" "}
            <a
              href={DIESEL_PRICE_SOURCE}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              LA/Long Beach diesel reference
            </a>{" "}
            is ${DEFAULT_DIESEL_PRICE.toFixed(2)}/gal as of {DIESEL_PRICE_DATE}.
          </p>
          {editable && (
            <div>
              <label
                htmlFor="diesel-price"
                className="font-medium text-slate-800"
              >
                Diesel price ($/gal)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="diesel-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => onPriceChange(event.target.value)}
                  aria-invalid={!validPrice}
                  className="route-input w-28"
                />
                <button
                  type="button"
                  onClick={() => onPriceChange(DEFAULT_DIESEL_PRICE.toFixed(2))}
                  className="text-blue-700 underline"
                >
                  Reset price
                </button>
              </div>
              {!validPrice && (
                <p className="mt-1 text-red-700">Enter a price above zero.</p>
              )}
            </div>
          )}
          <p>
            CO₂ is about{" "}
            <a
              href={CO2_FACTOR_SOURCE}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              10.2 kg per gallon of diesel
            </a>
            , for tailpipe emissions only. Lane closures assume about 1.5×
            travel time on a 3–5 mi stretch; crashes about 3× on a 1–2 mi
            stretch; crashes with lane closure about 3.5×. Rain assumes about
            10% slower travel. These are applied to affected stretches except
            rain, which affects the trip overall.
          </p>
          <p>
            Original plan uses static truck speeds. A departure or arrival
            constraint uses historical traffic. Arrival times are Pacific time.
            Loading, dwell time, fuel production, and uncertainty buffers are
            excluded. Tiny differences below $0.50 fuel, 0.5 mi, 1 kg CO₂, 1
            min, or 0.5 percentile points display as “No change.”
          </p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            Community metrics
          </h3>
          <p>
            Diesel burden is the existing CalEnviroScreen diesel PM percentile,
            not this truck’s emissions. High-diesel means at least the 75th
            percentile. Disadvantaged communities approximate the top 25% of
            overall CalEnviroScreen scores; the state SB 535 list includes some
            additional tracts. Routes are sampled every 0.1 mi and ranked by
            miles through these tracts, not the percentage of a route. Coverage
            is Los Angeles, Orange, Riverside, and San Bernardino counties.
            Missing tract values are excluded.
          </p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            What’s AI vs. rules
          </h3>
          <p>
            Code computes route options, tags, rankings, and every number. The
            local Bolt model only writes explanations and translates chat
            requests into validated disruptions or route priorities. Code
            chooses any route selected by priority. AI explanations are checked
            so they contain no numbers absent from the data.
          </p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Privacy</h3>
          <p>
            No login or personal or driver data is required. Plans are saved
            only in this browser. No data is sent to an external AI provider;
            Bolt runs on this machine. The local model receives rounded route
            metrics and scenario labels, not stop addresses or route geometry.
          </p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            Limitations
          </h3>
          <p>
            Noise and school-zone impacts are not modeled. Traffic is
            historical, not live. Slowdown effects are assumptions. Routes in
            this demo largely stay on freeways.
          </p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            Route choices
          </h3>
          <p>
            Candidate searches compare fastest, shortest-distance, and different
            freeway corridors under the same disruptions. Default view shows
            tagged options: Fastest, Lowest DAC miles, Lowest CO₂, and at most
            one Balanced route, which must fall between the fastest and the
            lowest-DAC route on both time and DAC miles. Multiple tags may
            belong to one route. Show all
            candidates reveals every distinct verified option, including routes
            that are worse on every measured outcome. Tags describe the options
            found, not a guaranteed global optimum.
          </p>
        </section>
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white"
        >
          Done
        </button>
      </div>
    </PopoutDialog>
  );
}
