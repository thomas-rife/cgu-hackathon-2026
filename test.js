const KEY = process.env.ARCGIS_KEY;
const URL =
  "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World/solve";

// Approximate coords: Port of LA -> Ontario. Swap in real ones later.
const stops = "-118.2716,33.7405;-117.5931,34.0633";

async function solve(extra = {}) {
  const p = new URLSearchParams({
    f: "json",
    token: KEY,
    stops,
    outSR: "4326",
    returnDirections: "false",
    ...extra,
  });
  const r = await fetch(URL, { method: "POST", body: p });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  const a = j.routes.features[0].attributes;
  return {
    min: a.Total_TravelTime?.toFixed(1),
    mi: a.Total_Miles?.toFixed(1),
    geom: j.routes.features[0].geometry,
  };
}

// 1. Baseline
const base = await solve();
console.log("baseline", base.min, "min", base.mi, "mi");

// 2. Traffic: 3am vs 7:30am (next weekday). Different times = historical traffic works.
const at = (h, m) => {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
console.log("3:00am", (await solve({ startTime: at(3, 0) })).min, "min");
console.log("7:30am", (await solve({ startTime: at(7, 30) })).min, "min");

// 3. Closure: block a point in the middle of the baseline route. Route should change.
const path = base.geom.paths[0];
const [x, y] = path[Math.floor(path.length / 2)];
const closed = await solve({
  barriers: JSON.stringify({
    features: [{ geometry: { x, y }, attributes: { BarrierType: 0 } }],
  }),
});
console.log("closure", closed.min, "min", closed.mi, "mi");

// 4. Slowdown (crash): added-cost barrier, +45 min at that point. Verify against docs if it errors.
const slowed = await solve({
  barriers: JSON.stringify({
    features: [
      {
        geometry: { x, y },
        attributes: { BarrierType: 2, Attr_TravelTime: 45 },
      },
    ],
  }),
});
console.log("crash slowdown", slowed.min, "min", slowed.mi, "mi");
