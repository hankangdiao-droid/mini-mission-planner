import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { Mission, Waypoint, ExportProfile } from "./types";
import { aircraft, validProfile } from "./profiles";
import { pointValid } from "./geometry";
import { statistics } from "./planner";

export const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const tag = (name: string, value: string | number) =>
  `<wpml:${name}>${xml(String(value))}</wpml:${name}>`;
export const signedYaw = (yaw: number) =>
  ((((yaw + 180) % 360) + 360) % 360) - 180;
export function filename(name: string) {
  let result = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  if (!result) result = "mission";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(result))
    result = "_" + result;
  return result;
}
export function validateMission(m: Mission) {
  const a = aircraft[m.model];
  if (!a || !validProfile(m.profile))
    throw new Error("机型或导出配置无效 / Invalid aircraft or export profile");
  if (m.waypoints.length < 2 || m.waypoints.length > 200)
    throw new Error(
      "每份任务须包含 2 到 200 个航点 / Each part requires 2–200 waypoints",
    );
  if (
    !Number.isFinite(m.rthHeight) ||
    m.rthHeight < 5 ||
    m.rthHeight > 500 ||
    !Number.isFinite(m.takeoffSecurityHeight) ||
    m.takeoffSecurityHeight < 1.2 ||
    m.takeoffSecurityHeight > 100
  )
    throw new Error("返航或起飞高度无效 / Invalid RTH or takeoff height");
  m.waypoints.forEach((p) => {
    if (
      !pointValid(p) ||
      !Number.isFinite(p.height) ||
      p.height < 1 ||
      p.height > 500 ||
      !Number.isFinite(p.yaw) ||
      !Number.isFinite(p.pitch) ||
      p.pitch < a.pitchMin ||
      p.pitch > a.pitchMax ||
      !Number.isFinite(p.speed) ||
      p.speed < 0.1 ||
      p.speed > a.waypointSpeedMax ||
      typeof p.photo !== "boolean"
    )
      throw new Error(
        "航点数据超出允许范围 / Waypoint values outside supported bounds",
      );
  });
}

export function buildKmz(m: Mission, now = Date.now()): Uint8Array {
  validateMission(m);
  const speed = m.waypoints[0].speed;
  const config = `<wpml:missionConfig>${tag("flyToWaylineMode", "safely")}${tag("finishAction", "goHome")}${tag("exitOnRCLost", "executeLostAction")}${tag("executeRCLostAction", "goBack")}${tag("takeOffSecurityHeight", m.takeoffSecurityHeight)}${tag("globalTransitionalSpeed", Math.min(speed, 5))}${tag("globalRTHHeight", m.rthHeight)}<wpml:droneInfo>${tag("droneEnumValue", m.profile.drone)}${tag("droneSubEnumValue", m.profile.droneSub)}</wpml:droneInfo><wpml:payloadInfo>${tag("payloadEnumValue", m.profile.payload)}${tag("payloadSubEnumValue", m.profile.payloadSub)}${tag("payloadPositionIndex", 0)}</wpml:payloadInfo></wpml:missionConfig>`;
  const document = (content: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="${m.profile.namespace}"><Document><name>${xml(m.name)}</name>${tag("author", "Mini Mission Planner")}${tag("createTime", now)}${tag("updateTime", now)}${config}${content}</Document></kml>`;
  const action = (i: number, p: Waypoint) =>
    `<wpml:actionGroup>${tag("actionGroupId", i)}${tag("actionGroupStartIndex", i)}${tag("actionGroupEndIndex", i)}${tag("actionGroupMode", "sequence")}<wpml:actionTrigger>${tag("actionTriggerType", "reachPoint")}</wpml:actionTrigger><wpml:action>${tag("actionId", 0)}${tag("actionActuatorFunc", "gimbalRotate")}<wpml:actionActuatorFuncParam>${tag("payloadPositionIndex", 0)}${tag("gimbalHeadingYawBase", "aircraft")}${tag("gimbalRotateMode", "absoluteAngle")}${tag("gimbalPitchRotateEnable", 1)}${tag("gimbalPitchRotateAngle", p.pitch)}${tag("gimbalRollRotateEnable", 0)}${tag("gimbalRollRotateAngle", 0)}${tag("gimbalYawRotateEnable", 0)}${tag("gimbalYawRotateAngle", 0)}${tag("gimbalRotateTimeEnable", 0)}${tag("gimbalRotateTime", 0)}</wpml:actionActuatorFuncParam></wpml:action>${p.photo ? `<wpml:action>${tag("actionId", 1)}${tag("actionActuatorFunc", "takePhoto")}<wpml:actionActuatorFuncParam>${tag("fileSuffix", `wp${String(i + 1).padStart(3, "0")}`)}${tag("payloadPositionIndex", 0)}${tag("payloadLensIndex", "wide")}${tag("useGlobalPayloadLensIndex", 0)}</wpml:actionActuatorFuncParam></wpml:action>` : ""}</wpml:actionGroup>`;
  const markers = m.waypoints
    .map(
      (p, i) =>
        `<Placemark><Point><coordinates>${p.lng.toFixed(8)},${p.lat.toFixed(8)}</coordinates></Point>${tag("index", i)}${tag("executeHeight", p.height)}${tag("waypointSpeed", p.speed)}<wpml:waypointHeadingParam>${tag("waypointHeadingMode", "smoothTransition")}${tag("waypointHeadingAngle", signedYaw(p.yaw))}${tag("waypointPoiPoint", "0,0,0")}${tag("waypointHeadingAngleEnable", 1)}${tag("waypointHeadingPathMode", "followBadArc")}</wpml:waypointHeadingParam><wpml:waypointTurnParam>${tag("waypointTurnMode", "toPointAndStopWithContinuityCurvature")}${tag("waypointTurnDampingDist", 0)}</wpml:waypointTurnParam>${tag("useStraightLine", 0)}<wpml:waypointGimbalHeadingParam>${tag("waypointGimbalPitchAngle", p.pitch)}${tag("waypointGimbalYawAngle", 0)}</wpml:waypointGimbalHeadingParam>${action(i, p)}</Placemark>`,
    )
    .join("");
  const stats = statistics(m.waypoints, 0);
  const folder = `<Folder>${tag("templateId", 0)}${tag("executeHeightMode", "relativeToStartPoint")}${tag("waylineId", 0)}${tag("distance", stats.length.toFixed(2))}${tag("duration", stats.seconds.toFixed(2))}${tag("autoFlightSpeed", speed)}${markers}</Folder>`;
  // Preserve the minimal template used by the original DJI Fly exporter. Native Fly validation is still required.
  const template = `<Folder>${tag("templateType", "waypoint")}${tag("templateId", 0)}<wpml:waylineCoordinateSysParam>${tag("coordinateMode", "WGS84")}${tag("heightMode", "relativeToStartPoint")}</wpml:waylineCoordinateSysParam>${tag("autoFlightSpeed", speed)}</Folder>`;
  return zipSync({
    "wpmz/template.kml": strToU8(document(template)),
    "wpmz/waylines.wpml": strToU8(document(folder)),
  });
}

function parseXml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error(
      "不允许 XML 实体或 DTD / XML entities and DTD are not allowed",
    );
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new Error("XML 格式无效 / Malformed XML");
  return doc;
}
function get(el: Document | Element, name: string) {
  return el.getElementsByTagNameNS("*", name)[0]?.textContent?.trim();
}
function number(el: Document | Element, name: string) {
  const text = get(el, name),
    value = text === undefined || text === "" ? NaN : Number(text);
  if (!Number.isFinite(value)) throw new Error(`Missing or invalid ${name}`);
  return value;
}
export function readReference(bytes: Uint8Array): {
  profile: ExportProfile;
  document: Document;
} {
  if (bytes.length > 5 * 1024 * 1024)
    throw new Error("KMZ 文件不得超过 5 MB / KMZ exceeds 5 MB");
  const files = unzipSync(bytes, {
    filter: (f) => {
      if (!["wpmz/template.kml", "wpmz/waylines.wpml"].includes(f.name))
        return false;
      if (f.originalSize > 8 * 1024 * 1024)
        throw new Error("XML 解压大小过大 / XML exceeds decompression limit");
      return true;
    },
  });
  if (!files["wpmz/waylines.wpml"] || !files["wpmz/template.kml"])
    throw new Error("缺少 WPML 或模板文件 / Missing WPML or template");
  const document = parseXml(strFromU8(files["wpmz/waylines.wpml"]));
  parseXml(strFromU8(files["wpmz/template.kml"]));
  const namespace =
    document.getElementsByTagNameNS("*", "missionConfig")[0]?.namespaceURI ??
    "";
  const profile: ExportProfile = {
    namespace,
    drone: number(document, "droneEnumValue"),
    droneSub: number(document, "droneSubEnumValue"),
    payload: number(document, "payloadEnumValue"),
    payloadSub: number(document, "payloadSubEnumValue"),
    source: "User-supplied DJI Fly reference task",
  };
  if (!validProfile(profile))
    throw new Error("不支持的导出配置 / Unsupported export profile");
  return { profile, document };
}

export function importMission(
  bytes: Uint8Array,
  model: Mission["model"],
): Mission {
  const { profile, document } = readReference(bytes);
  if (
    document.getElementsByTagNameNS("*", "Folder").length !== 1 ||
    get(document, "executeHeightMode") !== "relativeToStartPoint"
  )
    throw new Error(
      "仅支持单航线、相对起飞点高度的任务 / Only a single route with relative-to-takeoff heights is supported",
    );
  const nodes = Array.from(document.getElementsByTagNameNS("*", "Placemark"));
  const waypoints = nodes.map((el, i): Waypoint => {
    if (number(el, "index") !== i)
      throw new Error("航点索引不连续 / Nonsequential waypoint indices");
    const coords = (get(el, "coordinates") ?? "")
      .split(",")
      .map((v) => v.trim());
    if (coords.length < 2 || coords.slice(0, 2).some((v) => v === ""))
      throw new Error("Invalid coordinate text");
    const funcs = Array.from(
      el.getElementsByTagNameNS("*", "actionActuatorFunc"),
    ).map((n) => n.textContent);
    if (funcs.some((f) => !["gimbalRotate", "takePhoto"].includes(f ?? "")))
      throw new Error(
        "任务包含未支持的动作 / Mission contains unsupported actions",
      );
    const groups = Array.from(el.getElementsByTagNameNS("*", "actionGroup"));
    if (
      groups.length !== 1 ||
      get(groups[0], "actionTriggerType") !== "reachPoint" ||
      get(groups[0], "actionGroupMode") !== "sequence" ||
      number(groups[0], "actionGroupStartIndex") !== i ||
      number(groups[0], "actionGroupEndIndex") !== i ||
      !["gimbalRotate", "gimbalRotate,takePhoto"].includes(funcs.join(","))
    )
      throw new Error(
        "未支持的动作顺序或触发条件 / Unsupported action order or trigger",
      );
    if (
      get(el, "waypointTurnMode") !== "toPointAndStopWithContinuityCurvature" ||
      number(el, "waypointTurnDampingDist") !== 0 ||
      get(el, "useStraightLine") !== "0"
    )
      throw new Error("未支持的转弯配置 / Unsupported turn configuration");
    if (
      get(el, "gimbalRotateMode") !== "absoluteAngle" ||
      get(el, "gimbalPitchRotateEnable") !== "1" ||
      get(el, "gimbalRollRotateEnable") !== "0" ||
      get(el, "gimbalYawRotateEnable") !== "0" ||
      get(el, "gimbalRotateTimeEnable") !== "0" ||
      number(el, "payloadPositionIndex") !== 0
    )
      throw new Error("未支持的云台动作 / Unsupported gimbal action");
    if (
      Math.abs(
        number(el, "gimbalPitchRotateAngle") -
          number(el, "waypointGimbalPitchAngle"),
      ) > 0.001
    )
      throw new Error(
        "云台动作与航点俯仰不一致 / Gimbal action and waypoint pitch differ",
      );
    if (get(el, "waypointHeadingMode") !== "smoothTransition")
      throw new Error(
        "仅支持显式机头朝向 / Only explicit waypoint heading is supported",
      );
    return {
      lng: Number(coords[0]),
      lat: Number(coords[1]),
      height: number(el, "executeHeight"),
      speed: number(el, "waypointSpeed"),
      yaw: number(el, "waypointHeadingAngle"),
      pitch: number(el, "waypointGimbalPitchAngle"),
      photo: funcs.includes("takePhoto"),
    };
  });
  const mission: Mission = {
    name: get(document, "name") ?? "Imported task",
    model,
    profile,
    waypoints,
    rthHeight: number(document, "globalRTHHeight"),
    takeoffSecurityHeight: number(document, "takeOffSecurityHeight"),
  };
  validateMission(mission);
  return mission;
}
