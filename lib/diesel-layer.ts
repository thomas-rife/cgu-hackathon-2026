import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import { DIESEL_COLORS } from "./ces-config";

export function createDieselBurdenLayer() {
  return new GeoJSONLayer({
    id: "diesel-burden", title: "Diesel burden · CalEnviroScreen 4.0", url: "/ces.geojson",
    copyright: "OEHHA · CalEnviroScreen 4.0", opacity: 0.35,
    outFields: ["DieselPM_P", "CIscoreP", "TotPop19", "County", "Tract"],
    renderer: {
      type: "unique-value",
      valueExpression: "var d = $feature.DieselPM_P; if (IsEmpty(d) || d < 50) { return 'clear'; } if (d < 75) { return '50'; } if (d < 90) { return '75'; } return '90';",
      defaultSymbol: { type: "simple-fill", color: [0, 0, 0, 0], outline: { color: [0, 0, 0, 0], width: 0 } },
      uniqueValueInfos: [
        { value: "50", label: "50–<75", symbol: { type: "simple-fill", color: DIESEL_COLORS.low, outline: { color: [0, 0, 0, 0], width: 0 } } },
        { value: "75", label: "75–<90", symbol: { type: "simple-fill", color: DIESEL_COLORS.medium, outline: { color: [0, 0, 0, 0], width: 0 } } },
        { value: "90", label: "90–100", symbol: { type: "simple-fill", color: DIESEL_COLORS.high, outline: { color: [0, 0, 0, 0], width: 0 } } },
      ],
    },
    popupEnabled: false,
  });
}
