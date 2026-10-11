<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { searchPlaces, PlaceSearchError } from "../core/placeSearch";
import type { Place } from "../core/placeSearch";
const props = defineProps<{ english: boolean; endpoint: string }>();
const emit = defineEmits<{ select: [Place] }>();
const query = ref(""),
  places = ref<Place[]>([]),
  busy = ref(false),
  searched = ref(false),
  expanded = ref(false),
  error = ref("");
let controller: AbortController | undefined,
  request = 0;
const t = (zh: string, en: string) => (props.english ? en : zh);
function reset() {
  request++;
  controller?.abort();
  busy.value = false;
  places.value = [];
  error.value = "";
  searched.value = false;
  expanded.value = false;
}
watch(query, reset);
watch(() => [props.english, props.endpoint], reset);
async function submit() {
  if (!query.value.trim() || busy.value) return;
  const id = ++request;
  controller?.abort();
  const current = new AbortController();
  controller = current;
  busy.value = true;
  expanded.value = true;
  error.value = "";
  searched.value = false;
  places.value = [];
  const timeout = setTimeout(
    () => current.abort(new PlaceSearchError("timeout")),
    15000,
  );
  try {
    const result = await searchPlaces(
      query.value,
      props.english,
      props.endpoint,
      current.signal,
    );
    if (id === request) {
      places.value = result;
      searched.value = true;
    }
  } catch (e) {
    if (id !== request) return;
    const code = current.signal.aborted
      ? "timeout"
      : e instanceof PlaceSearchError
        ? e.code
        : "network";
    error.value =
      code === "timeout"
        ? t("查询超时，请重试", "Search timed out. Try again.")
        : code === "rate"
          ? t(
              "查询服务限流，请稍后重试",
              "Search rate limited. Try again later.",
            )
          : code === "settings"
            ? t("查询服务地址无效", "Invalid search endpoint.")
            : code === "response"
              ? t("查询服务返回格式不正确", "Unexpected search response.")
              : t(
                  "查询失败，请检查网络或更换服务",
                  "Search failed. Check the network or change provider.",
                );
  } finally {
    clearTimeout(timeout);
    if (id === request) busy.value = false;
  }
}
function select(place: Place) {
  expanded.value = false;
  emit("select", place);
}
onBeforeUnmount(reset);
</script>
<template>
  <div class="place-search" @keydown.esc="expanded = false">
    <form class="place-search-form" role="search" @submit.prevent="submit">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </svg>
      <input
        v-model="query"
        type="search"
        maxlength="160"
        autocomplete="off"
        :aria-label="t('搜索城市或地点', 'Search cities or places')"
        :placeholder="
          t(
            '搜索城市或地点，如 纽约 / New York',
            'Search cities or places, e.g. New York',
          )
        "
        :aria-expanded="expanded"
        aria-controls="place-search-results"
        @focus="if (searched || error) expanded = true;"
      />
      <button type="submit" :disabled="busy || !query.trim()">
        {{ busy ? t("查询中…", "Searching…") : t("搜索", "Search") }}
      </button>
    </form>
    <div v-if="expanded" id="place-search-results" class="place-search-results">
      <div class="place-search-heading">
        <span>{{ t("选择地点", "Choose a place") }}</span
        ><button
          type="button"
          :aria-label="t('关闭搜索结果', 'Close search results')"
          @click="expanded = false"
        >
          ×
        </button>
      </div>
      <p v-if="busy" role="status">{{ t("正在查询…", "Searching…") }}</p>
      <p v-else-if="error" class="search-error" role="alert">{{ error }}</p>
      <p v-else-if="searched && !places.length" role="status">
        {{
          t(
            "未找到地点，请补充国家或州名称",
            "No places found. Add a country or state.",
          )
        }}
      </p>
      <ul v-else class="place-result-list">
        <li v-for="place in places" :key="place.id">
          <button
            type="button"
            @click="select(place)"
            :aria-label="`${place.name}, ${place.description}`"
          >
            <strong>{{ place.name }}</strong
            ><span>{{ place.description }}</span>
          </button>
        </li>
      </ul>
      <div v-if="places.length" class="search-attribution">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          >© OpenStreetMap contributors</a
        >
      </div>
    </div>
  </div>
</template>
