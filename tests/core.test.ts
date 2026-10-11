import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { defaults } from "../src/core/types";
import type { Mission, Settings } from "../src/core/types";
import { aircraft, cameraFootprint } from "../src/core/profiles";
import { plan, splitMission, statistics } from "../src/core/planner";
import { projection, distance } from "../src/core/geometry";
import {
  buildKmz,
  importMission,
  filename,
  readReference,
} from "../src/core/kmz";
import { parseProject, geometryFromGeoJson } from "../src/core/project";
import { osm, validateBasemap } from "../src/core/basemap";

const line = [
  { lng: 0, lat: 0 },
  { lng: 0.001, lat: 0 },
];
const polygon = [...line, { lng: 0.001, lat: 0.001 }, { lng: 0, lat: 0.001 }];
const s = (patch: Partial<Settings> = {}): Settings => ({
  ...defaults,
  ...patch,
});
const mission = (): Mission => ({
  name: "A&B <test>",
  model: "mini5pro",
  profile: aircraft.mini5pro.profile,
  waypoints: plan(line, s(), "mini5pro").waypoints.slice(0, 30),
  rthHeight: 60,
  takeoffSecurityHeight: 15,
});
const xmlFile = (bytes: Uint8Array) =>
  strFromU8(unzipSync(bytes)["wpmz/waylines.wpml"]);

describe("geometry and profiles", () => {
  it("projects and reverses WGS84 at mid latitude", () => {
    const p = { lng: 110, lat: 35 },
      pr = projection(p),
      q = { lng: 110.001, lat: 35.002 };
    expect(pr.from(pr.to(q))).toEqual(q);
  });
  it("infers 4:3 footprint from assumed diagonal FOV", () => {
    const f = cameraFootprint(aircraft.mini4pro, 8);
    expect(f.width / f.height).toBeCloseTo(4 / 3);
    expect(f.width).toBeGreaterThan(10);
  });
  it("Mini 4 and Mini 5 have distinct pitch caps", () => {
    expect(aircraft.mini4pro.pitchMax).toBe(60);
    expect(aircraft.mini5pro.pitchMax).toBe(55);
  });
});
describe("planning", () => {
  it.each(["mini4pro", "mini5pro"] as const)("plans facade for %s", (model) => {
    const p = plan(line, s(), model);
    expect(p.issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(p.waypoints.length).toBeGreaterThan(20);
    const pr = projection(line[0]);
    expect(distance(pr.to(p.waypoints[0]), pr.to(line[0]))).toBeCloseTo(8);
    expect(p.waypoints[0].yaw).toBeCloseTo(0);
    expect(p.waypoints.every((p) => p.pitch === 0)).toBe(true);
    expect(Math.max(...p.waypoints.map((p) => p.height))).toBe(24);
  });
  it("left side faces south", () => {
    const p = plan(line, s({ side: "left" }), "mini5pro");
    expect(p.waypoints[0].yaw).toBeCloseTo(180);
  });
  it("equal heights create one layer", () => {
    const p = plan(line, s({ high: 8 }), "mini5pro");
    expect(new Set(p.waypoints.map((p) => p.height))).toEqual(new Set([8]));
  });
  it("generates survey within rectangle", () => {
    const p = plan(polygon, s({ mode: "survey" }), "mini5pro");
    expect(p.waypoints.length).toBeGreaterThan(10);
    expect(
      p.waypoints.every(
        (q) =>
          q.lng >= -1e-8 && q.lng <= 0.00100001 && q.lat >= 0 && q.lat <= 0.001,
      ),
    ).toBe(true);
    expect(p.area).toBeGreaterThan(12000);
  });
  it("handles a concave survey polygon", () => {
    const p = plan(
      [
        { lng: 0, lat: 0 },
        { lng: 0.001, lat: 0 },
        { lng: 0.001, lat: 0.001 },
        { lng: 0.0005, lat: 0.0004 },
        { lng: 0, lat: 0.001 },
      ],
      s({ mode: "survey", angle: 30 }),
      "mini4pro",
    );
    expect(p.waypoints.length).toBeGreaterThan(5);
    expect(p.issues.some((i) => i.level === "error")).toBe(false);
  });
  it("orbit closes and looks inward", () => {
    const p = plan([line[0]], s({ mode: "orbit", pitch: -30 }), "mini5pro");
    expect(p.waypoints[0].yaw).toBeCloseTo(180);
    expect(p.waypoints[0].lng).toBeCloseTo(p.waypoints.at(-1)!.lng);
    expect(p.waypoints[0].lat).toBeCloseTo(p.waypoints.at(-1)!.lat);
  });
  it.each([
    { speed: NaN },
    { speed: 0 },
    { frontOverlap: 100 },
    { low: 25, high: 20 },
    { distance: 0 },
    { maxWaypoints: 2.5 },
  ])("rejects invalid parameters %o", (patch) => {
    const p = plan(line, s(patch), "mini5pro");
    expect(p.waypoints).toHaveLength(0);
    expect(p.issues.some((i) => i.level === "error")).toBe(true);
  });
  it("rejects duplicate adjacent vertices", () => {
    expect(
      plan([line[0], line[0]], s(), "mini5pro").issues.some(
        (i) => i.code === "DUPLICATE",
      ),
    ).toBe(true);
  });
  it("rejects self intersection", () => {
    expect(
      plan(
        [polygon[0], polygon[2], polygon[1], polygon[3]],
        s({ mode: "survey" }),
        "mini5pro",
      ).issues.some((i) => i.code === "CROSS"),
    ).toBe(true);
  });
  it("rejects acute reversal", () => {
    expect(
      plan(
        [line[0], line[1], { lng: 0, lat: 0.000001 }],
        s(),
        "mini5pro",
      ).issues.some((i) => i.level === "error"),
    ).toBe(true);
  });
  it("rejects dateline crossing and large extents", () => {
    expect(
      plan(
        [
          { lng: 179.999, lat: 0 },
          { lng: -179.999, lat: 0 },
        ],
        s(),
        "mini5pro",
      ).issues.some((i) => i.code === "SCOPE"),
    ).toBe(true);
  });
  it("flags relative ceiling independently from RTH", () => {
    const p = plan(
      line,
      s({ relativeHeightLimit: 10, rthHeight: 15 }),
      "mini5pro",
    );
    expect(p.issues.some((i) => i.code === "CEILING")).toBe(true);
    expect(p.issues.some((i) => i.code === "RTH")).toBe(true);
  });
  it("budgets dense requests", () => {
    const p = plan(
      [
        { lng: 0, lat: 0 },
        { lng: 0.015, lat: 0 },
      ],
      s({ distance: 2, high: 500, frontOverlap: 95, sideOverlap: 95 }),
      "mini5pro",
    );
    expect(p.waypoints).toHaveLength(0);
    expect(p.issues.some((i) => i.code === "GEOMETRY")).toBe(true);
  });
});
describe("splitting and estimates", () => {
  it.each([2, 3, 7, 99, 200])(
    "keeps source photos exactly once, limit %i",
    (limit) => {
      const source = Array.from({ length: 222 }, (_, i) => ({
        ...mission().waypoints[0],
        lng: i * 0.000001,
      }));
      const parts = splitMission(source, limit);
      expect(parts.every((p) => p.length >= 2 && p.length <= limit)).toBe(true);
      expect(
        parts
          .flat()
          .filter((p) => p.photo)
          .map((p) => p.lng),
      ).toEqual(source.map((p) => p.lng));
      parts.slice(1).forEach((p, i) => {
        expect(p[0].photo).toBe(false);
        expect(p[0].lng).toBe(parts[i].at(-1)!.lng);
      });
    },
  );
  it("counts vertical travel and dwell", () => {
    const p = mission().waypoints[0],
      stats = statistics([p, { ...p, height: p.height + 10 }], 2);
    expect(stats.length).toBe(10);
    expect(stats.seconds).toBe(9);
    expect(stats.photos).toBe(2);
  });
});
describe("KMZ", () => {
  it.each(["mini4pro", "mini5pro"] as const)(
    "round trips supported fields for %s",
    (model) => {
      const m = { ...mission(), model, profile: aircraft[model].profile };
      m.waypoints[1].photo = false;
      m.waypoints[2].speed = 3;
      const bytes = buildKmz(m, 1234),
        imported = importMission(bytes, model);
      expect(imported.name).toBe(m.name);
      expect(imported.waypoints.length).toBe(m.waypoints.length);
      expect(imported.waypoints[1].photo).toBe(false);
      expect(imported.waypoints[2].speed).toBe(3);
      expect(imported.profile.namespace).toBe(m.profile.namespace);
      const text = xmlFile(bytes);
      expect(text).toContain("A&amp;B &lt;test&gt;");
      expect(text).toContain("<wpml:executeRCLostAction>goBack");
      expect(text).not.toContain("NaN");
    },
  );
  it("exports signed heading and actual distance", () => {
    const m = mission();
    m.waypoints[0].yaw = 270;
    const text = xmlFile(buildKmz(m));
    expect(text).toContain("<wpml:waypointHeadingAngle>-90");
    expect(text).not.toContain("<wpml:distance>0</");
  });
  it("does not clamp invalid waypoint inputs", () => {
    const m = mission();
    m.waypoints[0].pitch = 56;
    expect(() => buildKmz(m)).toThrow();
    m.waypoints[0].pitch = 0;
    m.waypoints[0].speed = Infinity;
    expect(() => buildKmz(m)).toThrow();
  });
  it("rejects invalid profile namespace", () => {
    const m = mission();
    m.profile = { ...m.profile, namespace: '" onload="bad' };
    expect(() => buildKmz(m)).toThrow();
  });
  it("rejects malformed, oversized or incomplete input", () => {
    expect(() => readReference(new Uint8Array(6 * 1024 * 1024))).toThrow();
    expect(() => readReference(zipSync({ other: strToU8("x") }))).toThrow();
  });
  it("rejects XML entities", () => {
    const files = unzipSync(buildKmz(mission()));
    files["wpmz/waylines.wpml"] = strToU8(
      '<!DOCTYPE kml [<!ENTITY a "xx">]><kml/>',
    );
    expect(() => readReference(zipSync(files))).toThrow(/entities/);
  });
  it("rejects unsupported actions", () => {
    const files = unzipSync(buildKmz(mission()));
    files["wpmz/waylines.wpml"] = strToU8(
      strFromU8(files["wpmz/waylines.wpml"]).replace(
        "takePhoto",
        "startRecord",
      ),
    );
    expect(() => importMission(zipSync(files), "mini5pro")).toThrow(
      /unsupported actions/,
    );
  });
  it("rejects time-trigger photography instead of silently rewriting it", () => {
    const files = unzipSync(buildKmz(mission()));
    files["wpmz/waylines.wpml"] = strToU8(
      strFromU8(files["wpmz/waylines.wpml"]).replace(
        "reachPoint",
        "multipleTiming",
      ),
    );
    expect(() => importMission(zipSync(files), "mini5pro")).toThrow(/trigger/);
  });
  it.each(["CON", "NUL.txt", "A/B:C", " ", "ends."])(
    "sanitizes filename %s",
    (name) => {
      const f = filename(name);
      expect(f).not.toMatch(/[<>:"/\\|?*]/);
      expect(f).not.toMatch(/[. ]$/);
      expect(f).toBeTruthy();
    },
  );
});
describe("basemap configuration", () => {
  it("accepts standard OSM and local authorized tiles", () => {
    expect(() => validateBasemap(osm)).not.toThrow();
    expect(() =>
      validateBasemap({ ...osm, url: "http://127.0.0.1:9000/{z}/{x}/{y}.png" }),
    ).not.toThrow();
  });
  it.each([
    "javascript:alert(1)",
    "http://provider.example/{z}/{x}/{y}",
    "https://user:pass@example.com/{z}/{x}/{y}",
    "https://example.com/tile.png",
  ])("rejects invalid template %s", (url) => {
    expect(() => validateBasemap({ ...osm, url })).toThrow();
  });
});
describe("project and GeoJSON", () => {
  it("round trips a project", () => {
    const p = parseProject(
      JSON.stringify({
        version: 1,
        model: "mini5pro",
        name: "test",
        points: line,
        settings: defaults,
      }),
    );
    expect(p.points).toEqual(line);
    expect(p.settings).toEqual(defaults);
  });
  it("rejects untyped project settings", () => {
    expect(() =>
      parseProject(
        JSON.stringify({
          version: 1,
          model: "mini5pro",
          name: "test",
          points: line,
          settings: { ...defaults, speed: "2" },
        }),
      ),
    ).toThrow();
  });
  it("normalizes a closed polygon", () => {
    const g = geometryFromGeoJson(
      JSON.stringify({
        type: "Polygon",
        coordinates: [[...polygon, polygon[0]].map((p) => [p.lng, p.lat])],
      }),
    );
    expect(g.points).toEqual(polygon);
    expect(g.mode).toBe("survey");
  });
  it("rejects polygon holes", () => {
    expect(() =>
      geometryFromGeoJson(
        JSON.stringify({ type: "Polygon", coordinates: [[], []] }),
      ),
    ).toThrow();
  });
});
