# FleetForward

Run the Next.js app from the repository root:

```bash
npm install
npm run dev
```

Open http://localhost:3000.
The main page is **Today’s Plan**. **Add trip** opens the route planner at
`/planner`; its map starts over Los Angeles / Long Beach.

## Today’s Plan

Choose **Use route A** (or the selected letter) at the bottom of the comparison
card to open a date prompt defaulted to the current local date. Confirm the date
to add the chosen option to that day. During a disruption, **Keep original plan**
is also available while the original route remains drivable; full closures hide it. Trips are saved in this
browser's local storage, including the selected route, locations, disruption
settings, fuel price, and estimated schedule. Saving returns to Today’s Plan.
**Edit** reopens those inputs; saving an edit replaces the existing trip.
**Remove** deletes that trip and immediately updates the day totals and overview.

The plan filters by date and sorts trips by departure time. It shows route
summaries, departure → arrival estimates (or Departure not set for untimed trips),
chosen options, indicator strips, and
a small ArcGIS map overlaying all chosen routes. Day totals sum route miles,
estimated fuel cost at each trip's saved price, and estimated tailpipe CO₂.
Day totals also include miles through high-diesel tracts and disadvantaged
communities from each saved route snapshot. Truck grouping is deferred. Baseline schedules use the
selected departure or arrival constraint with static drive time; alternate
schedules use the solved historical-traffic scenario. Traffic remains the
typical-Monday model regardless of the plan's calendar date.

Disruptions are unique by freeway and preset. A second full closure on the
same freeway or duplicate slowdown preset is disabled in the UI and rejected
by the API. Different slowdown types can still coexist for the combined preset.
Time constraints and weather are journey-wide and can only be added once.

Copy `.env.example` to `.env` for a new checkout and fill in your ArcGIS keys.
`NEXT_PUBLIC_ARCGIS_API_KEY` needs Basemap Styles privileges and is included in
the browser bundle. Restrict its allowed referrers in your ArcGIS dashboard.
`ARCGIS_KEY` is used by the terminal routing experiment.

## Structure

```text
app/                   Next.js pages, layout, and global styles
components/mapview.tsx  Browser-only ArcGIS map and its lifecycle
components/route-planner.tsx  Port, destination, and optional-stop flow
components/place-picker.tsx   Live location searches and dropdowns
components/disruptions-panel.tsx  Closure, slowdown, traffic, and weather controls
components/route-comparison.tsx   Baseline / alternate / change table
app/api/               Server-side ArcGIS location search and route solve
lib/                   Shared types, port/search areas, and service helpers
public/                Static assets
data/                  Source datasets (crashes CSV uses Git LFS)
test.js                Standalone ArcGIS routing experiment
```

## Planning a route

1. Select a port. Long Beach is the default within the LA / Long Beach complex.
2. Choose a destination search area and pick a warehouse, or search a custom
   address and confirm a matching result. The direct route calculates automatically.
3. Use an **Add stop** button between locations to insert a warehouse, container
   yard/terminal, truck/fuel stop, or custom address. Each stop has its own search
   area, using the same warehouse list as the delivery destination for that area.
   Remove unwanted stops with **Remove**. Up to eight optional stops are supported.
4. The route updates automatically in the displayed order. Numbered map markers,
   route geometry, miles, and estimated driving time come from ArcGIS.
   Turn-by-turn instructions are not displayed; server-side directions identify
   the numbered freeways used by each route.

The map fills the workspace; route planning is not a permanent sidebar. A
floating horizontal **Route** card sits across the top, with an independent
floating **Disruptions** card beneath it. Once a complete route is calculated,
the route card collapses to start/end locations and mileage. Click its summary
or **Edit** to expand a horizontal origin → optional stops → destination editor.
**Add stop** inserts a location between the endpoints; longer itineraries scroll
horizontally. **Done** collapses the editor and fits the entire route, clearing
any selected-location focus. Map fitting measures the cards
so route markers remain in the available map area.

Click a selected location name in the sidebar, select a new warehouse, or click
a numbered map marker to focus that location. **Fit route** / **Show entire route**
returns to the full route. Close or coincident stop labels fan out with leader
lines to their real coordinates so one stop does not hide another. Unselected
stop drafts have no coordinates and do not create markers; resolved stops keep
the same sequence numbers as the sidebar, including gaps in incomplete routes.

The floating **Route comparison** card sits at the map's top right on wide
screens and above the bottom-right legend on smaller screens. When collapsed,
only a small top-right pill remains: **Route comparison · Route C ▸**.
Expanded/collapsed state is remembered for the browser-tab session, including
refreshes and navigation. Explicitly selecting any valid route (including the
current selection) reopens it; condition changes alone preserve the preference. A **Who’s affected** block
shows company fuel cost and CO₂, driver time, and residents’ disadvantaged-community
miles, all as changes from the current reference. Each line is green for a decrease and red
for an increase. The block updates with map selection. The **Original plan** or **Fastest**, selected route, and **Change** table
has independently collapsible **Operations** (initially closed: time, distance,
fuel, CO₂) and **Community** (initially open: average diesel percentile,
high-diesel miles, disadvantaged-community miles) sections. Each time value
includes its arrival time in Pacific time, rather than adding another row.
Changes use unrounded values. Higher community impacts are red; lower are green;
missing values show dashes. Population metrics are retained in saved route data.

The gear beside **Collapse** opens a settings popout with the editable diesel
price in the shared “How FleetForward works” view. Today’s Plan opens the same
view from its top-right button. Assumptions and multipliers appear there rather
than on disruption controls. Price changes update both options immediately;
invalid prices disable saving until corrected. Settings and save prompts support
Escape, close buttons, and keyboard focus handling. The **Diesel burden** toggle
and legend sit in the map's bottom-right corner with space reserved beneath the
comparison, including when Operations is expanded.

## Simulating a freeway closure

The **Disruptions** panel lists numbered freeways reported by ArcGIS for the
original plan. Selecting a freeway calculates valid route options with
restriction barriers on the traversed freeway geometry. Original plan stays
visible in the comparison card. The map shows it thin dashed gray underneath
all routes, the blocked freeway segments solid red, muted candidate routes, and the
selected candidate in a thicker color.
The comparison card shows time, distance, fuel cost, and CO₂ for both routes.

ArcGIS has no freeway-name exclusion parameter. The server reads road identifiers
from structured direction names/branches (plus explicit unnamed-highway merge
signposts), decodes those direction geometries, and places full-edge restriction
point barriers along the selected road. If an alternate re-enters the named
freeway, it adds barriers on the newly traversed segments and solves again.
It accepts an alternate only when ArcGIS reports no use of the selected freeway.
It preserves stop order, caps refinement at eight solves and 250 barriers, and
returns an error instead of claiming successful avoidance if verification fails.
Avoidance depends on ArcGIS's reported road identifiers; this is a simulation,
not an official statewide closure feed or a guarantee about unnamed road links.
Changing route stops clears a closure that belongs to another baseline.

Use **Add disruption** to insert numbered cards, just like adding route stops.
Cards can be removed independently; up to eight can be combined in one alternate.
The fastest search minimizes total truck travel time with the stop order fixed.
Other searches explore shorter-distance or different freeway corridors. Tags
compare actual candidate metrics; tied recommendations prefer the faster option.
Distance, fuel, and CO₂ are recalculated from the resulting route geometry.

- **Full closure:** add one or more blocked baseline freeways. Every selected
  freeway must be absent from the alternate's reported road identifiers.
- **Slowdown:** select a baseline freeway and a fixed assumption preset:
  lane closure **×1.5 over up to 4 mi**, crash **×3 over up to 1.5 mi**, or
  crash + lane closure **×3.5 over up to 1.5 mi**. Stretches are centered on
  the baseline freeway midpoint and capped by its available length. Narrow
  buffered corridors (roughly 30 m) become scaled-cost polygon barriers; nearby
  parallel roads in those corridors can also be affected. ArcGIS uses the costs
  to choose the fastest route, including detours. These are local time factors
  contributing to trip totals, not whole-trip multipliers or fixed added delays.
  Overlapping lane/crash areas use ×3.5, and duplicate same-type slowdowns are
  merged. The polygons are made disjoint to prevent unintended double scaling.
  Closures override slowdowns on the same freeway. All road disruptions are
  applied together, anchored to the original baseline rather than moving after
  each reroute. The server rejects custom factors.
- **Departure time:** historical traffic is always enabled; choose a departure in
  whole-minute increments (00:00–23:59). The alternate uses `TruckTravelTime` and ArcGIS's generic
  Monday (January 1, 1990), interpreted in the origin's local Pacific time.
  No departure is selected initially. Adding this card starts its slider at 8 AM Monday;
  removing it returns to free-flow `TruckMinutes` speeds with no startTime.
- **Arrival time:** replaces the departure card with an arrival deadline.
  Repeated forward solves include every road disruption, historical traffic,
  and the rain factor to estimate the latest on-time departure to the minute.
  Searches at most 24 hours before the deadline; an early Monday deadline can
  yield a Sunday departure. Saved trips display the resulting schedule in
  Pacific time on Today’s Plan. This is an estimate without loading, dwell, or uncertainty buffers.
  A journey has one departure or arrival constraint, not several competing times.
- **Weather:** clear or rain. Rain adds a uniform 10% to the solved drive time
  as an explicit demo assumption; it does not change distance, fuel economy, or
  the selected road geometry by itself.

Controls can be combined. **Reset disruptions** clears closures, slowdowns, and
weather and all time constraints while retaining the route. Initial state and
reset both have zero disruptions. Editing route locations also clears disruptions.
Historical traffic is enabled only by adding a departure or arrival constraint.
Traffic is historical, not live; slowdown and weather factors are demo assumptions.
ArcGIS's [scaled-cost polygon barriers](https://developers.arcgis.com/rest/routing/route-service-direct/#polygonbarriers)
apply local time factors during route selection.

Fuel assumptions live in `lib/route-metrics.ts`:

- Loaded-truck fuel economy: **6 miles per US gallon** (demo assumption).
- Default diesel price: **$8.10/gal**, rounded from the
  [AAA LA/Long Beach average](https://gasprices.aaa.com/?state=CA) of $8.0968 on
  **November 14, 2026**. This is a fixed regional proxy, not a live price feed.
- Fuel cost = `(route miles / 6) * diesel price`.
- Tailpipe CO₂ = `(route miles / 6) * 10.18 kg`, using the
  [EPA diesel combustion factor](https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references).
  Fuel production and idling are excluded.

Search and routing use the server-only `ARCGIS_KEY`; enable geocoding and routing
privileges. The browser uses `NEXT_PUBLIC_ARCGIS_API_KEY` only for the basemap.

### Location sources and limitations

- Warehouse locations use the ArcGIS World Geocoding service's **Warehouse** POI
  category. Names are replaced server-side with fictional demo aliases, stable
  for each location across search areas, destinations, and stops. Real street
  addresses and coordinates remain in use. Warehouse text filtering searches
  demo aliases and addresses. This is not a complete warehouse inventory.
- Destination and stop choices are ranked near their independently selected
  search areas and constrained to Southern California coordinates and
  California results. Stops are not restricted to the direct route corridor.
- Truck stops are prioritized over ordinary gas stations. Diesel availability
  and semi-truck access are not confirmed by the geocoder.
- There is no dedicated container-yard category in this geocoding API. Terminal
  name searches are filtered to relevant logistics types; coverage is limited.
  Use a known facility address if it is missing.
- Port coordinates are representative access points, not verified loading gates.
  The baseline uses ArcGIS's trucking restrictions with static `TruckMinutes`
  speeds, no departure time, no simulated barriers, and no stop reordering.
  Vehicle dimensions and loading/dwell time are not configured.

Research references:

- [ArcGIS geocoding categories](https://developers.arcgis.com/rest/geocode/category-filtering/)
- [ArcGIS route solve](https://developers.arcgis.com/rest/routing/route-service-direct/)
- [SoCal warehouse parcel layer](https://services.arcgis.com/o6oETlrWetREI1A2/ArcGIS/rest/services/SoCal_Warehouses_1980_2025/FeatureServer/0)
  was investigated but is not used for routing selections: it contains parcels,
  cities, and classifications, rather than business names and gate addresses.

## Diesel burden and community impact

The dataset is OEHHA's [CalEnviroScreen 4.0](https://oehha.ca.gov/calenviroscreen/maps-data).
It measures existing census-tract diesel PM burden, not this truck's emissions.
The local source is `data/calenviroscreen40shp_f_2021.shp/CES4 Final Shapefile.shp`.
`npx mapshaper <source> -info` confirmed these five fields: `DieselPM_P` (diesel
percentile), `CIscoreP` (overall percentile), `TotPop19` (population), `County`,
and `Tract`. Negative/null numeric values are missing.

`public/ces.geojson` contains 3,747 tracts in Los Angeles, Orange, Riverside,
and San Bernardino counties, reprojected from NAD83 California Albers to WGS84.
It retains only those five properties, simplifies to 15% of vertices while keeping
shapes, and cleans overlaps/topology without filling gaps. The output is about
2.21 MB, below the 5 MB budget. Regenerate with:

```bash
npm run prepare:ces
# Or pass another CES4 source path:
npm run prepare:ces -- "/path/to/CES4 Final Shapefile.shp"
```

`lib/corridorBurden.ts` prefilters tract bounding boxes within a route envelope
expanded by 0.5 mi, samples at 0.1-mi interval midpoints with Turf `along`, and
checks tract containment including polygon holes. It calculates the
length-weighted diesel percentile, maximum percentile, miles in diesel/overall
percentiles >=75, and populations of unique tracts crossed (including a separate
DAC population). A partial final interval uses its actual length, so short routes
are not rounded up to 0.1 mi. Samples outside coverage or with missing diesel
values are excluded. Populations represent entire unique tracts, not a count of
people directly exposed along the road. DAC is the overall-score top quartile
approximation, rather than the full SB 535 designation list.

Multipart paths are sampled without connecting their gaps. Tract indexes are
reused, and up to 128 results per dataset are memoized by geometry. The server
loads the prepared data once and computes impact after the final solve, including
arrival-deadline routing. Saved trips carry `route.communityImpact`; older local
snapshots are backfilled when loaded. Day totals sum the saved high-diesel/DAC
miles and update on add/remove. Repeated trips count their mileage again.

Both maps have an initially enabled **Diesel burden** GeoJSONLayer beneath route
graphics, at 35% opacity. Below 50/no-data tracts are transparent; 50–<75 is light
orange, 75–<90 orange, and >=90 dark red-orange. The toggle and legend remain
available, but tract popups are disabled and their popup template is removed.
Both map views disable popups. The planner hit-tests only its dedicated route
graphics layer; tract and basemap clicks do nothing. Route fitting includes
that layer and the numbered stop graphics.

Run focused missing-data, sampling, unique-population, coverage, caching, data
validation, and 70-mile performance checks on Node 22+:

```bash
npm run test:burden
```

## Routing experiment

Run the standalone ArcGIS routing experiment from the repository root:

```bash
node --env-file=.env test.js
# or
npm run test:arcgis
```

The root `.env` must contain `ARCGIS_KEY`. The script prints baseline,
departure-time, closure, and crash-barrier results in the terminal.

## Comparing route candidates

The reference depends on context. With an actual closure, slowdown/crash, or rain,
**Original plan** is the planned static truck route before simulated disruptions.
It is drawn thin, dashed gray underneath the candidate lines; full closures add
solid red segments at the blocked stretches. **Keep original plan** is available
in this context without a full closure, and for saving the initial original plan.

With zero active disruptions, only the original plan’s absolute metrics are shown.
There are no candidate searches, deltas, or Who’s affected comparison block, and
the original route is drawn solid blue. Saving leaves departure/arrival unset.

With only a departure time or arrival deadline, the reference is **Fastest**,
the minimum-time current candidate.
The comparison reads **Fastest vs. Route D**, and no dashed original-plan overlay
is drawn. A real event changes it to **Original plan vs. Route B**. Under the current conditions, the server searches
for up to six distinct valid choices: fastest truck time, shortest truck distance, and
different freeway corridors. Corridor searches prioritize alternatives to the
fastest route's freeways with the most measured DAC miles. These are search
preferences, not extra simulated closures; the returned closure metadata only
contains the user's real constraints. All candidates preserve the same stops
and order, truck travel mode, slowdowns, weather, historical departure time, or
arrival deadline. Each must pass freeway-avoidance checks. Arrival-deadline
searches calculate a feasible departure separately for every option.

The solver does not invent routes or add scoring penalties to trip totals.
Every option's time and distance are actual ArcGIS network costs under the real
conditions. Near-duplicates (98% mutual overlap within roughly 0.06 mi) are
removed. Optional search failures retain verified results; if only one distinct
option exists, the UI says so instead of making copies. Request cancellation
applies to all searches. Recommendations rank all distinct candidates found:

- **Fastest:** minimum actual trip time.
- **Lowest community burden:** minimum miles through disadvantaged communities
  inside CES coverage, with faster time breaking ties. Unknown coverage is not
  treated as zero burden for recommendations.
- **Lowest emissions:** minimum estimated tailpipe CO₂ at the shared 6 mpg,
  equivalent to shortest distance under this demo model.

Routes are Pareto-filtered on actual time, DAC miles, and estimated emissions.
If another option is no worse on all three and strictly better on at least one,
the dominated option is hidden by default. Missing DAC data is incomparable, never
zero. After Pareto filtering, routes within 2 min AND 1.0 DAC mi are merged,
keeping the faster one. At most one untagged survivor gets **Balanced**, minimizing
`(time - minTime)/(maxTime - minTime) + (dacMi - minDac)/(maxDac - minDac)`;
a zero range contributes zero. No untagged survivor means no Balanced tag.
The default map caps this set at four, prioritizing the extrema and Balanced choice.
**Show all candidates (N)** reveals every distinct verified route, including those
marked Outperformed, near-duplicates merged from the default view, and any
frontier choices omitted by the display cap. Names
and colors stay stable across the toggle.

Pitch: “We hide routes that are worse on every measure, but you can always see them.”

Route options use only blue `#2563eb`, violet `#7c3aed`, teal `#0d9488`, and
slate `#334155`. Inactive routes are muted; the selected route uses its full color
at 6 px, on top of the other line overlays. Red is reserved for closure and
slowdown/crash stretches. The day-plan route overview uses the same palette.
Pills show time change from the current reference and absolute DAC miles, e.g.
**+29 min · 30.1 mi DAC**. Pills, community tags, and Pareto filtering use the same
absolute distance metric, not a percentage. Click a route line, its
pill, or a priority tag button to switch the comparison. There is no comparison
route dropdown.
Selection preserves the viewport. New candidate sets fit all routes. Pills are
offset with leader lines; placement avoids route strokes and other pills where
the available viewport allows. The selected pill has a light tint and colored outline.

**Use route A** (or the selected letter) saves exactly the selected geometry, metrics, schedule,
recommendation tags, and candidate identifier to Today’s Plan after the date
prompt. It also stores the company, driver, and resident trade-offs against the
current reference, at the chosen diesel price, and stores whether that reference
was Original plan or Fastest. Saved trip rows show those deltas;
Who’s affected today shows absolute saved fuel cost, total driving minutes, and
truck miles through disadvantaged communities. Removing a trip updates the totals.
Older alternate trips without a trade-off snapshot show unavailable instead of
inventing a reference. Editing restores the choice when it is still among the available routes;
changing conditions resets selection to the fastest current choice.

```bash
npm run test:candidates
```

Comparison noise thresholds: changes below $0.50 fuel, 0.5 mi, 1 kg CO₂, 1 min,
or 0.5 percentile points display **No change** in gray. This applies to the table,
Who’s affected, route-pill time changes, and saved decision summaries. Stored raw
metrics, absolute values, and daily totals are unchanged.

## Local AI route explanations

Run LM Studio with `bolt-instruct-v2` loaded and its model server on port 1234.
The server-only `.env` settings are `LLM_BASE_URL=http://localhost:1234/v1` and
`LLM_MODEL=bolt-instruct-v2`; both have these defaults. The Next.js server must
be able to reach that address. No browser model key or cloud service is used.

`POST /api/explain` accepts the rounded original/reference and selected route
metrics plus active disruption labels. Ordered freeway IDs come from ArcGIS
route directions. It sends no addresses, stop coordinates, geometry, or tools.
The AI line appears directly below the comparison subtitle with an AI tooltip;
original-plan-only mode has no AI line. In a Fastest comparison, the original
field holds the visible Fastest reference so the explanation matches the table.

Calls use the OpenAI SDK with `stream: true`, temperature 0, max_tokens 80,
a 15-second timeout, and no retries. `/api/explain` forwards plain UTF-8 text
chunks; the client appends them with a blinking caret until completion.
Bolt's Muse/ATEM template otherwise spends this small budget in its reasoning
channel, so Bolt uses an explicit `assistant to=user` answer prefill through
LM Studio's [OpenAI-compatible completions endpoint](https://lmstudio.ai/docs/developer/openai-compat/completions).
The format follows the published [Muse chat template](https://huggingface.co/meta-models/Muse-Glimmer-30B/blob/main/chat_template.jinja).
Other model IDs use `/chat/completions`. Global LM Studio model settings are not changed.

Post-processing strips markup and reasoning blocks, keeps the first sentence,
and rejects sentences longer than 30 words, unknown road
IDs, or numbers (including written numbers) absent from the rounded input.
Computed deltas not supplied in the input are rejected as well. The prompt asks
for qualitative trade-offs to avoid manufacturing those numbers. Invalid/empty
responses silently hide the line; failed number checks fade out over 200 ms.
Connection errors/timeouts close the stream without error text.

Selection/constraint changes debounce for 400 ms and abort older requests. A
session-memory cache keeps up to 128 final sentences or hidden results; returning to a cached
route renders immediately without a caret. Keys include route ID, sorted disruption fingerprint,
departure time, and input metrics so fuel-price and reference changes invalidate
stale sentences. Completed empty streams are cached as hidden. Browser transport
failures are not cached, allowing a later selection to retry. Reduced-motion
settings disable the shimmer and caret blink.

```bash
npm run test:explain
```

## Local day summary

Today’s Plan streams a 2–3 sentence manager summary from the local Bolt server
when the selected date has saved trips with complete community metrics and a
saved comparison against the fastest route. New saves capture that comparison;
older snapshots without it leave the card hidden until edited and saved again.
`POST /api/day-summary` receives rounded day totals, fastest-route trade-offs,
route labels, and disruption labels. The browser caches validated summaries by
input hash, so edits, additions, and removals regenerate them. The existing
numeric guard hides sentences containing numbers absent from the input. An
offline or timed-out model leaves the day summary hidden while the plan works.

```bash
npm run test:day-summary
```

## Local dispatch assistant

The planner's left card has Disruptions and Assistant tabs. The header chat
button opens Assistant. Both tabs share the same disruption state and removable
chips. Chat and its undo stack exist only in memory for the current route;
nothing is saved to browser storage. Send with Enter, or Shift+Enter for a newline.

`POST /api/chat` uses the same server-only `LLM_BASE_URL` and `LLM_MODEL` settings
as explanations, via the OpenAI SDK's native tool calling, temperature 0, no
retries, and a 15-second model timeout. It rebuilds the original freeway list,
current complete disruption state, and shown route metrics into its system
prompt each turn. Tool requests return JSON; final replies are plain UTF-8 text
streams. At most two tool rounds run per user message, with tools disabled for
the final reply. No addresses or route geometry are sent to the model.

The tools are `get_route_freeways`, `set_disruptions`,
`reset_disruptions`, and `select_route`. Replacement and selection arguments are validated with Zod on the client;
freeway numbers must resolve to an original-plan freeway. Invalid batches apply
nothing. The same planner update action used by manual controls applies valid
changes; the assistant waits for the normal route calculation before sending
compact name/tag/time-delta/fuel-delta/DAC-mile results back to Bolt. Arrival-time
changes, selecting/saving routes, and unrelated requests are outside these tools.

Each successful assistant mutation inserts an Applied line and an Undo button.
Undo restores the exact prior controls, IDs, order, and values; undo the newest
change first to work back through the stack. Manual edits cancel an in-flight
assistant turn. Changing the route clears chat and aborts its pending work.
Model connection failures show “Local model offline. Use the Disruptions tab.”
The manual controls continue to work.

`select_route` translates a stated priority into a deterministic search over
**all** current candidates, including those hidden by the default map filter.
It can minimize disadvantaged-community miles, CO₂, time, or fuel cost, subject
to an extra-time limit, an extra-fuel-cost limit, and an arrival deadline.
Extra time and cost are measured against the original plan. An arrival deadline
uses the active departure time, or the current local time when none was set.
Ties resolve by time, then disadvantaged-community miles. A selected hidden
candidate becomes visible and its map line, comparison, and explanation update.
The chat shows a Selected line with Undo. If no candidate passes, the current
selection stays put and the model receives the closest candidate's failed
constraints. A single request can change disruptions in the first tool round
and choose from the recalculated candidates in the second.

```bash
npm run test:assistant
```
