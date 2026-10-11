import { defaults } from "./types";
import type { Settings, Point, ModelId, ExportProfile } from "./types";
import { pointValid } from "./geometry";
import { validProfile } from "./profiles";

export type Project = {
  version: 1;
  name: string;
  model: ModelId;
  points: Point[];
  settings: Settings;
  home?: Point;
  profile?: ExportProfile;
};
export function parseProject(text: string): Project {
  if (text.length > 1024 * 1024)
    throw new Error("项目文件超过 1 MB / Project exceeds 1 MB");
  const p = JSON.parse(text);
  if (
    !p ||
    p.version !== 1 ||
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    !["mini4pro", "mini5pro"].includes(p.model) ||
    !Array.isArray(p.points) ||
    p.points.length > 500 ||
    p.points.some((q: unknown) => !pointValid(q)) ||
    !p.settings
  )
    throw new Error("项目文件格式无效 / Invalid project format");
  const settings = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof Settings>) {
    const value = p.settings[key];
    if (
      typeof value !== typeof defaults[key] ||
      (typeof value === "number" && !Number.isFinite(value))
    )
      throw new Error(`Invalid ${key}`);
    Object.assign(settings, { [key]: value });
  }
  if (
    !["survey", "facade", "orbit"].includes(settings.mode) ||
    !["left", "right"].includes(settings.side) ||
    (p.home && !pointValid(p.home)) ||
    (p.profile && !validProfile(p.profile))
  )
    throw new Error("Invalid project options");
  return {
    version: 1,
    name: p.name,
    model: p.model,
    points: p.points.map((q: Point) => ({ lng: q.lng, lat: q.lat })),
    settings,
    home: p.home ? { lng: p.home.lng, lat: p.home.lat } : undefined,
    profile: p.profile,
  };
}
export function geometryFromGeoJson(text: string): {
  points: Point[];
  mode: Settings["mode"];
} {
  if (text.length > 1024 * 1024) throw new Error("GeoJSON exceeds 1 MB");
  const root = JSON.parse(text),
    g = root.type === "Feature" ? root.geometry : root;
  if (!g || !["Polygon", "LineString", "Point"].includes(g.type))
    throw new Error(
      "仅支持 Polygon、LineString 或 Point / Only Polygon, LineString or Point supported",
    );
  if (
    g.type === "Polygon" &&
    (!Array.isArray(g.coordinates) || g.coordinates.length !== 1)
  )
    throw new Error("暂不支持多环或孔洞 / Polygon holes are unsupported");
  const coordinates =
    g.type === "Point"
      ? [g.coordinates]
      : g.type === "Polygon"
        ? g.coordinates[0]
        : g.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length > 500)
    throw new Error("Invalid geometry");
  const points: Point[] = coordinates.map((c: unknown) => {
    if (!Array.isArray(c) || c.length < 2)
      throw new Error("Invalid coordinates");
    const p = { lng: c[0], lat: c[1] };
    if (!pointValid(p)) throw new Error("Invalid coordinates");
    return p;
  });
  if (
    g.type === "Polygon" &&
    points.length > 1 &&
    points[0].lng === points[points.length - 1].lng &&
    points[0].lat === points[points.length - 1].lat
  )
    points.pop();
  return {
    points,
    mode:
      g.type === "Polygon" ? "survey" : g.type === "Point" ? "orbit" : "facade",
  };
}
