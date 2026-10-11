<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick } from "vue";
import { zipSync, strToU8 } from "fflate";
import MissionMap from "./components/MissionMap.vue";
import PlaceSearch from "./components/PlaceSearch.vue";
import {
  defaultSearchEndpoint,
  validateSearchEndpoint,
} from "./core/placeSearch";
import type { Place } from "./core/placeSearch";
import { aircraft } from "./core/profiles";
import { defaults } from "./core/types";
import type {
  Point,
  Settings,
  ModelId,
  Mission,
  ExportProfile,
} from "./core/types";
import { plan, splitMission, statistics } from "./core/planner";
import {
  buildKmz,
  filename,
  importMission,
  readReference,
  validateMission,
} from "./core/kmz";
import { parseProject, geometryFromGeoJson } from "./core/project";
import { osm, validateBasemap } from "./core/basemap";
import type { Basemap } from "./core/basemap";
import { pointValid } from "./core/geometry";

const english = ref(false),
  dark = ref(false),
  online = ref(true);
try {
  dark.value = localStorage.getItem("mmp-theme") === "dark";
  english.value = localStorage.getItem("mmp-language") === "en";
} catch {
  /* Storage optional. */
}
const t = (zh: string, en: string) => (english.value ? en : zh);
const model = ref<ModelId>("mini5pro"),
  name = ref("new-mission"),
  points = ref<Point[]>([]),
  home = ref<Point>();
const settings = reactive<Settings>({ ...defaults }),
  profile = ref<ExportProfile>(),
  imported = ref<Mission>();
const tool = ref<"draw" | "home">("draw"),
  notice = ref(""),
  acknowledged = ref(false),
  compatibility = ref(false),
  showTable = ref(false);
const map = ref<InstanceType<typeof MissionMap>>(),
  importInput = ref<HTMLInputElement>(),
  importKind = ref<"project" | "geojson" | "kmz" | "reference">("project");
const basemap = ref<Basemap>({ ...osm }),
  tileForm = reactive({ ...osm }),
  mapStatus = ref("offline"),
  showMapSettings = ref(false),
  location = reactive({ lng: 116.4074, lat: 39.9042 });
const searchEndpoint = ref(defaultSearchEndpoint),
  searchEndpointDraft = ref(defaultSearchEndpoint),
  searchAttribution = ref(""),
  searchAttributionDraft = ref(""),
  searchAttributionUrl = ref(""),
  searchAttributionUrlDraft = ref("");
const searchSettings = ref<HTMLElement>();
async function configureSearch() {
  showMapSettings.value = true;
  await nextTick();
  searchSettings.value?.scrollIntoView({ block: "nearest" });
  searchSettings.value?.querySelector("input")?.focus();
}
function selectPlace(place: Place) {
  map.value?.locate(place, place.bounds);
}
function applySearchEndpoint() {
  if (!searchEndpointDraft.value.trim()) {
    searchEndpoint.value = "";
    searchAttribution.value = "";
    searchAttributionUrl.value = "";
    notice.value = t("已关闭地名搜索", "Place search disabled.");
    return;
  }
  if (!searchAttributionDraft.value.trim()) {
    notice.value = t("请填写查询服务要求的版权归属", "Enter the attribution required by your provider.");
    return;
  }
  try {
    const attributionUrl = searchAttributionUrlDraft.value.trim()
      ? validateSearchEndpoint(searchAttributionUrlDraft.value.trim()).href
      : "";
    searchEndpoint.value = validateSearchEndpoint(
      searchEndpointDraft.value.trim(),
    ).href;
    searchAttribution.value = searchAttributionDraft.value.trim();
    searchAttributionUrl.value = attributionUrl;
    notice.value = t("已切换查询服务", "Search provider changed.");
  } catch {
    notice.value = t(
      "查询及版权链接须为 HTTPS 或本机 HTTP 地址",
      "Search and attribution URLs must use HTTPS or local HTTP.",
    );
  }
}
const statusLabel = computed(
  () =>
    ({
      offline: t("离线网格", "Offline grid"),
      loading: t("正在加载底图…", "Loading basemap…"),
      ready: t("底图已加载", "Basemap loaded"),
      partial: t(
        "部分瓦片加载失败，可切换底图",
        "Some tiles failed; try another basemap",
      ),
      error: t(
        "底图加载失败，请检查网络或切换服务",
        "Basemap failed; check the network or switch provider",
      ),
    })[mapStatus.value],
);
const activeAircraft = computed(() => aircraft[model.value]);
const result = computed(() => plan(points.value, settings, model.value));
const waypoints = computed(
  () => imported.value?.waypoints ?? result.value.waypoints,
);
const issues = computed(() => {
  if (!imported.value) return result.value.issues;
  const list = [
    {
      level: "warning",
      code: "IMPORTED",
      zh: "已导入航点，规划参数不会重算航点。返航及起飞安全高度可以修改。重新生成将替换任务。",
      en: "Imported waypoints are fixed. RTH and takeoff safety height remain editable. Regenerate replaces this mission.",
    },
  ];
  try {
    validateMission({
      ...imported.value,
      model: model.value,
      rthHeight: settings.rthHeight,
      takeoffSecurityHeight: settings.takeoffSecurityHeight,
    });
  } catch (e) {
    list.push({
      level: "error",
      code: "INVALID_IMPORT",
      zh: String(e),
      en: String(e),
    });
  }
  if (
    !Number.isFinite(settings.relativeHeightLimit) ||
    waypoints.value.some((p) => p.height > settings.relativeHeightLimit)
  )
    list.push({
      level: "error",
      code: "CEILING",
      zh: "导入航点超过设置的相对高度上限",
      en: "Imported waypoints exceed your relative ceiling",
    });
  if (waypoints.value.some((p) => p.height > settings.rthHeight))
    list.push({
      level: "warning",
      code: "RTH",
      zh: "返航高度低于最高航点",
      en: "RTH height is below the highest waypoint",
    });
  return list;
});
const stats = computed(() =>
  statistics(waypoints.value, settings.hoverEstimate, home.value),
);
const displayIssues = computed(() =>
  issues.value.filter((issue) => issue.code !== "NO_MESH"),
);
const parts = computed(() => {
  try {
    return splitMission(waypoints.value, settings.maxWaypoints);
  } catch {
    return [];
  }
});
const canExport = computed(
  () =>
    waypoints.value.length >= 2 &&
    !issues.value.some((i) => i.level === "error") &&
    acknowledged.value &&
    compatibility.value &&
    parts.value.length > 0,
);
const modeNames = computed(() => [
  t("区域测绘", "Area survey"),
  t("立面巡检", "Facade"),
  t("环绕拍摄", "Orbit"),
]);
watch(dark, (v) => {
  try {
    localStorage.setItem("mmp-theme", v ? "dark" : "light");
  } catch {
    /* optional */
  }
});
watch(english, (v) => {
  document.documentElement.lang = v ? "en" : "zh-CN";
  try {
    localStorage.setItem("mmp-language", v ? "en" : "zh");
  } catch {
    /* optional */
  }
});
watch([model, () => settings.mode], () => {
  imported.value = undefined;
  profile.value = undefined;
  compatibility.value = false;
});
watch(
  [points, settings, home],
  () => {
    acknowledged.value = false;
  },
  { deep: true },
);

function demo() {
  imported.value = undefined;
  profile.value = undefined;
  home.value = undefined;
  const base = { lng: 0, lat: 0 };
  points.value =
    settings.mode === "survey"
      ? [
          base,
          { lng: 0.001, lat: 0 },
          { lng: 0.001, lat: 0.0007 },
          { lng: 0, lat: 0.0007 },
        ]
      : settings.mode === "facade"
        ? [base, { lng: 0.00065, lat: 0 }, { lng: 0.00065, lat: 0.0003 }]
        : [base];
  name.value = "demo-" + settings.mode;
  notice.value = t(
    "已加载虚构演示坐标，不能用于实飞。",
    "Synthetic demo coordinates loaded. Never fly this example.",
  );
  nextTick(() => map.value?.fit());
}
function add(p: Point) {
  imported.value = undefined;
  points.value = settings.mode === "orbit" ? [p] : [...points.value, p];
}
function move(i: number, p: Point) {
  imported.value = undefined;
  points.value = points.value.map((q, k) => (k === i ? p : q));
}
function download(
  bytes: Uint8Array,
  file: string,
  type = "application/octet-stream",
) {
  const blob = new Blob([new Uint8Array(bytes)], { type }),
    url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function saveProject() {
  if (imported.value) {
    notice.value = t(
      "导入任务请通过 KMZ 导出保存。项目 JSON 仅保存规划边界和参数。",
      "Save an imported task as KMZ; project JSON stores planning geometry and settings.",
    );
    return;
  }
  download(
    strToU8(
      JSON.stringify(
        {
          version: 1,
          name: name.value,
          model: model.value,
          points: points.value,
          settings,
          home: home.value,
          profile: profile.value,
        },
        null,
        2,
      ),
    ),
    filename(name.value) + ".json",
    "application/json",
  );
}
function exportTasks() {
  if (!canExport.value) return;
  try {
    const files: Record<string, Uint8Array> = {},
      summary: unknown[] = [];
    parts.value.forEach((p, i) => {
      const mission: Mission = {
        name: `${name.value}-${i + 1}`,
        model: model.value,
        waypoints: p,
        profile:
          profile.value ??
          imported.value?.profile ??
          activeAircraft.value.profile,
        rthHeight: settings.rthHeight,
        takeoffSecurityHeight: settings.takeoffSecurityHeight,
      };
      const file = `${filename(name.value)}-${String(i + 1).padStart(2, "0")}.kmz`;
      files[file] = buildKmz(mission);
      summary.push({
        file,
        waypoints: p.length,
        ...statistics(p, settings.hoverEstimate, home.value),
      });
    });
    if (parts.value.length === 1) {
      const key = Object.keys(files)[0];
      download(files[key], key);
    } else {
      files["summary.json"] = strToU8(
        JSON.stringify(
          {
            model: model.value,
            heightDatum: "relativeToStartPoint",
            independentFlights: true,
            estimatedHoverSecondsPerPhoto: settings.hoverEstimate,
            parts: summary,
          },
          null,
          2,
        ),
      );
      download(
        zipSync(files),
        filename(name.value) + "-parts.zip",
        "application/zip",
      );
    }
    notice.value = t(
      "导出完成。请在 DJI Fly 中逐份核验高度、动作及返航设置。",
      "Exported. Review heights, actions and RTH settings in DJI Fly for each part.",
    );
  } catch (e) {
    notice.value = e instanceof Error ? e.message : String(e);
  }
}
function choose(kind: typeof importKind.value) {
  importKind.value = kind;
  importInput.value?.click();
}
async function load(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("File exceeds 5 MB");
    if (importKind.value === "project") {
      const p = parseProject(await file.text());
      model.value = p.model;
      Object.assign(settings, p.settings);
      await nextTick();
      name.value = p.name;
      points.value = p.points;
      home.value = p.home;
      profile.value = p.profile;
      imported.value = undefined;
    } else if (importKind.value === "geojson") {
      const p = geometryFromGeoJson(await file.text());
      settings.mode = p.mode;
      await nextTick();
      points.value = p.points;
      imported.value = undefined;
      name.value = file.name.replace(/\.[^.]+$/, "");
    } else if (importKind.value === "reference") {
      profile.value = readReference(
        new Uint8Array(await file.arrayBuffer()),
      ).profile;
    } else {
      const m = importMission(
        new Uint8Array(await file.arrayBuffer()),
        model.value,
      );
      imported.value = m;
      points.value = [];
      name.value = m.name;
      settings.rthHeight = m.rthHeight;
      settings.takeoffSecurityHeight = m.takeoffSecurityHeight;
    }
    compatibility.value = false;
    acknowledged.value = false;
    notice.value = t(
      "导入完成，请重新检查配置。",
      "Imported; review the configuration.",
    );
    nextTick(() => map.value?.fit());
  } catch (e) {
    notice.value = e instanceof Error ? e.message : String(e);
  }
  input.value = "";
}
function clear() {
  points.value = [];
  imported.value = undefined;
  home.value = undefined;
  notice.value = "";
}
function applyBasemap() {
  try {
    validateBasemap(tileForm);
    basemap.value = { ...tileForm };
    online.value = true;
    notice.value = t(
      "已应用底图。自定义服务须使用 WGS84/Web Mercator XYZ 瓦片并遵守提供方条款。",
      "Basemap applied. Use WGS84/Web Mercator XYZ tiles and follow provider terms.",
    );
  } catch (e) {
    notice.value = String(e);
  }
}
function locate() {
  if (!pointValid(location)) {
    notice.value = t("定位坐标无效", "Invalid location coordinates");
    return;
  }
  map.value?.locate(location);
}
</script>

<template>
  <div class="workbench" :class="{ dark }">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">M↗</span>
        <strong>Mini Mission Planner</strong>
      </div>
      <div class="top-actions">
        <button @click="english = !english">
          {{ english ? "中文" : "English" }}</button
        ><button
          @click="dark = !dark"
          :aria-label="t('切换主题', 'Switch theme')"
        >
          {{ dark ? t("浅色", "Light") : t("深色", "Dark") }}
        </button>
      </div>
    </header>
    <main class="workspace">
      <aside class="sidebar">
        <div class="sidebar-content">
          <div class="section-title">
            <h1>{{ t("规划任务", "Plan a mission") }}</h1>
          </div>
          <label
            >{{ t("任务名称", "Mission name")
            }}<input v-model="name" maxlength="80"
          /></label>
          <label
            >{{ t("机型", "Aircraft")
            }}<select v-model="model" :aria-label="t('机型', 'Aircraft')">
              <option value="mini5pro">DJI Mini 5 Pro</option>
              <option value="mini4pro">DJI Mini 4 Pro</option>
            </select></label
          >
          <div
            class="mode-tabs"
            role="group"
            :aria-label="t('规划模式', 'Planning mode')"
          >
            <button
              v-for="(mode, i) in ['survey', 'facade', 'orbit'] as const"
              :key="mode"
              :class="{ selected: settings.mode === mode }"
              :aria-pressed="settings.mode === mode"
              @click="settings.mode = mode"
            >
              {{ modeNames[i] }}
            </button>
          </div>
          <template v-if="settings.mode === 'facade'">
            <div class="field-grid">
              <label
                >{{ t("最低高度", "Lowest height") }} · m<input
                  v-model.number="settings.low"
                  type="number"
                  min="1"
                  max="500" /></label
              ><label
                >{{ t("最高高度", "Highest height") }} · m<input
                  v-model.number="settings.high"
                  type="number"
                  min="1"
                  max="500"
              /></label>
            </div>
            <div class="field-grid">
              <label
                >{{ t("离墙距离", "Wall standoff") }} · m<input
                  v-model.number="settings.distance"
                  type="number"
                  min="2"
                  max="100" /></label
              ><label
                >{{ t("飞行侧", "Offset side")
                }}<select v-model="settings.side">
                  <option value="left">
                    {{ t("绘制方向左侧", "Left of drawing") }}
                  </option>
                  <option value="right">
                    {{ t("绘制方向右侧", "Right of drawing") }}
                  </option>
                </select></label
              >
            </div>
          </template>
          <template v-else
            ><div class="field-grid">
              <label
                >{{ t("飞行高度", "Flight height") }} · m<input
                  v-model.number="settings.height"
                  type="number"
                  min="1"
                  max="500" /></label
              ><label
                >{{ t("云台俯仰", "Gimbal pitch") }} · °<input
                  v-model.number="settings.pitch"
                  type="number"
                  :min="activeAircraft.pitchMin"
                  :max="activeAircraft.pitchMax"
              /></label></div
          ></template>
          <div class="field-grid">
            <label
              >{{ t("飞行速度", "Flight speed") }} · m/s<input
                v-model.number="settings.speed"
                type="number"
                min="0.1"
                max="12"
                step="0.1" /></label
            ><label
              >{{ t("返航高度", "RTH height") }} · m<input
                v-model.number="settings.rthHeight"
                type="number"
                min="5"
                max="500"
            /></label>
          </div>
          <div v-if="settings.mode !== 'orbit'" class="field-grid">
            <label
              >{{ t("沿线重叠", "Along overlap") }} · %<input
                v-model.number="settings.frontOverlap"
                type="number"
                min="0"
                max="95" /></label
            ><label
              >{{ t("跨线重叠", "Across overlap") }} · %<input
                v-model.number="settings.sideOverlap"
                type="number"
                min="0"
                max="95"
            /></label>
          </div>
          <label v-if="settings.mode === 'survey'"
            >{{ t("扫描方向", "Scan heading") }} · °<input
              v-model.number="settings.angle"
              type="number"
              min="-180"
              max="180"
          /></label>
          <template v-if="settings.mode === 'orbit'"
            ><div class="field-grid">
              <label
                >{{ t("半径", "Radius") }} · m<input
                  v-model.number="settings.radius"
                  type="number"
                  min="3"
                  max="500" /></label
              ><label
                >{{ t("圈数", "Turns")
                }}<input
                  v-model.number="settings.turns"
                  type="number"
                  min="1"
                  max="5"
              /></label>
            </div>
            <label
              >{{ t("航点间估算飞行时间", "Travel time between points") }} ·
              s<input
                v-model.number="settings.photoInterval"
                type="number"
                min="1"
                max="20" /></label
          ></template>
          <p class="hint">
            {{ t("高度相对起飞点", "Heights relative to takeoff") }}
          </p>
          <details>
            <summary>
              {{ t("高级参数", "Advanced settings") }}
            </summary>
            <div class="field-grid">
              <label
                >{{ t("相对高度上限", "Relative ceiling") }} · m<input
                  v-model.number="settings.relativeHeightLimit"
                  type="number"
                  min="1"
                  max="500" /></label
              ><label
                >{{ t("每份航点上限", "Waypoints per part")
                }}<input
                  v-model.number="settings.maxWaypoints"
                  type="number"
                  min="2"
                  max="200" /></label
              ><label
                >{{ t("起飞安全高度", "Takeoff safety height") }} · m<input
                  v-model.number="settings.takeoffSecurityHeight"
                  type="number"
                  min="1.2"
                  max="100"
                  step="0.1" /></label
              ><label
                >{{ t("拍照停留估算", "Photo dwell estimate") }} · s<input
                  v-model.number="settings.hoverEstimate"
                  type="number"
                  min="0"
                  max="30"
              /></label>
            </div>
            <p class="hint">
              {{
                t(
                  "停留仅用于估算时长，未导出悬停动作。分段任务需分别起飞，不是断点续飞。",
                  "Dwell is an estimate only; no hover action is exported. Parts are independent flights, not resume points.",
                )
              }}
            </p>
          </details>
          <div class="section-title">
            <h2>{{ t("检查与导出", "Review & export") }}</h2>
          </div>
          <div class="validation" aria-live="polite">
            <p
              v-for="(issue, i) in displayIssues"
              :key="i"
              :class="issue.level"
            >
              <strong>{{ issue.level === "error" ? "×" : "!" }}</strong
              >{{ english ? issue.en : issue.zh }}
            </p>
          </div>
          <details class="usage-notes">
            <summary>
              {{ t("兼容性与使用说明", "Compatibility & usage") }}
            </summary>
            <p class="hint">
              {{
                t(
                  "v0.1 技术预览，两款机型在本独立版本中均待实飞验证。",
                  "v0.1 preview. Both aircraft require flight verification in this release.",
                )
              }}
            </p>
            <p class="hint">
              {{
                t(
                  "用本机原生 DJI Fly 任务校准导出配置，导出后核对航点与动作。",
                  "Calibrate with a native DJI Fly task, then inspect exported waypoints and actions.",
                )
              }}
            </p>
            <button class="wide" @click="choose('reference')">
              {{ t("导入原生 KMZ 校准", "Calibrate from native KMZ") }}
            </button>
            <p v-if="profile" class="hint">
              {{ profile.namespace.split("/").pop() }} · drone
              {{ profile.drone }} · payload {{ profile.payload }}
            </p>
            <p class="hint">
              {{
                t(
                  "蓝色为规划航线，虚线为绘制边界。连线不代表真实曲线轨迹，底图坐标需核验。",
                  "Blue is the planned route; dashed lines are geometry. Preview segments do not represent real curved trajectories. Verify basemap alignment.",
                )
              }}
            </p>
            <p class="hint">
              {{
                t(
                  "当前工具不检查三维障碍物、地形净空或空域许可。",
                  "This tool does not check 3D obstacles, terrain clearance or airspace permission.",
                )
              }}
            </p>
            <p class="hint">
              {{
                t(
                  "时长仅为估算，不保证电池续航。文件在本机处理，开启底图会向地图服务发送视口请求。",
                  "Time estimates do not guarantee battery endurance. Files stay local; online tiles send viewport requests to the map provider.",
                )
              }}
            </p>
          </details>
          <label class="check"
            ><input v-model="acknowledged" type="checkbox" />{{
              t(
                "已核对高度、返航路径与现场条件",
                "Heights, return path and site reviewed",
              )
            }}</label
          ><label class="check"
            ><input v-model="compatibility" type="checkbox" />{{
              t(
                "了解实飞待验证，将在 DJI Fly 核验",
                "Flight verification pending; I will review in DJI Fly",
              )
            }}</label
          >
        </div>
        <div class="sidebar-footer">
          <button
            class="primary wide"
            :disabled="!canExport"
            @click="exportTasks"
          >
            {{ t("导出", "Export") }}
            {{ parts.length > 1 ? `${parts.length} KMZ · ZIP` : "KMZ" }} ↗
          </button>
          <div class="file-actions">
            <button @click="saveProject">
              {{ t("保存项目", "Save project") }}</button
            ><button @click="choose('project')">
              {{ t("打开项目", "Open project") }}</button
            ><button @click="choose('geojson')">GeoJSON</button
            ><button @click="choose('kmz')">
              {{ t("打开 KMZ", "Open KMZ") }}
            </button>
          </div>
          <p v-if="notice" class="notice" role="status">{{ notice }}</p>
          <input
            ref="importInput"
            type="file"
            hidden
            :accept="
              importKind === 'project' || importKind === 'geojson'
                ? '.json,.geojson'
                : '.kmz'
            "
            @change="load"
          />
        </div>
      </aside>
      <section class="map-panel">
        <div class="map-toolbar">
          <div class="drawing-tools">
            <button
              :class="{ selected: tool === 'draw' }"
              @click="tool = 'draw'"
            >
              {{ t("绘制边界", "Draw geometry") }}</button
            ><button
              :class="{ selected: tool === 'home' }"
              @click="tool = 'home'"
            >
              {{ t("设置起飞点", "Set takeoff") }}</button
            ><button
              :disabled="!points.length"
              @click="
                points = points.slice(0, -1);
                imported = undefined;
              "
            >
              {{ t("撤销", "Undo") }}</button
            ><button @click="clear">{{ t("清空", "Clear") }}</button>
          </div>
          <div>
            <button @click="map?.fit()">{{ t("定位航线", "Fit route") }}</button
            ><button @click="showMapSettings = !showMapSettings">
              {{ t("底图与定位", "Basemap & location") }}</button
            ><button @click="demo">{{ t("演示数据", "Demo") }}</button>
          </div>
        </div>
        <div class="search-toolbar">
          <PlaceSearch
            :english="english"
            :endpoint="searchEndpoint"
            :attribution="searchAttribution"
            :attribution-url="searchAttributionUrl"
            @select="selectPlace"
            @configure="configureSearch"
          />
        </div>
        <div v-if="showMapSettings" class="basemap-settings">
          <div>
            <strong>{{
              t(
                "输入 WGS84 坐标定位现场",
                "Locate your site with WGS84 coordinates",
              )
            }}</strong>
            <div class="field-grid">
              <label
                >{{ t("经度", "Longitude")
                }}<input
                  v-model.number="location.lng"
                  type="number"
                  step="0.00001" /></label
              ><label
                >{{ t("纬度", "Latitude")
                }}<input
                  v-model.number="location.lat"
                  type="number"
                  step="0.00001"
              /></label>
            </div>
            <button @click="locate">
              {{
                t(
                  "查看此位置（不移动航线）",
                  "View location (keep route unchanged)",
                )
              }}
            </button>
            <p class="hint">
              {{
                t("定位只移动地图视角。", "Location changes the map view only.")
              }}
            </p>
          </div>
          <div>
            <strong>{{
              t("自定义 XYZ 瓦片底图", "Custom XYZ tile basemap")
            }}</strong
            ><label
              >{{ t("HTTPS 地址模板", "HTTPS URL template")
              }}<input
                v-model="tileForm.url"
                placeholder="https://your-provider/{z}/{x}/{y}.png"
            /></label>
            <div class="field-grid">
              <label
                >{{ t("版权归属", "Attribution")
                }}<input v-model="tileForm.attribution" /></label
              ><label
                >{{ t("最大缩放", "Maximum zoom")
                }}<input
                  v-model.number="tileForm.maxZoom"
                  type="number"
                  min="1"
                  max="22"
              /></label>
            </div>
            <button @click="applyBasemap">
              {{ t("应用底图", "Apply basemap") }}</button
            ><button
              @click="
                Object.assign(tileForm, osm);
                applyBasemap();
              "
            >
              OpenStreetMap
            </button>
            <p class="hint">
              {{
                t(
                  "使用 WGS84 对齐的 XYZ 瓦片，不能直接混用 GCJ-02 底图。",
                  "Use WGS84-aligned XYZ tiles, not unconverted GCJ-02 tiles.",
                )
              }}
            </p>
          </div>
          <div ref="searchSettings" class="geocoder-settings">
            <strong>{{ t("地名查询服务", "Place search provider") }}</strong>
            <label
              >{{ t("Nominatim 兼容查询地址", "Nominatim-compatible endpoint")
              }}<input v-model="searchEndpointDraft" type="url" autocomplete="off" placeholder="https://your-provider/search"
            /></label>
            <label>{{ t("搜索结果版权归属", "Search result attribution") }}<input v-model="searchAttributionDraft" maxlength="300" :placeholder="t('按服务要求填写', 'As required by your provider')" /></label>
            <label>{{ t("版权链接（选填）", "Attribution URL (optional)") }}<input v-model="searchAttributionUrlDraft" type="url" placeholder="https://your-provider/attribution" /></label>
            <button @click="applySearchEndpoint">
              {{ t("应用查询服务", "Apply search provider") }}
            </button>
            <button @click="searchEndpointDraft = ''; searchAttributionDraft = ''; searchAttributionUrlDraft = ''; applySearchEndpoint()">{{ t("关闭搜索", "Disable search") }}</button>
            <details class="search-policy">
              <summary>
                {{ t("查询服务使用说明", "Search service usage") }}
              </summary>
              <p class="hint">
                {{
                  t(
                    "请配置有权使用、支持浏览器访问的 Nominatim 兼容服务，并遵守其限流、版权和隐私要求。配置仅保留在当前页面。搜索词会发给该服务，勿输入保密信息。浏览器不能保护私密 API 密钥，此类密钥应由自建代理保管。公共 Nominatim 的限制按整个应用计算，用户自行配置仍须遵守。",
                    "Configure an authorized, browser-accessible Nominatim-compatible service and follow its rate, attribution and privacy requirements. Settings last only for this page. Queries are sent to that service; do not enter confidential data. Keep secret API keys in your own proxy, not the browser. Public Nominatim limits apply to the whole application even when users configure it themselves.",
                  )
                }}
              </p>
              <a
                href="https://operations.osmfoundation.org/policies/nominatim/"
                target="_blank"
                rel="noopener noreferrer"
                >{{ t("Nominatim 使用政策", "Nominatim usage policy") }}</a
              >
            </details>
          </div>
        </div>
        <div class="map-viewport">
          <MissionMap
            ref="map"
            :points="points"
            :waypoints="waypoints"
            :home="home"
            :closed="settings.mode === 'survey'"
            :dark="dark"
            :online="online"
            :tool="tool"
            :english="english"
            :basemap="basemap"
            @status="mapStatus = $event"
            @add="add"
            @move="move"
            @home="
              home = $event;
              tool = 'draw';
            "
          />
          <div class="map-note">
            <strong>{{
              imported
                ? t("导入任务", "Imported task")
                : t("点击加点 · 拖动调整", "Click to add · Drag to adjust")
            }}</strong
            ><label class="check"
              ><input v-model="online" type="checkbox" />{{
                t("显示底图", "Show basemap")
              }}</label
            ><span
              v-if="online && mapStatus !== 'ready'"
              class="basemap-status"
              role="status"
              >{{ statusLabel }}</span
            >
          </div>
        </div>
        <div class="stats-bar">
          <div>
            <span>{{ t("航点", "Waypoints") }}</span
            ><strong
              >{{ waypoints.length
              }}<small v-if="parts.length > 1">
                / {{ parts.length }} {{ t("份任务", "parts") }}</small
              ></strong
            >
          </div>
          <div>
            <span>{{ t("航线长度", "Route length") }}</span
            ><strong>{{ stats.length.toFixed(0) }}<small>m</small></strong>
          </div>
          <div>
            <span>{{ t("估算时间", "Estimated time") }}</span
            ><strong
              >{{ (stats.seconds / 60).toFixed(1) }}<small>min</small></strong
            >
          </div>
          <div>
            <span>{{ t("照片", "Photos") }}</span
            ><strong>{{ stats.photos }}</strong>
          </div>
          <button @click="showTable = !showTable">
            {{
              showTable
                ? t("收起坐标表", "Hide coordinates")
                : t("坐标与航点表", "Coordinates & waypoints")
            }}
          </button>
        </div>
        <div v-if="showTable" class="coordinate-panel">
          <div class="table-header">
            <h2>{{ t("绘制点 · WGS84", "Geometry · WGS84") }}</h2>
            <button
              @click="
                add({
                  lng: points.at(-1)?.lng ?? 0,
                  lat: (points.at(-1)?.lat ?? 0) + 0.0001,
                })
              "
            >
              {{ t("添加坐标行", "Add coordinate") }}</button
            ><button v-if="imported" @click="imported = undefined">
              {{ t("重新生成", "Regenerate") }}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{{ t("经度", "Longitude") }}</th>
                <th>{{ t("纬度", "Latitude") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in points" :key="i">
                <td>{{ i + 1 }}</td>
                <td>
                  <input
                    :value="p.lng"
                    :aria-label="`${i + 1} longitude`"
                    type="number"
                    step="0.000001"
                    @change="
                      move(i, {
                        ...p,
                        lng: ($event.target as HTMLInputElement).valueAsNumber,
                      })
                    "
                  />
                </td>
                <td>
                  <input
                    :value="p.lat"
                    :aria-label="`${i + 1} latitude`"
                    type="number"
                    step="0.000001"
                    @change="
                      move(i, {
                        ...p,
                        lat: ($event.target as HTMLInputElement).valueAsNumber,
                      })
                    "
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <h2>
            {{ t("航点预览（前 300 行）", "Waypoint preview (first 300)") }}
          </h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>lng</th>
                <th>lat</th>
                <th>height m</th>
                <th>yaw °</th>
                <th>pitch °</th>
                <th>m/s</th>
                <th>{{ t("拍照", "Photo") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in waypoints.slice(0, 300)" :key="i">
                <td>{{ i + 1 }}</td>
                <td>{{ p.lng.toFixed(6) }}</td>
                <td>{{ p.lat.toFixed(6) }}</td>
                <td>{{ p.height.toFixed(1) }}</td>
                <td>{{ p.yaw.toFixed(0) }}</td>
                <td>{{ p.pitch }}</td>
                <td>{{ p.speed }}</td>
                <td>{{ p.photo ? "✓" : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>
