<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref } from "vue";
import L from "leaflet";
import type { Point, Waypoint } from "../core/types";
import { pointValid } from "../core/geometry";
import { osm, validateBasemap } from "../core/basemap";
import type { Basemap } from "../core/basemap";
import { xml } from "../core/kmz";
const props = defineProps<{
  points: Point[];
  waypoints: Waypoint[];
  home?: Point;
  closed: boolean;
  dark: boolean;
  tool: "draw" | "home";
  online: boolean;
  english: boolean;
  basemap: Basemap;
}>();
const emit = defineEmits<{
  add: [Point];
  move: [number, Point];
  home: [Point];
  status: ["offline" | "loading" | "ready" | "partial" | "error"];
}>();
const container = ref<HTMLDivElement>();
let map: L.Map,
  shapes: L.LayerGroup,
  tiles: L.TileLayer | undefined,
  resize: ResizeObserver;
let timer: ReturnType<typeof setTimeout> | undefined;
function redraw() {
  if (!map) return;
  shapes.clearLayers();
  const routeColor = props.dark ? "#77b6ff" : "#185ec8";
  if (props.points.length && props.points.every(pointValid))
    L.polyline(
      [
        ...props.points,
        ...(props.closed && props.points.length > 2 ? [props.points[0]] : []),
      ].map((p) => [p.lat, p.lng] as L.LatLngTuple),
      {
        color: props.dark ? "#ffc981" : "#a6610d",
        weight: 2,
        dashArray: "5 5",
      },
    ).addTo(shapes);
  props.points.forEach((p, i) => {
    if (!pointValid(p)) return;
    const marker = L.marker([p.lat, p.lng], {
      draggable: true,
      icon: L.divIcon({
        className: "vertex",
        html: String(i + 1),
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).addTo(shapes);
    marker.on("dragend", () => {
      const ll = marker.getLatLng();
      emit("move", i, { lng: ll.lng, lat: ll.lat });
    });
  });
  if (props.waypoints.length) {
    L.polyline(
      props.waypoints.map((p) => [p.lat, p.lng] as L.LatLngTuple),
      { color: routeColor, weight: 2.5 },
    ).addTo(shapes);
    const step = Math.max(1, Math.ceil(props.waypoints.length / 600));
    props.waypoints.forEach((p, i) => {
      if (i % step === 0 || i === props.waypoints.length - 1) {
        const label = document.createElement("span");
        label.textContent = `${i + 1} · ${p.height.toFixed(1)} m · ${p.yaw.toFixed(0)}°`;
        L.circleMarker([p.lat, p.lng], {
          radius: 3,
          color: routeColor,
          weight: 1,
          fillOpacity: 0.8,
        })
          .bindTooltip(label)
          .addTo(shapes);
      }
    });
  }
  if (props.home)
    L.marker([props.home.lat, props.home.lng], {
      icon: L.divIcon({ className: "home-pin", html: "H", iconSize: [26, 26] }),
    }).addTo(shapes);
}
function fit() {
  if (!map) return;
  const points = [
    ...props.points,
    ...props.waypoints,
    ...(props.home ? [props.home] : []),
  ].filter(pointValid);
  if (points.length)
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)),
      { padding: [65, 65], maxZoom: 19 },
    );
}
function basemap() {
  if (!map) return;
  clearTimeout(timer);
  if (tiles) {
    map.removeLayer(tiles);
    tiles = undefined;
  }
  if (!props.online) {
    emit("status", "offline");
    return;
  }
  try {
    validateBasemap(props.basemap);
    const config = props.basemap;
    let errors = 0,
      loaded = 0;
    tiles = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
      attribution:
        config.url === osm.url
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          : xml(config.attribution),
    });
    tiles.on("loading", () => {
      errors = 0;
      loaded = 0;
      emit("status", "loading");
      clearTimeout(timer);
      timer = setTimeout(
        () => emit("status", loaded ? "partial" : "error"),
        12000,
      );
    });
    tiles.on("tileload", () => loaded++);
    tiles.on("tileerror", () => errors++);
    tiles.on("load", () => {
      clearTimeout(timer);
      emit("status", errors ? (loaded ? "partial" : "error") : "ready");
    });
    tiles.addTo(map);
  } catch {
    emit("status", "error");
  }
}
function locate(point: Point, bounds?: [number, number, number, number]) {
  if (!pointValid(point)) return;
  if (bounds) {
    const [south, north, west, east] = bounds;
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { padding: [40, 40], maxZoom: 15, animate: false },
    );
  } else map.setView([point.lat, point.lng], 17);
}
onMounted(() => {
  map = L.map(container.value!, {
    center: [39.9042, 116.4074],
    zoom: 11,
    zoomControl: false,
    worldCopyJump: true,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
  shapes = L.layerGroup().addTo(map);
  map.on("click", (e) => {
    const ll = e.latlng.wrap(),
      p = { lng: ll.lng, lat: ll.lat };
    if (props.tool === "home") emit("home", p);
    else emit("add", p);
  });
  resize = new ResizeObserver(() => map.invalidateSize());
  resize.observe(container.value!);
  redraw();
  basemap();
});
watch(
  () => [props.points, props.waypoints, props.home, props.closed, props.dark],
  redraw,
  { deep: true },
);
watch(() => [props.online, props.basemap], basemap, { deep: true });
onBeforeUnmount(() => {
  clearTimeout(timer);
  resize?.disconnect();
  map?.remove();
});
defineExpose({ fit, locate });
</script>
<template>
  <div
    class="map-canvas"
    :class="{ 'map-canvas--dark': dark, 'map-canvas--online': online }"
    :aria-label="
      english
        ? 'Mission map; use the vertex table for keyboard input'
        : '航线地图，可通过坐标表键盘输入'
    "
  >
    <!-- Vue owns the wrapper classes; Leaflet owns classes on this stable node. -->
    <div ref="container" class="map-surface"></div>
  </div>
</template>
