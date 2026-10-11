import type { Point } from "./types";
import { pointValid } from "./geometry";

export const defaultSearchEndpoint =
  "https://nominatim.openstreetmap.org/search";
export type Place = Point & {
  id: string;
  name: string;
  description: string;
  bounds?: [number, number, number, number];
};
export class PlaceSearchError extends Error {
  constructor(
    public code: "network" | "timeout" | "rate" | "response" | "settings",
  ) {
    super(code);
  }
}
const cache = new Map<string, Place[]>();
let lastRequest = 0;
const interval = 1100;

export function validateSearchEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PlaceSearchError("settings");
  }
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new PlaceSearchError("settings");
  return url;
}
function parsePlaces(data: unknown): Place[] {
  if (!Array.isArray(data)) throw new PlaceSearchError("response");
  return data.slice(0, 6).flatMap((p): Place[] => {
    if (
      !p ||
      typeof p.lat !== "string" ||
      typeof p.lon !== "string" ||
      !p.lat.trim() ||
      !p.lon.trim() ||
      typeof p.display_name !== "string"
    )
      return [];
    const point = { lng: Number(p.lon), lat: Number(p.lat) };
    if (!pointValid(point)) return [];
    const name = (
      typeof p.name === "string" && p.name
        ? p.name
        : p.display_name.split(",")[0]
    )
      .split(";")[0]
      .trim()
      .slice(0, 160);
    const address = p.address;
    const description =
      address && typeof address === "object"
        ? [
            ...new Set(
              [address.state, address.country]
                .filter((v): v is string => typeof v === "string")
                .map((v) => v.split(";")[0].trim())
                .filter((v) => v && v !== name),
            ),
          ].join(" · ")
        : "";
    let bounds: Place["bounds"];
    if (
      Array.isArray(p.boundingbox) &&
      p.boundingbox.length === 4 &&
      p.boundingbox.every(
        (v: unknown) =>
          typeof v === "string" && v.trim() && Number.isFinite(Number(v)),
      )
    ) {
      const [south, north, west, east] = p.boundingbox.map(Number);
      if (
        south >= -80 &&
        north <= 80 &&
        south < north &&
        west >= -180 &&
        east <= 180 &&
        west < east &&
        east - west < 180
      )
        bounds = [south, north, west, east];
    }
    return [
      {
        ...point,
        id: `${p.osm_type ?? "place"}-${p.osm_id ?? p.place_id ?? name}-${point.lng}-${point.lat}`,
        name,
        description: (description || p.display_name).slice(0, 300),
        bounds,
      },
    ];
  });
}

async function waitForSlot(signal: AbortSignal) {
  let previous = lastRequest;
  try {
    previous = Math.max(
      previous,
      Number(localStorage.getItem("mmp-geocoder-last-request")) || 0,
    );
  } catch {
    /* Storage is optional. */
  }
  // Ignore invalid/future storage timestamps instead of holding the UI indefinitely.
  previous = Math.min(previous, Date.now());
  const delay = interval - (Date.now() - previous);
  if (delay > 0)
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, delay);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  signal.throwIfAborted();
  lastRequest = Date.now();
  try {
    localStorage.setItem("mmp-geocoder-last-request", String(lastRequest));
  } catch {
    /* Optional. */
  }
}

export async function searchPlaces(
  query: string,
  english: boolean,
  endpoint: string,
  signal: AbortSignal,
): Promise<Place[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 160) return [];
  const url = validateSearchEndpoint(endpoint);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", english ? "en" : "zh-CN,en");
  const key = url.href;
  const run = async () => {
    signal.throwIfAborted();
    const found = cache.get(key);
    if (found) return found;
    await waitForSlot(signal);
    let response: Response;
    try {
      response = await fetch(url, {
        signal,
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new PlaceSearchError("network");
    }
    if (response.status === 429) throw new PlaceSearchError("rate");
    if (!response.ok) throw new PlaceSearchError("network");
    if (Number(response.headers.get("content-length")) > 1024 * 1024)
      throw new PlaceSearchError("response");
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new PlaceSearchError("response");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new PlaceSearchError("response");
    }
    const places = parsePlaces(data);
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, places);
    return places;
  };
  // Web Locks serialize requests across tabs of this local workbench.
  if (navigator.locks)
    return navigator.locks.request("mmp-geocoder", { signal }, run);
  return run();
}
