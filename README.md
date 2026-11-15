# FleetForward

**See the pollution and community impact behind every freight route.** FleetForward helps dispatchers compare truck routes around Los Angeles and Long Beach while keeping diesel pollution, estimated CO₂, and miles driven through disadvantaged communities visible alongside time and cost.

**Live demo:** [fleetforward-nine.vercel.app](https://fleetforward-nine.vercel.app)

## What it does

- Plan a trip from a port to a destination, with optional stops.
- Compare routes by travel time, fuel cost, estimated tailpipe CO₂, miles through high-diesel-burden tracts, and **DAC miles**: miles through disadvantaged communities.
- Explore how closures, slowdowns, departure times, and weather change those trade-offs.
- Save a route to **Today’s Plan** to see the day’s total miles, cost, CO₂, high-diesel miles, and DAC miles.

Truck routes come from ArcGIS. Community indicators come from [CalEnviroScreen 4.0](https://oehha.ca.gov/calenviroscreen/maps-data). DAC miles use tracts in the top quartile of its overall score as a demo approximation; diesel burden describes existing tract conditions, not pollution emitted by one truck. Fuel cost and CO₂ are estimates. Disruptions are simulated, and traffic uses historical patterns rather than live conditions.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Add ArcGIS keys to `.env` for server routing and the browser basemap, then open [localhost:3000](http://localhost:3000). The optional local AI assistant and summaries use the LM Studio settings in `.env.example`; route planning works without them.
