# cgu-hackathon-2026

Run the existing Next.js starter from the repository root:

```bash
npm --prefix dispatch install
npm run dev
```

Open http://localhost:3000. The app lives in `dispatch/`.

Run the standalone ArcGIS routing experiment from the repository root:

```bash
node --env-file=.env test.js
# or
npm run test:arcgis
```

The root `.env` must contain `ARCGIS_KEY`. The script prints baseline,
departure-time, closure, and crash-barrier results in the terminal.
