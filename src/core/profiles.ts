import type { Aircraft, ModelId, ExportProfile } from "./types";

export const aircraft: Record<ModelId, Aircraft> = {
  mini4pro: {
    id: "mini4pro",
    name: "DJI Mini 4 Pro",
    diagonalFov: 82.1,
    pitchMin: -90,
    pitchMax: 60,
    waypointSpeedMax: 12,
    imageWidth: 4032,
    evidence:
      "Community mission format; not flight-tested in this release / 社区任务格式参考，本版本未真机实飞",
    profile: {
      namespace: "http://www.dji.com/wpmz/1.0.6",
      drone: 68,
      droneSub: 0,
      payload: 68,
      payloadSub: 0,
      source:
        "Community Mini 4 Pro mission references; verify against your own DJI Fly task.",
    },
    specsUrl: "https://www.dji.com/mini-4-pro/specs",
  },
  mini5pro: {
    id: "mini5pro",
    name: "DJI Mini 5 Pro",
    diagonalFov: 84,
    pitchMin: -90,
    pitchMax: 55,
    waypointSpeedMax: 12,
    imageWidth: 4096,
    evidence:
      "CrackScope flight experience; this extracted release still needs flight verification / 原项目有实飞经历，独立版本仍待实飞",
    profile: {
      namespace: "http://www.dji.com/wpmz/1.0.5",
      drone: 68,
      droneSub: 0,
      payload: 68,
      payloadSub: 0,
      source:
        "CrackScope Mini 5 Pro + DJI RC 2 exporter; firmware versions not recorded.",
    },
    specsUrl: "https://www.dji.com/au/mini-5-pro/specs",
  },
};

/** Manufacturer FOV is treated as diagonal, inferred from the 4:3 image format. */
export function cameraFootprint(model: Aircraft, distance: number) {
  const diagonal = 2 * distance * Math.tan((model.diagonalFov * Math.PI) / 360);
  return { width: (diagonal * 4) / 5, height: (diagonal * 3) / 5 };
}

export function validProfile(p: ExportProfile) {
  return (
    /^http:\/\/www\.dji\.com\/wpmz\/1\.0\.\d{1,2}$/.test(p.namespace) &&
    [p.drone, p.droneSub, p.payload, p.payloadSub].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 1000,
    ) &&
    p.drone > 0
  );
}
