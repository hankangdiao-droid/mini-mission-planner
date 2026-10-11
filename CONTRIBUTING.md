# Contributing

Please report a reproducible issue, the aircraft/controller/firmware/Fly versions, and whether the evidence is a file parse, application preview, or actual flight. Never submit private coordinates, photos, access keys or controller account data.

Use Node.js 22.12+, run `npm ci`, `npm run check`, `npm run scan`, and the browser tests after installing Playwright Chromium. Changes to exported WPML fields need a test and a documented version-specific reason. Do not convert community references into claims of official compatibility.

Core algorithms live in `src/core` and should be tested without a map or network. Keep demonstration geometry synthetic. Browser tests must mock external tiles rather than automate requests against public map services.
