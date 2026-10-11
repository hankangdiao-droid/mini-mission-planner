<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick } from "vue";
import { zipSync, strToU8 } from "fflate";
import MissionMap from "./components/MissionMap.vue";
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
  online = ref(false);
try {
  dark.value = localStorage.getItem("mmp-theme") === "dark";
  english.value = localStorage.getItem("mmp-language") === "en";
} catch {
  /* Storage optional. */
}
const t = (zh: string, en: string) => (english.value ? en : zh);
const model = ref<ModelId>("mini5pro"),
  name = ref("demo-facade"),
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
  location = reactive({ lng: 116.4, lat: 39.9 });
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
demo();
</script>

<template>
  <div class="workbench" :class="{ dark }">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">M↗</span>
        <div>
          <strong>Mini Mission Planner</strong
          ><small
            >{{ t("轻量航线工作台", "Local mission workbench") }}
            <span
              >v0.1 · {{ t("实飞待验证", "flight verification pending") }}</span
            ></small
          >
        </div>
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
        <div class="section-title">
          <span>01</span>
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
        <p class="evidence">{{ activeAircraft.evidence }}</p>
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
          {{
            t(
              "所有高度均相对起飞点，不能当作离地高度。",
              "All heights are relative to takeoff, not above terrain.",
            )
          }}
        </p>
        <details>
          <summary>
            {{ t("高级参数与任务分段", "Advanced settings & parts") }}
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
          <span>02</span>
          <h2>{{ t("检查与导出", "Review & export") }}</h2>
        </div>
        <div class="validation" aria-live="polite">
          <p v-for="(issue, i) in issues" :key="i" :class="issue.level">
            <strong>{{ issue.level === "error" ? "×" : "!" }}</strong
            >{{ english ? issue.en : issue.zh }}
          </p>
        </div>
        <p class="hint">
          {{
            t(
              "默认 KMZ 枚举来自原项目或社区参考。请用本机原生任务校准，并在 DJI Fly 中检查。",
              "Default enums follow project/community references. Calibrate with your own native task and review in DJI Fly.",
            )
          }}
        </p>
        <button class="wide" @click="choose('reference')">
          {{ t("导入原生 KMZ 校准枚举", "Calibrate from native KMZ") }}
        </button>
        <p v-if="profile" class="hint">
          {{ profile.namespace.split("/").pop() }} · drone {{ profile.drone }} ·
          payload {{ profile.payload }}
        </p>
        <label class="check"
          ><input v-model="acknowledged" type="checkbox" />{{
            t(
              "我已核对相对高度、返航路径及现场条件",
              "I reviewed relative heights, RTH path and site conditions",
            )
          }}</label
        ><label class="check"
          ><input v-model="compatibility" type="checkbox" />{{
            t(
              "我了解独立版本尚待真机验证，将在 DJI Fly 核验",
              "I understand this release needs flight verification and will review it in DJI Fly",
            )
          }}</label
        >
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
                t(
                  "演示坐标在 0°/0° 附近，联网底图会显示海面。查看现场请先定位或导入现场坐标。",
                  "Demo coordinates are near 0°/0° and show ocean on a real map. Locate your site or import site geometry.",
                )
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
                  "请使用有权访问的服务。高德/腾讯的 GCJ-02 瓦片不能直接当 WGS84 使用。配置只保留在当前页面，不写入项目或 GitHub。",
                  "Use a service you are authorized to access. GCJ-02 tiles are not directly compatible. Configuration stays in this page, outside projects and GitHub.",
                )
              }}
            </p>
          </div>
        </div>
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
              : t(
                  "点击地图添加点，拖拽点调整",
                  "Click to add points, drag to adjust",
                )
          }}</strong
          ><span>{{
            t(
              "蓝色为航线，虚线为绘制边界。地图连线不代表实际曲线轨迹。",
              "Blue: route. Dashed: geometry. Preview segments do not represent actual curved flight paths.",
            )
          }}</span
          ><label class="check"
            ><input v-model="online" type="checkbox" />{{
              t(
                "联网显示底图（视口请求会发给地图服务）",
                "Online basemap (viewport requests sent to tile service)",
              )
            }}</label
          ><span class="basemap-status" role="status">{{ statusLabel }}</span>
        </div>
        <div class="stats-bar">
          <div>
            <span>{{ t("航点", "Waypoints") }}</span
            ><strong
              >{{ waypoints.length
              }}<small>
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
    <footer>
      {{
        t(
          "本地处理项目与 KMZ · 无需数据库或显卡",
          "Projects and KMZ processed locally · No database or GPU",
        )
      }}<span>{{
        t(
          "时间为估算值，不代表可用电池续航。底图坐标须自行核验。",
          "Time estimates do not guarantee battery endurance. Verify basemap alignment.",
        )
      }}</span>
    </footer>
  </div>
</template>
