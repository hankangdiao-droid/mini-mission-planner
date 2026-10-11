# Mission workbench

Mode: Operate. Primary task: draw geometry, review a mission, export files.

The workspace has one narrow parameter column and a dominant map editor. Task sections are numbered, validation sits immediately before export, and route statistics anchor the map. Light and dark themes share semantic CSS variables and retain geometry colors, with darker/lighter contrast variants. No remote font or imagery dependency.

Geometry is brown/dashed, mission path blue, takeoff marker green. Danger and warning states use text and symbols in addition to color. Fields retain units, keyboard focus is visible, map-only input has coordinate-table alternatives. At narrow widths the map precedes the settings and the whole page scrolls.

No private campus map is used. Demo data is synthetic and explicitly labeled in the UI. OpenStreetMap loads online by default; the user can switch it off for the offline grid.

Initial view is Beijing with empty geometry; synthetic data is loaded only through the Demo button. Routine explanatory text is kept inside advanced settings and Compatibility & usage. Height datum remains beside the height parameters. Loading errors stay on the map. The export and file controls stay at the bottom of the desktop sidebar while parameters scroll independently. The mobile layout uses normal page scrolling.
