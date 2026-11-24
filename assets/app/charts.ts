import type { AnalysisData } from "./app";
import { loadChartLibrary } from "./chart-library";
import { CONTENT } from "./content";
import { T } from "./i18n";

declare const echarts: {
  init(
    node: HTMLElement,
    theme?: unknown,
    options?: unknown,
  ): { dispose(): void; resize(): void; setOption(option: unknown): void };
};

type Row = { name: string; count: number };
type Chart = { dispose(): void; resize(): void; setOption(option: unknown): void };

const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
const charts = new Map<Element, Chart>();
const pendingCharts = new Map<Element, Record<string, any>>();
let visibility: IntersectionObserver | undefined;
let sizes: ResizeObserver | undefined;
const get = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`report DOM is missing #${id}`);
  return element;
};
const text = T;
const content = (): Record<string, unknown> => CONTENT;

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP");
}

// Tooltip text in ECharts rich text: "{b|...}" uses the bold style that
// tooltip() defines.
export function formatHbarTooltip(name: unknown, value: number, unit = ""): string {
  return `${String(name ?? "")}\n{b|${formatNumber(value)}}${unit}`;
}

function record(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((item): item is Row =>
      item !== null && typeof item === "object" && typeof (item as Row).name === "string"
      && typeof (item as Row).count === "number"
    )
    : [];
}
function pairs(value: unknown): Array<[string, number]> {
  return Array.isArray(value)
    ? value.filter((item): item is [string, number] =>
      Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "number"
    )
    : [];
}
function displayList(value: unknown): string {
  return (Array.isArray(value) ? value : []).map((item) =>
    typeof item === "string" ? item : String(record(item).location ?? record(item).name ?? "")
  ).filter(Boolean).join(" / ");
}
function setVisible(id: string, visible: boolean): void {
  get(id).style.display = visible ? "" : "none";
  // Keep the section nav free of links to sections that are not shown.
  document.querySelector<HTMLElement>(`#report-nav a[href="#${id}"]`)?.toggleAttribute("hidden", !visible);
}

function palette(): Record<string, any> {
  const styles = getComputedStyle(document.documentElement);
  const value = (name: string) => styles.getPropertyValue(name).trim();
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    dark,
    surface: value("--color-surface"),
    ink: value("--color-ink"),
    ink2: value("--color-ink2"),
    muted: value("--color-muted"),
    grid: value("--color-grid"),
    axis: value("--color-axis"),
    accent: value("--color-accent"),
    // Indigo / persimmon / teal ... Neighbouring series are far apart in hue.
    series: dark
      ? ["#aab4ff", "#f4a259", "#5fd0c0", "#e9c46a", "#f08ab0", "#9aa8c7", "#c4a7ff", "#9ccc65"]
      : ["#3b44b0", "#c2570c", "#0f766e", "#a16207", "#be3a6b", "#52607a", "#7c3aed", "#3f7d20"],
    heat: value("--color-accent"),
  };
}

// ECharts builds HTML tooltips from markup with inline style attributes, which
// the CSP (style-src 'self') blocks. Draw every tooltip on the chart canvas
// instead, so no HTML is inserted into the page.
function tooltip(theme: Record<string, any>, options: Record<string, any> = {}): Record<string, any> {
  return {
    renderMode: "richText",
    backgroundColor: theme.surface,
    borderColor: theme.grid,
    textStyle: { color: theme.ink, fontSize: 12, rich: { b: { fontWeight: "bold" } } },
    confine: true,
    ...options,
  };
}
function base(theme: Record<string, any>): Record<string, any> {
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "system-ui,-apple-system,Segoe UI,Meiryo,sans-serif" },
    grid: { left: 8, right: 16, top: 14, bottom: 8, containLabel: true },
    tooltip: tooltip(theme, { trigger: "item" }),
  };
}
function axisText(theme: Record<string, any>): Record<string, any> {
  return { color: theme.muted, fontSize: 11 };
}
function chart(id: string, option: Record<string, any>): void {
  const node = get(id);
  pendingCharts.set(node, option);
  visibility ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      const options = pendingCharts.get(entry.target);
      if (!entry.isIntersecting || !options) continue;
      visibility?.unobserve(entry.target);
      void loadChartLibrary(document).then(() => {
        if (pendingCharts.get(entry.target) !== options) return;
        const instance = echarts.init(entry.target as HTMLElement, undefined, { renderer: "canvas" });
        instance.setOption(options);
        charts.set(entry.target, instance);
        sizes?.observe(entry.target);
        pendingCharts.delete(entry.target);
      }).catch(() => {
        if (pendingCharts.get(entry.target) === options) entry.target.textContent = "グラフを読み込めませんでした。";
      });
    }
  }, { rootMargin: "160px" });
  sizes ??= new ResizeObserver(entries => {
    for (const entry of entries) charts.get(entry.target)?.resize();
  });
  visibility.observe(node);
}
function hbar(values: Row[], limit: number, theme: Record<string, any>, unit: string): Record<string, any> {
  const data = values.slice(0, limit).reverse();
  return {
    ...base(theme),
    tooltip: tooltip(theme, {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (parameters: Array<{ name: string; value: number }>) =>
        formatHbarTooltip(parameters[0].name, parameters[0].value, unit),
    }),
    grid: { left: 8, right: 22, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: axisText(theme),
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: data.map((row) => row.name),
      axisLabel: { color: theme.ink2, fontSize: 12 },
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
    },
    series: [{
      type: "bar",
      data: data.map((row) => row.count),
      itemStyle: { color: theme.accent, borderRadius: [0, 4, 4, 0] },
      barMaxWidth: 16,
    }],
  };
}
function vbar(
  categories: unknown[],
  values: unknown[],
  theme: Record<string, any>,
  color?: string,
): Record<string, any> {
  return {
    ...base(theme),
    tooltip: tooltip(theme, { trigger: "axis", axisPointer: { type: "shadow" } }),
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: axisText(theme),
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
    },
    yAxis: { type: "value", splitLine: { lineStyle: { color: theme.grid } }, axisLabel: axisText(theme) },
    series: [{
      type: "bar",
      data: values,
      itemStyle: { color: color ?? theme.accent, borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 34,
    }],
  };
}
function lines(
  categories: unknown[],
  series: Array<Record<string, any>>,
  theme: Record<string, any>,
  options: Record<string, any> = {},
): Record<string, any> {
  const multi = series.length > 1;
  return {
    ...base(theme),
    tooltip: tooltip(theme, { trigger: "axis" }),
    legend: multi ? { top: 0, textStyle: { color: theme.ink2, fontSize: 12 }, icon: "roundRect" } : undefined,
    grid: { left: 8, right: 16, top: multi ? 30 : 14, bottom: 8, containLabel: true },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: axisText(theme),
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: options.min,
      max: options.max,
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: axisText(theme),
    },
    series: series.map((entry) => ({
      type: "line",
      name: entry.name,
      data: entry.data,
      smooth: 0.2,
      showSymbol: true,
      symbolSize: 6,
      lineStyle: { color: entry.color, width: 2 },
      itemStyle: { color: entry.color },
      areaStyle: multi ? undefined : { color: entry.color, opacity: theme.dark ? 0.14 : 0.09 },
    })),
  };
}
function empty(theme: Record<string, any>): Record<string, any> {
  return {
    backgroundColor: "transparent",
    graphic: { type: "text", left: "center", top: "middle", style: { text: "-", fill: theme.muted, fontSize: 13 } },
  };
}

export function renderOverview(overview: Record<string, unknown>): void {
  get("dname").textContent = String(overview.display_name ?? overview.username ?? "");
  get("handle").textContent = `@${String(overview.username ?? "")}`;
  get("period").textContent = `${String(overview.first_post ?? "")} - ${String(overview.last_post ?? "")}`;
  get("tiles").innerHTML = [
    [
      text("tiles.total.label"),
      formatNumber(Number(overview.n_total ?? 0)),
      text("tiles.total.sub", {
        orig: formatNumber(Number(overview.n_original ?? 0)),
        reply: formatNumber(Number(overview.n_reply ?? 0)),
        rt: formatNumber(Number(overview.n_retweet ?? 0)),
      }, "html"),
    ],
    [
      text("tiles.days.label"),
      `${formatNumber(Number(overview.active_days ?? 0))}日`,
      text("tiles.days.sub", { avg: Number(overview.avg_per_day ?? 0) }, "html"),
    ],
    [text("tiles.likes.label"), formatNumber(Number(overview.n_like ?? 0)), text("tiles.likes.sub")],
    [text("tiles.avgfav.label"), String(overview.avg_favorite ?? 0), text("tiles.avgfav.sub")],
    [
      text("tiles.follow.label"),
      `${formatNumber(Number(overview.n_following ?? 0))} / ${formatNumber(Number(overview.n_follower ?? 0))}`,
      text("tiles.follow.sub"),
    ],
    [
      text("tiles.grok.label"),
      formatNumber(Number(overview.n_grok_chat ?? 0)),
      text("tiles.grok.sub", {
        block: formatNumber(Number(overview.n_block ?? 0)),
        mute: formatNumber(Number(overview.n_mute ?? 0)),
      }, "html"),
    ],
  ].map(([label, value, note]) =>
    `<div class="tile"><div class="v">${value}</div><div class="l">${label}</div>${
      note ? `<div class="s">${note}</div>` : ""
    }</div>`
  ).join("");
}

export function renderCharts(data: AnalysisData): void {
  const root = record(data),
    overview = record(root.overview),
    time = record(root.time),
    behavior = record(root.behavior),
    links = record(root.links),
    textData = record(root.text),
    psyche = record(root.psyche),
    persona = root.persona === null ? null : record(root.persona),
    theme = palette();
  visibility?.disconnect();
  sizes?.disconnect();
  pendingCharts.clear();
  charts.forEach(instance => instance.dispose());
  charts.clear();
  renderOverview(overview);

  chart("c_breakdown", {
    ...base(theme),
    tooltip: tooltip(theme, {
      trigger: "item",
      formatter: (parameter: Record<string, any>) =>
        `${parameter.name}\n{b|${formatNumber(Number(parameter.value))}} (${parameter.percent}%)`,
    }),
    legend: { bottom: 0, textStyle: { color: theme.ink2, fontSize: 12 }, icon: "roundRect" },
    series: [{
      type: "pie",
      radius: ["48%", "72%"],
      center: ["50%", "44%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: theme.surface, borderWidth: 2 },
      label: { show: false },
      data: [{ name: text("breakdown.original"), value: overview.n_original, itemStyle: { color: theme.series[0] } }, {
        name: text("breakdown.reply"),
        value: overview.n_reply,
        itemStyle: { color: theme.series[1] },
      }, { name: text("breakdown.retweet"), value: overview.n_retweet, itemStyle: { color: theme.series[2] } }],
    }],
  });
  const byYear = Array.isArray(time.by_year) ? time.by_year.map(record) : [],
    byMonth = Array.isArray(time.by_month) ? time.by_month.map(record) : [];
  chart("c_year", vbar(byYear.map((item) => item.year), byYear.map((item) => item.count), theme));
  chart("c_month", {
    ...lines(
      byMonth.map((item) => item.month),
      [{ data: byMonth.map((item) => item.count), color: theme.accent }],
      theme,
    ),
    // The axis labels sit at the grid bottom (containLabel). The slider lives
    // below them in its own band, so the two never overlap.
    grid: { left: 8, right: 16, top: 14, bottom: 76, containLabel: true },
    dataZoom: [{ type: "inside" }, {
      type: "slider",
      height: 22,
      bottom: 8,
      borderColor: theme.grid,
      textStyle: { color: theme.muted },
      handleStyle: { color: theme.accent },
    }],
  });
  const sleep = record(time.sleep),
    byHour = Array.isArray(time.by_hour) ? time.by_hour : [],
    byWeekday = Array.isArray(time.by_weekday) ? time.by_weekday.map(record) : [],
    heatmap = Array.isArray(time.heatmap) ? time.heatmap : [];
  const hourColors = byHour.map((_value, hour) => {
    const start = Number(sleep.start ?? 0),
      end = Number(sleep.end ?? 0),
      sleeping = start < end ? hour >= start && hour < end : hour >= start || hour < end;
    return sleeping ? theme.series[1] : theme.accent;
  });
  chart("c_hour", {
    ...vbar([...Array(24).keys()], byHour, theme),
    series: [{
      type: "bar",
      data: byHour.map((value, hour) => ({
        value,
        itemStyle: { color: hourColors[hour], borderRadius: [3, 3, 0, 0] },
      })),
      barMaxWidth: 22,
    }],
  });
  chart("c_wday", vbar(byWeekday.map((item) => item.day), byWeekday.map((item) => item.count), theme));
  chart("c_heat", {
    ...base(theme),
    tooltip: tooltip(theme, { position: "top" }),
    grid: { left: 8, right: 12, top: 10, bottom: 52, containLabel: true },
    xAxis: {
      type: "category",
      data: [...Array(24).keys()],
      axisLabel: { ...axisText(theme), interval: 1 },
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: weekdays,
      axisLabel: { color: theme.ink2, fontSize: 12 },
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
    },
    visualMap: {
      min: 0,
      max: Math.max(0, ...heatmap.map((entry: any) => Number(entry[2] ?? 0))),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 8,
      itemWidth: 12,
      itemHeight: 120,
      textStyle: { color: theme.muted, fontSize: 11 },
      inRange: { color: [theme.heat], colorAlpha: [0.08, 1] },
    },
    series: [{ type: "heatmap", data: heatmap, itemStyle: { borderColor: theme.surface, borderWidth: 1.5 } }],
  });
  get("rhythm_note").innerHTML = text("sections.rhythm.note", {
    peak: Number(time.peak_hour ?? 0),
    start: Number(sleep.start ?? 0),
    end: Number(sleep.end ?? 0),
    win: formatNumber(Number(sleep.posts_in_window ?? 0)),
  }, "html");
  chart("c_source", hbar(rows(behavior.sources), 10, theme, text("units.posts")));
  chart("c_fav", vbar(Object.keys(record(behavior.fav_buckets)), Object.values(record(behavior.fav_buckets)), theme));
  const body = get("t_top").querySelector("tbody");
  if (!body) throw new Error("top-posts table body is missing");
  body.textContent = "";
  (Array.isArray(behavior.top_posts) ? behavior.top_posts : []).map(record).forEach((post) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="txt"></td><td class="num">${escapeHtml(post.date)}</td><td class="num">${
      formatNumber(Number(post.fav ?? 0))
    }</td><td class="num">${formatNumber(Number(post.rt ?? 0))}</td>`;
    row.firstElementChild!.textContent = String(post.text ?? "");
    body.appendChild(row);
  });
  chart(
    "c_domain",
    rows(links.domains).length ? hbar(rows(links.domains), 14, theme, text("units.times")) : empty(theme),
  );
  chart(
    "c_tag",
    rows(links.hashtags).length ? hbar(rows(links.hashtags), 14, theme, text("units.times")) : empty(theme),
  );
  chart(
    "c_mention",
    rows(links.mentions).length ? hbar(rows(links.mentions), 14, theme, text("units.times")) : empty(theme),
  );

  const hasText = Object.keys(textData).length > 0;
  setVisible("sec_text", hasText);
  if (hasText) {
    get("text_note").innerHTML = text("sections.text.note", {
      count: formatNumber(Number(textData.analyzed_count ?? 0)),
      avg: Number(textData.avg_chars ?? 0),
    }, "html");
    chart(
      "c_proper",
      hbar(pairs(textData.propers).map(([name, count]) => ({ name, count })), 18, theme, text("units.times")),
    );
    chart(
      "c_noun",
      hbar(pairs(textData.nouns).map(([name, count]) => ({ name, count })), 18, theme, text("units.times")),
    );
    chart(
      "c_verb",
      hbar(pairs(textData.verbs).map(([name, count]) => ({ name, count })), 12, theme, text("units.times")),
    );
    chart(
      "c_adj",
      hbar(pairs(textData.adjs).map(([name, count]) => ({ name, count })), 12, theme, text("units.times")),
    );
    get("chips_inter").innerHTML = pairs(textData.interjections).map(([name, count]) =>
      `<span class="chip">${escapeHtml(name)}<b>${count}</b></span>`
    ).join("");
    get("chips_emoji").innerHTML = pairs(textData.emojis).map(([name, count]) =>
      `<span class="chip">${escapeHtml(name)}<b>${count}</b></span>`
    ).join("");
  }
  const hasPsyche = psyche.ok === true;
  setVisible("sec_psyche", hasPsyche);
  if (hasPsyche) {
    const sections = record(content().sections),
      psycheCopy = record(sections.psyche),
      tiles = Array.isArray(psycheCopy.tiles) ? psycheCopy.tiles.map(record) : [];
    get("psyche_tiles").innerHTML = [
      [tiles[0], `${(Number(psyche.assertive_ratio ?? 0) * 100).toFixed(1)}%`],
      [tiles[1], `${psyche.neg_rate} /千字`],
      [tiles[2], formatNumber(Number(psyche.fp_total ?? 0))],
      [tiles[3], formatNumber(Number(psyche.social_total ?? 0))],
    ].map(([item, value]) =>
      `<div class="kv"><div class="l">${escapeHtml(record(item).label)}</div><div class="v">${
        escapeHtml(value)
      }</div><div class="detail">${escapeHtml(record(item).desc)}</div></div>`
    ).join("");
    chart("c_fp", hbar(rows(psyche.fp_breakdown), 7, theme, text("units.times")));
    chart("c_emo", hbar(rows(psyche.emotion_totals), 10, theme, text("units.posts")));
    const years = Array.isArray(psyche.by_year) ? psyche.by_year.map(record) : [];
    chart(
      "c_orient",
      lines(years.map((item) => item.year), [{
        name: text("orient.positive"),
        data: years.map((item) => item.pos),
        color: theme.series[0],
      }, { name: text("orient.negative"), data: years.map((item) => item.neg_emo), color: theme.series[1] }], theme),
    );
    chart(
      "c_assert",
      lines(
        years.map((item) => item.year),
        [{
          name: text("sections.psyche.series.assert"),
          data: years.map((item) => Number((Number(item.assertive_ratio ?? 0) * 100).toFixed(1))),
          color: theme.accent,
        }],
        theme,
        { min: 0 },
      ),
    );
    chart(
      "c_negrate",
      lines(
        years.map((item) => item.year),
        [{ name: text("sections.psyche.series.neg"), data: years.map((item) => item.neg_rate), color: theme.accent }],
        theme,
        { min: 0 },
      ),
    );
  }
  setVisible("sec_persona", persona !== null);
  if (persona) {
    const sections = record(content().sections), copy = record(sections.persona), demo = record(copy.demo);
    get("demo").innerHTML = [
      [demo.gender, persona.gender === "male" ? copy.genderMale : persona.gender],
      [demo.lang, displayList(persona.languages)],
      [demo.loc, displayList(persona.location) || "-"],
      [demo.age, displayList(persona.inferred_age) || "-"],
      [demo.interests, `${formatNumber(Number(persona.n_interests ?? 0))}件`],
      [demo.audiences, persona.num_audiences == null ? "-" : formatNumber(Number(persona.num_audiences))],
    ].map(([label, value]) =>
      `<div class="kv"><div class="l">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div></div>`
    ).join("");
    get("cross_note").innerHTML = text("sections.persona.crossNote", {
      n: formatNumber(Number(persona.n_interests ?? 0)),
      v: formatNumber(Number(persona.n_verified ?? 0)),
      u: formatNumber(Number(persona.n_unmentioned ?? 0)),
    }, "html");
    chart("c_verint", hbar(rows(persona.verified_interests), 20, theme, text("units.times")));
    get("ttl_int").innerHTML = text("sections.persona.cards.interests", {
      ni: formatNumber(Number(persona.n_interests ?? 0)),
    }, "html");
    get("ttl_shows").innerHTML = text("sections.persona.cards.shows", {
      ns: formatNumber(Number(persona.n_shows ?? 0)),
    }, "html");
    get("chips_int").innerHTML = (Array.isArray(persona.interests) ? persona.interests : []).slice(0, 60).map((name) =>
      `<span class="chip">${escapeHtml(name)}</span>`
    ).join("");
    get("chips_unment").innerHTML = (Array.isArray(persona.unmentioned_sample) ? persona.unmentioned_sample : []).map((
      name,
    ) => `<span class="chip chip-off">${escapeHtml(name)}</span>`).join("");
    get("chips_shows").innerHTML = (Array.isArray(persona.shows) ? persona.shows : []).map((name) =>
      `<span class="chip">${escapeHtml(name)}</span>`
    ).join("");
  }
  get("foot").innerHTML = text("foot", { time: new Date().toLocaleString("ja-JP") }, "html");
}
