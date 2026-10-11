export type Basemap = { url: string; attribution: string; maxZoom: number };
export const osm: Basemap = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
};
export function validateBasemap(map: Basemap) {
  if (
    typeof map.url !== "string" ||
    map.url.length > 2048 ||
    !["{z}", "{x}", "{y}"].every((v) => map.url.includes(v))
  )
    throw new Error(
      "底图地址须包含 {z}、{x}、{y} / Tile URL must contain {z}, {x}, {y}",
    );
  const replaced = map.url.replace(/\{[zxy]\}/g, "0").replace(/\{s\}/g, "a");
  const u = new URL(replaced);
  if (
    u.username ||
    u.password ||
    (u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      ))
  )
    throw new Error(
      "仅允许 HTTPS 或本机 HTTP 瓦片服务 / Only HTTPS or local HTTP tiles supported",
    );
  if (
    !Number.isInteger(map.maxZoom) ||
    map.maxZoom < 1 ||
    map.maxZoom > 22 ||
    typeof map.attribution !== "string" ||
    !map.attribution.trim() ||
    map.attribution.length > 300
  )
    throw new Error(
      "请填写底图归属及有效缩放上限 / Provide attribution and a valid maximum zoom",
    );
}
