# Mini Mission Planner

A local browser waypoint planning workbench for DJI Mini 5 Pro and Mini 4 Pro, developed from the author's CrackScope inspection workflow.

[中文](README.md) · [Compatibility](docs/COMPATIBILITY.md) · [DJI Fly transfer](docs/DJI-FLY.md)

**v0.1 is a technical preview. Neither aircraft has been flight-tested with this standalone release.** The original Mini 5 Pro system has historical flight experience; Mini 4 Pro settings follow community references. Neither establishes firmware compatibility for this release.

## Features

- Polygon survey with clipped sweep lines, open-polyline facade inspection and inward-facing orbits.
- Separate aircraft settings, pitch validation, geometry validation and waypoint limits.
- Independent mission parts, KMZ export, project JSON and simple GeoJSON import.
- Restricted waypoint KMZ import and enum calibration from a user-supplied native DJI Fly task.
- Chinese / English and persistent light / dark themes.
- Editable coordinates, drag handles, route preview and estimated distance/time.
- Submit a city/place search, choose a candidate and jump to its bounds without moving the mission. Chinese/English matching depends on the provider.
- OpenStreetMap tiles load by default with attribution; switch them off to use the offline grid.

No backend, database, GPU, map key or DJI developer account is required. This is not an official DJI application or a DJI Fly import API integration.

## Run

Node.js 22.12+:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5180`. Dependencies require internet for initial installation. After installation, planning works without online tiles.

```sh
npm run check
npm run scan
npx playwright install chromium
npm run test:e2e
```

Build with `npm run build`; serve `dist/` through a static HTTP server. The Pages workflow is manual and requires GitHub Pages configuration.

## Workflow and limits

Draw or import WGS84 geometry, choose aircraft and settings, inspect waypoints, calibrate enum values using your own native DJI Fly task, and export. Transfer via the manual placeholder-file workflow described in the Chinese guide. DJI Fly does not provide general KML route import in its official guide.

- Heights are relative to takeoff, not above terrain. There is no terrain, 3D collision, GNSS obstruction or legal airspace validation.
- Preview segments are straight; actual DJI Fly paths can curve and sweep connectors can leave a polygon.
- Coverage estimates assume diagonal FOV and a 4:3 image. Nadir assumptions do not validate oblique coverage.
- A 12 m/s cap is a conservative tool policy, not a Mini 5 Pro manufacturer waypoint specification.
- Parts default to 99 points with a configurable cap of 200. Version-specific review remains necessary. Parts are separate flights, not breakpoint resume.
- Dwell is an estimate only; exported actions are gimbal rotation and optional photography. Time estimates omit some climb, turn, wind and trajectory effects and do not guarantee battery endurance.
- KMZ import accepts only the limited relative-height, explicit-heading, single-route, point-action subset used here. Unsupported action semantics must be rejected rather than silently treated as equivalent.
- Project and KMZ files are processed locally. Enabling tiles sends viewport requests to OpenStreetMap.
- Place searches send query text to the selected service. The default public Nominatim endpoint is for this local preview: submit-only, no autocomplete, cached responses, at least 1.1 seconds between requests. Its one-request-per-second limit applies to the whole application; multi-user deployments need a suitable proxy/provider. Read the [usage policy](https://operations.osmfoundation.org/policies/nominatim/) and [search documentation](docs/PLACE-SEARCH.md).
- Demo geometry near 0° / 0° is synthetic and must never be flown.

MIT licensed. See dependency notices and primary sources in the documentation. Contributions and redacted compatibility evidence are welcome.
