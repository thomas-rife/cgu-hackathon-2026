import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
const source = process.argv[2] || "data/calenviroscreen40shp_f_2021.shp/CES4 Final Shapefile.shp";
const args = ["--yes", "mapshaper", source,
  "-filter", '["Los Angeles","Orange","Riverside","San Bernardino"].includes(County)',
  "-filter-fields", "DieselPM_P,CIscoreP,TotPop19,County,Tract",
  "-each", "DieselPM_P=DieselPM_P==null||DieselPM_P<0?null:DieselPM_P; CIscoreP=CIscoreP==null||CIscoreP<0?null:CIscoreP; TotPop19=TotPop19==null||TotPop19<0?null:TotPop19",
  "-clean", "gap-width=0", "-proj", "wgs84", "-simplify", "15%", "keep-shapes", "-clean", "gap-width=0",
  "-o", "public/ces.geojson", "format=geojson", "precision=0.000001", "force"];
const result = spawnSync("npx", args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);
const bytes = statSync("public/ces.geojson").size;
if (bytes >= 5_000_000) throw new Error(`CES layer exceeds the 5 MB budget (${bytes} bytes).`);
console.log(`CES layer: ${(bytes / 1_000_000).toFixed(2)} MB`);
