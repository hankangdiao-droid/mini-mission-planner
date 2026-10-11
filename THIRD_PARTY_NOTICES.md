# Third-party notices

Runtime dependencies remain under their original licenses:

| Package | License | Source |
| --- | --- | --- |
| Vue | MIT | https://github.com/vuejs/core |
| Leaflet | BSD-2-Clause | https://github.com/Leaflet/Leaflet |
| fflate | MIT | https://github.com/101arrowz/fflate |

Their license texts are reproduced in `licenses/` from the installed packages. Development dependencies carry their own licenses in their npm packages.

OpenStreetMap data is attributed to its contributors, under ODbL. Tile service use is governed by https://operations.osmfoundation.org/policies/tiles/ . This application does not bulk-download, prefetch or offer offline tile packs. Tiles are opt-in and the standard browser cache applies. Their providers and network availability are external dependencies.

DJI, DJI Fly and aircraft names are trademarks of their respective owners. References to published specifications and community file-format evidence do not imply endorsement.

Format research references: `jedrula/dji-waypoints`, `dronnix-io/FlyPath`, `donkeylucky/DJI-KMZ-builder`. No implementation or fixture from these repositories is included. The minimal exporter structure derives from the author's existing CrackScope implementation; the browser planner and file handling were implemented for this project.
