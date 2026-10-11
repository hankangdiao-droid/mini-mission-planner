# Mini Mission Planner

## Platform

Web application. A standalone extraction of the route-planning workflow in the user's CrackScope project.

## Users and purpose

DJI Mini 5 Pro and Mini 4 Pro users planning area photography, facade inspection or orbit photography on a computer. Generate, inspect and export waypoint KMZ files for manual transfer to DJI Fly.

## Constraints

No Java backend, MySQL, GPU or private model assets required. Geometry and file processing stay in the browser. Both aircraft need version-specific verification. Mini 5 Pro has project-level historical flight evidence, with firmware details not recorded. Mini 4 Pro is provisional until owner-provided native missions and flight tests establish compatibility.

Export heights are relative to the takeoff point. A route preview does not validate terrain, obstacles, satellite availability, authorization or the aircraft's actual curved trajectory. Demonstration geometry is synthetic. Published consumer WPML enums are community evidence, not official DJI Fly compatibility guarantees.

## Open decisions

Repository destination and public release approval will be resolved after the implementation is reviewable. Default proposed license: MIT for the author's code, with dependency notices retained.

## Appearance

User explicitly requests both light and dark themes with a toggle. Theme choice persists locally. The layout prioritizes map editing, parameter review and waypoint inspection.
