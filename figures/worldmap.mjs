// Fig 15.1 — A map table: the world in equirectangular projection laid on the top of a heavy slab,
// one pin per nuclear power plant site (height grows with the operating capacity, colour shows the
// status) and the IAEA's own sites as square posts. Data: GeoNuclearData (ODbL), March 2024;
// coastlines: Natural Earth 1:110m (public domain).
import { readFileSync } from "node:fs";
import { k, tools, card, LIVE_PRELUDE } from "./common.mjs";

const ROOT = new URL("../", import.meta.url);
const DATA = JSON.parse(readFileSync(new URL("src/data/plants.json", ROOT), "utf8"));
const LAND = JSON.parse(readFileSync(new URL("src/data/ne_110m_land.json", ROOT), "utf8"));
const NUC_COUNTRIES = JSON.parse(readFileSync(new URL("src/data/ne_110m_nuclear_countries.json", ROOT), "utf8"));

export const COUNTRY_RU = {
  AE: "ОАЭ", AM: "Армения", AR: "Аргентина", AT: "Австрия", BD: "Бангладеш", BE: "Бельгия", BG: "Болгария", BR: "Бразилия", BY: "Беларусь",
  CA: "Канада", CH: "Швейцария", CN: "Китай", CZ: "Чехия", DE: "Германия", EG: "Египет", ES: "Испания", FI: "Финляндия", FR: "Франция",
  GB: "Великобритания", HU: "Венгрия", ID: "Индонезия", IN: "Индия", IR: "Иран", IT: "Италия", JP: "Япония", KR: "Республика Корея",
  KZ: "Казахстан", LT: "Литва", MX: "Мексика", NL: "Нидерланды", PK: "Пакистан", RO: "Румыния", RU: "Россия", SE: "Швеция", SI: "Словения",
  SK: "Словакия", TR: "Турция", TW: "Тайвань", UA: "Украина", US: "США", ZA: "ЮАР",
};
export const STATUS_RU = { op: "работает", uc: "строится", pl: "планируется", sd: "остановлен", so: "работа приостановлена", sc: "стройка приостановлена", cc: "стройка отменена", dc: "выведен, демонтирован", nc: "не введён", un: "нет данных" };
export const IAEA_SITES = [
  { n: "Штаб-квартира МАГАТЭ — Венский международный центр", la: 48.235, lo: 16.417, h: 26, main: true },
  { n: "Лаборатории МАГАТЭ в Зайберсдорфе", la: 47.97, lo: 16.51, h: 10 },
  { n: "Лаборатории морской среды МАГАТЭ, Монако", la: 43.73, lo: 7.42, h: 10 },
  { n: "Международный центр теоретической физики им. Абдуса Салама, Триест (с ЮНЕСКО)", la: 45.70, lo: 13.71, h: 10 },
  { n: "Региональное бюро МАГАТЭ по гарантиям, Торонто", la: 43.65, lo: -79.38, h: 10 },
  { n: "Региональное бюро МАГАТЭ по гарантиям, Токио", la: 35.68, lo: 139.69, h: 10 },
  { n: "Бюро связи МАГАТЭ, Нью-Йорк", la: 40.75, lo: -73.97, h: 8 },
  { n: "Бюро связи МАГАТЭ, Женева", la: 46.21, lo: 6.14, h: 8 },
  { n: "Банк низкообогащённого урана МАГАТЭ, Усть-Каменогорск", la: 49.95, lo: 82.61, h: 12 },
];

const SC = 1.5;
const X = (lon) => lon * SC, Y = (lat) => -lat * SC;
const TABLE = { x: -284, y: -134, w: 568, d: 230, r: 6 };
const TOP = 10;

const statusOf = (site) => {
  const s = site.u.map((u) => u[1]);
  for (const k of ["op", "uc", "so", "pl", "sd", "sc", "dc", "cc", "nc", "un"]) if (s.includes(k)) return k;
  return "un";
};
const capOp = (site) => site.u.filter((u) => u[1] === "op").reduce((a, u) => a + (u[4] || 0), 0);

export function build() {
  const W = 760, H = 400;
  const P = k.fitProjection([...k.boxCorners(TABLE, -26, TOP), [0, TABLE.y, TOP + 40]], W, H, { pad: 14, azimuth: 90, elevation: 60 });
  const { at, S, L, D } = tools(P);
  const proj = (lon, lat) => k.iso([X(lon), Y(lat), TOP], P);
  const ring = (coords) => "M" + coords.map(([lon, lat]) => proj(Math.max(-179.9, Math.min(179.9, lon)), Math.max(-58, lat))).map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L") + "Z";
  const polys = (geom) => (geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates);

  const out = [];
  // Table: legs, apron, slab.
  out.push(`<g data-part="table"><path class="iso-halo" d="${k.haloOf(TABLE, -26, 20, P)}"/>`);
  for (const [x, y] of k.corners(TABLE, 20)) out.push(S(k.slabOf({ x: x - 6, y: y - 6, w: 12, d: 12, r: 1.5 }, -26, 18, P, 2, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(TABLE, 6), -8, 6, P, 4, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf(TABLE, -2, TOP + 2, P, 6, 1), { tone: "mid", inner: L(k.sideSeam(TABLE, 3, P, 6), { tone: "faint" }) }));
  out.push(`</g>`);
  // Ocean frame, graticule, land.
  const map = [];
  map.push(L(k.planOutline({ x: X(-180), y: Y(84), w: X(180) - X(-180), d: Y(-58) - Y(84), r: 0 }, TOP, P, 2), { tone: "lo" }));
  const grat = [];
  for (let lon = -150; lon <= 150; lon += 30) grat.push(k.lineOnTop([X(lon), Y(84)], [X(lon), Y(-58)], TOP, P));
  for (let lat = -30; lat <= 60; lat += 30) grat.push(k.lineOnTop([X(-180), Y(lat)], [X(180), Y(lat)], TOP, P));
  map.push(L(grat.join(""), { tone: "faint" }));
  map.push(`<path class="iso-line" data-tone="lo" style="stroke-dasharray:2 3" d="${k.lineOnTop([X(-180), Y(0)], [X(180), Y(0)], TOP, P)}"/>`);
  const land = LAND.features.flatMap((f) => polys(f.geometry).map((p) => ring(p[0]))).join("");
  map.push(`<path class="fig-land" d="${land}"/>`);
  const nuc = NUC_COUNTRIES.features.flatMap((f) => polys(f.geometry).map((p) => ring(p[0]))).join("");
  map.push(`<path class="fig-land fig-land-nuc" d="${nuc}"/>`);
  out.push(`<g data-part="map">${map.join("")}</g>`);

  // Pins, back to front.
  const sites = DATA.sites.map((s, i) => ({ ...s, i, st: statusOf(s), cap: capOp(s) })).sort((a, b) => Y(a.la) - Y(b.la) || X(a.lo) - X(b.lo));
  const pins = [];
  const hit = [];
  for (const s of sites) {
    const x = X(s.lo), y = Y(s.la);
    const h = s.st === "op" ? 3 + Math.sqrt(s.cap) / 4.6 : 2.4;
    const r = s.st === "op" ? 1.25 : 1.0;
    pins.push(`<g class="fig-pin" data-site="${s.i}" data-st="${s.st}" data-c="${s.c}">${S(k.cylinder(x, y, r, TOP, h, P, 10), { tone: "mid", crease: "none" })}</g>`);
    const [sx, sy] = k.iso([x, y, TOP + h], P);
    hit.push([s.i, +sx.toFixed(1), +sy.toFixed(1)]);
  }
  out.push(`<g data-part="pins">${pins.join("")}</g>`);
  // IAEA posts: square prisms (a 4-step cylinder turned 45°).
  const posts = [];
  IAEA_SITES.forEach((p, i) => {
    const x = X(p.lo), y = Y(p.la);
    posts.push(`<g class="fig-iaea" data-iaea="${i}">${S(k.cylinder(x, y, p.main ? 2.6 : 1.7, TOP, p.h, P, 4), { tone: "hi", lit: true })}</g>`);
    const [sx, sy] = k.iso([x, y, TOP + p.h], P);
    hit.push([-1 - i, +sx.toFixed(1), +sy.toFixed(1)]);
  });
  out.push(`<g data-part="iaea">${posts.join("")}</g>`);
  out.push(`<circle data-cursor class="fig-cursor" r="5" cx="-20" cy="-20"/>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Карта мира на столе: каждая атомная станция отмечена штырьком, высота которого растёт с мощностью работающих блоков, цвет показывает статус; квадратные столбики — офисы и лаборатории МАГАТЭ.",
    body: out,
  });

  // Compact data for the page: site index → name, country, units.
  const compact = DATA.sites.map((s) => [s.n, s.c, s.u.map((u) => [u[0], u[1], u[2], u[4]])]);
  const controls = `<div class="fig-controls" data-filters>
    <button type="button" data-f="all" aria-pressed="true">Все</button>
    <button type="button" data-f="op" aria-pressed="false"><i class="dot" data-st="op"></i>Работают</button>
    <button type="button" data-f="uc" aria-pressed="false"><i class="dot" data-st="uc"></i>Строятся</button>
    <button type="button" data-f="pl" aria-pressed="false"><i class="dot" data-st="pl"></i>Планируются</button>
    <button type="button" data-f="sd" aria-pressed="false"><i class="dot" data-st="sd"></i>Остановлены</button>
    <button type="button" data-f="iaea" aria-pressed="false"><i class="dot" data-st="iaea"></i>МАГАТЭ</button>
  </div>
  <div class="map-info" data-map-info><b>Наведите курсор на штырёк</b><span>или коснитесь его на телефоне, чтобы увидеть станцию и её блоки.</span></div>`;

  const live = `
${LIVE_PRELUDE}
const SITES = ${JSON.stringify(compact)};
const HIT = ${JSON.stringify(hit)};
const IAEA = ${JSON.stringify(IAEA_SITES.map((p) => p.n))};
const CRU = ${JSON.stringify(COUNTRY_RU)};
const SRU = ${JSON.stringify(STATUS_RU)};
const pins = new Map([...svg.querySelectorAll("[data-site]")].map((g) => [+g.dataset.site, g]));
const posts = [...svg.querySelectorAll("[data-iaea]")];
const cursor = svg.querySelector("[data-cursor]");
const info = root.querySelector("[data-map-info]");
let filter = "all", hot = null, pinned = null;
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const isShown = (id) => {
  if (id < 0) return filter === "all" || filter === "iaea";
  const st = pins.get(id).dataset.st;
  if (filter === "all") return true;
  if (filter === "sd") return ["sd", "so", "dc", "cc", "nc", "sc", "un"].includes(st);
  return st === filter;
};
function applyFilter() {
  pins.forEach((g, id) => (g.style.display = isShown(id) ? "" : "none"));
  posts.forEach((g) => (g.style.display = isShown(-1) ? "" : "none"));
  root.querySelectorAll("[data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
}
function show(id) {
  if (hot === id) return;
  if (hot !== null && hot >= 0) pins.get(hot).removeAttribute("data-hot");
  if (hot !== null && hot < 0) posts[-1 - hot].removeAttribute("data-hot");
  hot = id;
  if (id === null) { cursor.setAttribute("cx", -20); return; }
  const h = HIT.find((x) => x[0] === id);
  cursor.setAttribute("cx", h[1]); cursor.setAttribute("cy", h[2]);
  if (id < 0) {
    posts[-1 - id].setAttribute("data-hot", "");
    info.innerHTML = "<b>" + esc(IAEA[-1 - id]) + "</b><span>Объект МАГАТЭ</span>";
    say(IAEA[-1 - id]);
    return;
  }
  pins.get(id).setAttribute("data-hot", "");
  const [name, c, units] = SITES[id];
  const op = units.filter((u) => u[1] === "op");
  const cap = op.reduce((a, u) => a + (u[3] || 0), 0);
  say(name + " · " + (CRU[c] || c) + " · блоков " + units.length + (op.length ? " · работают " + op.length + " (" + cap + " МВт)" : ""));
  info.innerHTML = "<b>" + esc(name) + " <small>" + esc(CRU[c] || c) + "</small></b><ul>" + units.map((u) => "<li><span class='dot' data-st='" + u[1] + "'></span>" + esc(u[0]) + " — " + esc(SRU[u[1]] || u[1]) + (u[2] ? ", " + esc(u[2]) : "") + (u[3] ? ", " + u[3] + " МВт" : "") + "</li>").join("") + "</ul>";
}
function nearest(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  let best = null, bd = 64;
  for (const [id, x, y] of HIT) { if (!isShown(id)) continue; const d = (x - p.x) ** 2 + (y - p.y) ** 2; if (d < bd) { bd = d; best = id; } }
  return best;
}
stage.addEventListener("pointermove", (e) => { if (pinned === null) show(nearest(e)); });
stage.addEventListener("pointerdown", (e) => { const id = nearest(e); pinned = id; show(id); });
stage.addEventListener("pointerleave", () => { if (pinned === null) show(null); });
root.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; pinned = null; show(null); applyFilter(); }));
window.addEventListener("map:country", (e) => {
  const c = e.detail;
  pins.forEach((g) => g.toggleAttribute("data-dim", c && g.dataset.c !== c));
  root.scrollIntoView({ behavior: "smooth", block: "center" });
});
// Start on the IAEA headquarters.
show(-1);
`;

  const totalOp = DATA.sites.reduce((a, s) => a + s.u.filter((u) => u[1] === "op").length, 0);
  const capTotal = DATA.sites.reduce((a, s) => a + capOp(s), 0);
  return {
    P,
    name: "worldmap",
    live,
    stats: { sites: DATA.sites.length, units: DATA.sites.reduce((a, s) => a + s.u.length, 0), op: totalOp, gw: capTotal / 1000 },
    html: card({
      name: "worldmap",
      fig: "Рис. 15.1",
      title: "Атомные станции мира",
      hint: "Наведите на штырёк",
      readout: IAEA_SITES[0].n,
      label: "Карта атомных станций мира и объектов МАГАТЭ",
      keys: [
        { mark: "green", label: "Работает (высота — мощность)" },
        { mark: "blue", label: "Строится" },
        { mark: "dim", label: "Остановлена или выведена" },
        { mark: "lit", label: "Объекты МАГАТЭ" },
      ],
      caption: `${DATA.sites.length} площадок АЭС и ${DATA.sites.reduce((a, s) => a + s.u.length, 0)} энергоблоков с известными координатами, из них ${totalOp} работающих общей мощностью около ${Math.round(capTotal / 1000)} ГВт (по данным базы GeoNuclearData на март 2024 г.). Белые квадратные столбики — штаб-квартира МАГАТЭ в Вене, лаборатории, региональные бюро и Банк НОУ в Усть-Каменогорске. Данные: GeoNuclearData (Cristian Stoica, лицензия ODbL), береговые линии — Natural Earth.`,
      svg,
      controls,
    }),
  };
}
