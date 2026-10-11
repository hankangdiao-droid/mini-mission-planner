import type { Point, Settings, ModelId, Plan, Waypoint, Issue } from "./types";
import { aircraft, cameraFootprint } from "./profiles";
import {
  projection,
  pointValid,
  distance,
  area,
  selfIntersects,
  offsetLine,
  sampleSegment,
  nearest,
  bearing,
  rad,
} from "./geometry";

export function plan(
  points: Point[],
  settings: Settings,
  model: ModelId,
): Plan {
  const out: Plan = {
    waypoints: [],
    issues: [],
    area: 0,
    spacing: { along: 0, across: 0 },
  };
  const issue = (
    code: string,
    zh: string,
    en: string,
    level: Issue["level"] = "error",
  ) => out.issues.push({ code, zh, en, level });
  const a = aircraft[model];
  if (!a) {
    issue("MODEL", "未知机型", "Unknown aircraft");
    return out;
  }
  if (!["survey", "facade", "orbit"].includes(settings.mode)) {
    issue("MODE", "未知规划模式", "Unknown planning mode");
    return out;
  }
  const bounded = (key: keyof Settings, lo: number, hi: number) => {
    const n = settings[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < lo || n > hi)
      issue(
        "PARAM",
        `${key} 应在 ${lo} 到 ${hi} 之间`,
        `${key} must be between ${lo} and ${hi}`,
      );
  };
  bounded("speed", 0.1, a.waypointSpeedMax);
  bounded("frontOverlap", 0, 95);
  bounded("sideOverlap", 0, 95);
  bounded("relativeHeightLimit", 1, 500);
  bounded("rthHeight", 5, 500);
  bounded("takeoffSecurityHeight", 1.2, 100);
  bounded("maxWaypoints", 2, 200);
  bounded("hoverEstimate", 0, 30);
  if (!Number.isInteger(settings.maxWaypoints))
    issue("LIMIT", "分段上限须为整数", "Part limit must be an integer");
  if (settings.mode === "facade") {
    bounded("distance", 2, 100);
    bounded("low", 1, 500);
    bounded("high", 1, 500);
    if (settings.high < settings.low)
      issue(
        "HEIGHT",
        "最高高度不能低于最低高度",
        "High must be greater than or equal to low",
      );
  } else {
    bounded("height", 1, 500);
    bounded("pitch", a.pitchMin, a.pitchMax);
  }
  if (settings.mode === "survey") bounded("angle", -180, 180);
  if (settings.mode === "orbit") {
    bounded("radius", 3, 500);
    bounded("turns", 1, 5);
    bounded("photoInterval", 1, 20);
    if (!Number.isInteger(settings.turns))
      issue("TURNS", "圈数须为整数", "Turns must be an integer");
  }
  const need =
    settings.mode === "survey" ? 3 : settings.mode === "facade" ? 2 : 1;
  if (points.length < need)
    issue(
      "POINTS",
      `请在地图上添加至少 ${need} 个点`,
      `Add at least ${need} points on the map`,
    );
  if (points.length > 500 || points.some((p) => !pointValid(p)))
    issue(
      "COORD",
      "坐标无效，纬度须在 ±80° 内，最多 500 个点",
      "Invalid coordinates: latitude within ±80°, at most 500 points",
    );
  if (out.issues.length) return out;
  const pr = projection(points[0]),
    xy = points.map(pr.to);
  if (xy.some((p) => distance(xy[0], p) > 2000))
    issue(
      "SCOPE",
      "请将规划范围控制在首点 2 公里内",
      "Keep geometry within 2 km of the first point",
    );
  const closed = settings.mode === "survey";
  if (settings.mode !== "orbit") {
    const n = closed ? xy.length : xy.length - 1;
    for (let i = 0; i < n; i++)
      if (distance(xy[i], xy[(i + 1) % xy.length]) < 0.1) {
        issue(
          "DUPLICATE",
          "相邻点过近，请合并重复点",
          "Adjacent vertices are too close",
        );
        break;
      }
    if (selfIntersects(xy, closed))
      issue("CROSS", "边界自交，请调整绘制点", "Geometry intersects itself");
  }
  if (out.issues.length) return out;
  const footprint = cameraFootprint(
    a,
    settings.mode === "facade" ? settings.distance : settings.height,
  );
  const along = footprint.width * (1 - settings.frontOverlap / 100),
    across = footprint.height * (1 - settings.sideOverlap / 100);
  out.spacing = { along, across };
  const push = (
    p: { x: number; y: number },
    height: number,
    yaw: number,
    pitch: number,
  ) => {
    if (out.waypoints.length >= 10000)
      throw new Error(
        "航点超过 10000 个，请降低重叠率或缩小范围 / Too many waypoints",
      );
    out.waypoints.push({
      ...pr.from(p),
      height,
      yaw,
      pitch,
      speed: settings.speed,
      photo: true,
    });
  };
  try {
    if (settings.mode === "facade") {
      const offset = offsetLine(
        xy,
        settings.side === "left" ? settings.distance : -settings.distance,
      );
      if (selfIntersects(offset, false))
        throw new Error(
          "偏移后的立面航线自交，请拆分规划 / Offset path intersects itself",
        );
      const track: ReturnType<typeof sampleSegment> = [];
      for (let i = 1; i < offset.length; i++) {
        const segment = sampleSegment(offset[i - 1], offset[i], along).slice(i === 1 ? 0 : 1);
        if (track.length + segment.length > 10000) throw new Error('立面采样点过多 / Too many facade samples');
        track.push(...segment);
      }
      const count = Math.max(
        1,
        Math.ceil((settings.high - settings.low) / across),
      );
      const levels =
        settings.high === settings.low
          ? [settings.low]
          : Array.from(
              { length: count + 1 },
              (_, i) =>
                settings.low + ((settings.high - settings.low) * i) / count,
            );
      if (levels.length * track.length > 10000) throw new Error('航点超过 10000 个 / Too many waypoints');
      levels.forEach((h, layer) =>
        (layer % 2 ? [...track].reverse() : track).forEach((p) =>
          push(p, h, bearing(p, nearest(p, xy)), 0),
        ),
      );
      out.area =
        xy.slice(1).reduce((sum, p, i) => sum + distance(xy[i], p), 0) *
        (settings.high - settings.low);
    } else if (settings.mode === "orbit") {
      const count = Math.max(
        8,
        Math.ceil(
          (2 * Math.PI * settings.radius) /
            (settings.speed * settings.photoInterval),
        ),
      );
      for (let i = 0; i <= count * settings.turns; i++) {
        const angle = (2 * Math.PI * i) / count,
          p = {
            x: Math.sin(angle) * settings.radius,
            y: Math.cos(angle) * settings.radius,
          };
        push(p, settings.height, bearing(p, { x: 0, y: 0 }), settings.pitch);
      }
      out.spacing.along = settings.speed * settings.photoInterval;
      out.spacing.across = 0;
    } else {
      out.area = area(xy);
      if (out.area < 1) throw new Error("区域面积过小 / Area is too small");
      const s = Math.sin(rad(settings.angle)),
        c = Math.cos(rad(settings.angle));
      const rotated = xy.map((p) => ({
        x: p.x * s + p.y * c,
        y: p.x * c - p.y * s,
      }));
      const min = Math.min(...rotated.map((p) => p.y)),
        max = Math.max(...rotated.map((p) => p.y));
      const lines = Math.max(1, Math.ceil((max - min) / across));
      if (lines > 10000) throw new Error("扫描线过多 / Too many scan lines");
      for (let row = 0; row < lines; row++) {
        const v = min + ((row + 0.5) * (max - min)) / lines;
        const intersections: number[] = [];
        rotated.forEach((a, i) => {
          const b = rotated[(i + 1) % rotated.length];
          if ((a.y <= v && b.y > v) || (b.y <= v && a.y > v))
            intersections.push(a.x + ((v - a.y) / (b.y - a.y)) * (b.x - a.x));
        });
        intersections.sort((a, b) => a - b);
        const segments: Array<[number, number]> = [];
        for (let i = 0; i + 1 < intersections.length; i += 2)
          segments.push([intersections[i], intersections[i + 1]]);
        if (row % 2) segments.reverse();
        segments.forEach(([left, right]) => {
          const track = sampleSegment(
            { x: left, y: v },
            { x: right, y: v },
            along,
          );
          if (row % 2) track.reverse();
          track.forEach((p) =>
            push(
              { x: p.x * s + p.y * c, y: p.x * c - p.y * s },
              settings.height,
              (settings.angle + (row % 2 ? 180 : 0) + 360) % 360,
              settings.pitch,
            ),
          );
        });
      }
      issue(
        "CONNECTORS",
        "扫描线之间的连接段可能越出区域，请检查障碍物和通行空间",
        "Connecting legs can leave the polygon; inspect obstacles and clearance",
        "warning",
      );
      if (settings.pitch !== -90)
        issue(
          "OBLIQUE",
          "重叠率按垂直俯拍估算，斜拍需重新核验",
          "Overlap assumes nadir photography; verify oblique coverage",
          "warning",
        );
    }
  } catch (e) {
    out.waypoints = [];
    issue(
      "GEOMETRY",
      e instanceof Error ? e.message : "规划失败",
      e instanceof Error ? e.message : "Planning failed",
    );
  }
  const high = Math.max(...out.waypoints.map((p) => p.height));
  if (high > settings.relativeHeightLimit)
    issue(
      "CEILING",
      "航点超过设置的相对高度上限",
      "Waypoints exceed your relative height ceiling",
    );
  if (settings.rthHeight < high)
    issue(
      "RTH",
      "返航高度低于最高航点，请核验返航路径",
      "RTH height is below the highest waypoint; review the return path",
      "warning",
    );
  issue(
    "NO_MESH",
    "当前版本不检查三维障碍物、地形净空或空域许可",
    "This version does not check 3D obstacles, terrain clearance or airspace permission",
    "warning",
  );
  return out;
}

export function splitMission(points: Waypoint[], limit: number): Waypoint[][] {
  if (!Number.isInteger(limit) || limit < 2 || limit > 200)
    throw new Error("Invalid part limit");
  if (points.length < 2) throw new Error("At least two waypoints required");
  const parts: Waypoint[][] = [];
  let cursor = 0;
  while (cursor < points.length) {
    const anchor = cursor ? [{ ...points[cursor - 1], photo: false }] : [];
    const segment = points
      .slice(cursor, cursor + limit - anchor.length)
      .map((p) => ({ ...p }));
    parts.push([...anchor, ...segment]);
    cursor += segment.length;
  }
  return parts;
}

export function statistics(
  points: Waypoint[],
  hoverEstimate: number,
  home?: Point,
) {
  if (!points.length) return { length: 0, seconds: 0, photos: 0, approach: 0 };
  const pr = projection(points[0]);
  let length = 0,
    seconds = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(
      distance(pr.to(points[i - 1]), pr.to(points[i])),
      points[i].height - points[i - 1].height,
    );
    length += d;
    seconds += d / points[i].speed;
  }
  const photos = points.filter((p) => p.photo).length;
  const approach = home
    ? distance(pr.to(home), pr.to(points[0])) +
      distance(pr.to(home), pr.to(points[points.length - 1]))
    : 0;
  return {
    length,
    seconds: seconds + photos * hoverEstimate + approach / points[0].speed,
    photos,
    approach,
  };
}
