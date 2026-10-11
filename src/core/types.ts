export type ModelId = "mini4pro" | "mini5pro";
export type Mode = "survey" | "facade" | "orbit";
export type Point = { lng: number; lat: number };
export type Waypoint = Point & {
  height: number;
  yaw: number;
  pitch: number;
  speed: number;
  photo: boolean;
};
export type ExportProfile = {
  namespace: string;
  drone: number;
  droneSub: number;
  payload: number;
  payloadSub: number;
  source: string;
};
export type Aircraft = {
  id: ModelId;
  name: string;
  diagonalFov: number;
  pitchMin: number;
  pitchMax: number;
  waypointSpeedMax: number;
  imageWidth: number;
  evidence: string;
  profile: ExportProfile;
  specsUrl: string;
};
export type Settings = {
  mode: Mode;
  height: number;
  low: number;
  high: number;
  distance: number;
  frontOverlap: number;
  sideOverlap: number;
  speed: number;
  angle: number;
  pitch: number;
  radius: number;
  turns: number;
  photoInterval: number;
  side: "left" | "right";
  relativeHeightLimit: number;
  rthHeight: number;
  takeoffSecurityHeight: number;
  maxWaypoints: number;
  hoverEstimate: number;
};
export type Issue = {
  level: "error" | "warning";
  code: string;
  zh: string;
  en: string;
};
export type Plan = {
  waypoints: Waypoint[];
  issues: Issue[];
  area: number;
  spacing: { along: number; across: number };
};
export type Mission = {
  name: string;
  model: ModelId;
  waypoints: Waypoint[];
  profile: ExportProfile;
  rthHeight: number;
  takeoffSecurityHeight: number;
};
export const defaults: Settings = {
  mode: "facade",
  height: 40,
  low: 8,
  high: 24,
  distance: 8,
  frontOverlap: 75,
  sideOverlap: 70,
  speed: 2,
  angle: 0,
  pitch: -90,
  radius: 25,
  turns: 1,
  photoInterval: 3,
  side: "right",
  relativeHeightLimit: 120,
  rthHeight: 60,
  takeoffSecurityHeight: 15,
  maxWaypoints: 99,
  hoverEstimate: 2,
};
