// Fig 4.1 — Shielding bench: a lead source castle, four absorber stations on slide rails
// (paper, 5 mm aluminium, 2 cm lead, 10 cm polyethylene) and a Geiger tube with a counter.
// The beam is drawn segment by segment between stations; each segment's strength is the
// product of the transmissions before it. World units are millimetres.
import { k, G, tools, bench, card, dialFace, needlePath, LIVE_PRELUDE } from "./common.mjs";

const BEAM_Z = 30;
const STATIONS = [
  { id: "paper", name: "бумага 0,1 мм", x: 78, t: 1.2, tone: "hi" },
  { id: "al", name: "Al 5 мм", x: 118, t: 5, tone: "mid" },
  { id: "pb", name: "Pb 2 см", x: 160, t: 20, tone: "mid" },
  { id: "pe", name: "ПЭ 10 см", x: 222, t: 100, tone: "mid" },
];
// Transmission of each absorber for each radiation (narrow beam).
// α: Am-241 5,5 МэВ; β: Sr-90/Y-90 (Eмакс 2,28 МэВ, пробег в Al ≈ 4 мм);
// γ: Cs-137 662 кэВ (μ/ρ: Al 0,0750, Pb 0,113, ПЭ 0,0834 см²/г);
// n: быстрые нейтроны Pu–Be, сечения выведения Σr ≈ 0,08 (Al), 0,118 (Pb), 0,123 см⁻¹ (ПЭ).
const RADIATION = [
  { id: "a", name: "α", src: "²⁴¹Am, 5,5 МэВ", T: [0, 0, 0, 0] },
  { id: "b", name: "β", src: "⁹⁰Sr/⁹⁰Y, до 2,28 МэВ", T: [0.97, 0, 0, 0] },
  { id: "g", name: "γ", src: "¹³⁷Cs, 662 кэВ", T: [1, Math.exp(-0.075 * 2.699 * 0.5), Math.exp(-0.113 * 11.35 * 2), Math.exp(-0.0834 * 0.94 * 10)] },
  { id: "n", name: "n", src: "Pu–Be, ≈ 4 МэВ", T: [1, Math.exp(-0.08 * 0.5), Math.exp(-0.118 * 2), Math.exp(-0.123 * 10)] },
];
const CASTLE = { x: 0, y: -22, w: 40, d: 44, r: 2 };
const TUBE_X0 = 352, TUBE_X1 = 402, TUBE_R = 6;
const BOX = { x: 384, y: 34, w: 46, d: 34, r: 3 };
const SLIDE = -40; // a pulled absorber slides this far back along y

export function build() {
  const W = 680, H = 400;
  const PLATE = { x: -18, y: -62, w: 470, d: 148, r: 8 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [0, -22, 62], [TUBE_X1, 0, BEAM_Z + 20]], W, H, { pad: 24, azimuth: 32, elevation: 32 });
  const { at, S, L, D } = tools(P);
  const out = [bench(P, PLATE)];

  // Source castle: lead bricks with a bored collimator on the +x face and a capsule plug on top.
  out.push(S(k.slabOf(CASTLE, 0, 8, P, 2, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(CASTLE, 1), 8, 52, P, 2, 0.6), { tone: "mid", inner: L([20, 36, 52].map((z) => k.sideSeam(k.insetPlan(CASTLE, 1), z, P, 2)).join(""), { tone: "faint" }) }));
  const face = G.frameAlong([CASTLE.x + CASTLE.w - 1, 0, BEAM_Z], [1, 0, 0]);
  out.push(L(G.circleOf(face, 0, 6, P), { tone: "lo" }));
  out.push(L(G.circleOf(face, 0, 3.2, P), { tone: "mid" }));
  out.push(S(k.cylinder(20, 0, 8, 60, 3, P, 32), { tone: "mid" }));
  out.push(S(k.cylinder(20, 0, 4, 63, 6, P, 24), { tone: "mid" }));
  out.push(D([[6, -16], [34, -16], [6, 16], [34, 16]].map(([x, y]) => at([x, y, 60])), { size: 0.45 }));
  out.push(k.faceTextSvg(k.sideMatrix([CASTLE.x + 6, CASTLE.y + CASTLE.d - 1], 14, P, "left"), "Pb", { size: 4, tone: "lo" }));

  // Slide rails for each station (across y) and a beam-height stop.
  for (const s of STATIONS) {
    const rail = { x: s.x - 6, y: SLIDE - 24, w: s.t + 12, d: 24 - SLIDE + 24, r: 1.5 };
    out.push(S(k.slabOf(rail, 0, 3, P, 3, 0.4), { tone: "lo" }));
    out.push(L(k.lineOnTop([s.x - 2, rail.y + 3], [s.x - 2, rail.y + rail.d - 3], 3, P) + k.lineOnTop([s.x + s.t + 2, rail.y + 3], [s.x + s.t + 2, rail.y + rail.d - 3], 3, P), { tone: "faint" }));
    out.push(D([at([rail.x + 2.5, rail.y + 3, 3]), at([rail.x + rail.w - 2.5, rail.y + rail.d - 3, 3])], { size: 0.4 }));
  }

  // Beam segments interleaved with absorbers (painted back to front along +x).
  const xs = [CASTLE.x + CASTLE.w, ...STATIONS.flatMap((s) => [s.x, s.x + s.t]), TUBE_X0];
  const seg = (i) => {
    const from = xs[i * 2], to = xs[i * 2 + 1];
    const d = k.segment([from, 0, BEAM_Z], [to, 0, BEAM_Z], P);
    return `<g data-seg="${i}"><path class="iso-line fig-beam" data-tone="lit" d="${d}" style="stroke-width:2.4;opacity:.16"/><path class="iso-line fig-beam" data-tone="lit" data-flow d="${d}" style="stroke-width:1.2"/></g>`;
  };
  const plateOf = (s) => {
    const plan = { x: s.x, y: -24, w: s.t, d: 48, r: Math.min(1.5, s.t / 3) };
    const body = [
      `<path class="iso-halo" d="${k.haloOf(plan, 3, 0.1, P)}" style="filter:blur(3px)"/>`,
      S(k.slabOf(plan, 3, 54, P, 2, s.t > 3 ? 0.6 : 0), { tone: s.tone, inner: s.t > 10 ? L(k.sideSeam(plan, 14, P, 2), { tone: "faint" }) : "" }),
    ];
    if (s.t >= 5) body.push(D([at([s.x + s.t / 2, -20, 57]), at([s.x + s.t / 2, 20, 57])], { size: 0.45 }));
    const pull = { x: s.x + s.t / 2 - 2, y: 24, w: 4, d: 5, r: 1 };
    body.push(S(k.slabOf(pull, 44, 6, P, 2), { tone: "mid" }));
    return `<g data-plate="${s.id}">${body.join("")}</g>`;
  };
  out.push(seg(0));
  STATIONS.forEach((s, i) => { out.push(plateOf(s)); out.push(seg(i + 1)); });

  // Detector: a Geiger–Müller tube on two V-saddles, a lead to the counter, the counter's dial.
  for (const x of [TUBE_X0 + 10, TUBE_X1 - 10]) {
    out.push(S(k.slabOf({ x: x - 3, y: -8, w: 6, d: 16, r: 1 }, 0, BEAM_Z - TUBE_R - 4, P, 2, 0.4), { tone: "mid" }));
    out.push(S(k.slabOf({ x: x - 4, y: -9, w: 8, d: 18, r: 1 }, BEAM_Z - TUBE_R - 4, 3, P, 2, 0.4), { tone: "mid" }));
  }
  const axis = G.frameAlong([TUBE_X0, 0, BEAM_Z], [1, 0, 0]);
  out.push(S(G.disc(0, 4, TUBE_R + 1.2, axis, P), { tone: "mid" }));
  out.push(S(G.disc(4, TUBE_X1 - TUBE_X0 - 6, TUBE_R, axis, P), { tone: "hi", lit: true, inner: L([14, 26, 38].map((s) => G.arcOf(axis, s, TUBE_R, P)).join(""), { tone: "faint" }) }));
  out.push(S(G.disc(TUBE_X1 - TUBE_X0 - 6, TUBE_X1 - TUBE_X0, TUBE_R + 1.6, axis, P), { tone: "mid" }));
  out.push(S(G.disc(TUBE_X1 - TUBE_X0, TUBE_X1 - TUBE_X0 + 6, 2.4, axis, P), { tone: "mid" }));
  out.push(`<path class="iso-halo" d="${k.haloOf(BOX, 0, 18, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.slabOf(BOX, 0, 18, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(BOX, 4, P, 4), { tone: "faint" }) }));
  const dial = [BOX.x + 17, BOX.y + 17];
  out.push(S(k.cylinder(dial[0], dial[1], 12, 18, 1.6, P, 48), { tone: "hi", crease: "lo" }));
  out.push(dialFace(P, dial[0], dial[1], 19.6, 12, { count: 30, every: 10, text: "имп/с", span: Math.PI, from: -Math.PI / 2 }));
  out.push(S(k.cylinder(BOX.x + 38, BOX.y + 10, 3, 18, 3, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(BOX.x + 38, BOX.y + 24, 3, 18, 3, P, 20), { tone: "mid" }));
  out.push(D(k.corners(BOX, 2.5).map(([x, y]) => at([x, y, 18])), { size: 0.45 }));
  const plug = [TUBE_X1 + 6, 0, BEAM_Z];
  out.push(k.wireSvg(at(plug), at([BOX.x + 23, BOX.y, 9]), { via: [at([TUBE_X1 + 18, 0, BEAM_Z]), at([TUBE_X1 + 18, 0, 9]), at([BOX.x + 23, 6, 9])].map((p) => p), tone: "mid" }));
  out.push(`<path data-needle class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1" d="${needlePath(P, dial[0], dial[1], 19.8, 12, 0.9, { span: Math.PI, from: -Math.PI / 2 })}"/>`);
  out.push(`<g data-blip>${D([at([BOX.x + 38, BOX.y + 10, 21])], { size: 1.3, tone: "hi" })}</g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Стенд защиты: свинцовый домик с источником, четыре поглотителя на салазках — бумага, алюминий 5 мм, свинец 2 см, полиэтилен 10 см — и счётчик Гейгера с пересчётным прибором.",
    body: out,
  });

  const controls = `<div class="fig-controls"><span class="fig-group" role="radiogroup" aria-label="Излучение">${RADIATION.map((r, i) => `<button type="button" data-rad="${i}" aria-pressed="${i === 2}">${r.name}</button>`).join("")}</span><span class="fig-group" aria-label="Поглотители">${STATIONS.map((s, i) => `<button type="button" data-abs="${i}" aria-pressed="${i === 2}">${s.name}</button>`).join("")}</span></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const RAD = ${JSON.stringify(RADIATION)};
const ST = ${JSON.stringify(STATIONS.map((s) => s.name))};
const SLIDE = ${SLIDE};
const DIAL = ${JSON.stringify(dial)};
const plates = [...svg.querySelectorAll("[data-plate]")];
const segs = [...svg.querySelectorAll("[data-seg]")];
const needle = svg.querySelector("[data-needle]");
const blip = svg.querySelector("[data-blip]");
const needleAt = ${needlePath.toString().replace(/k\.lineOnTop/g, "lineOnTop")};
let rad = 2, inside = [false, false, true, false], pos = inside.map((v) => (v ? 0 : 1)), shown = 0, flash = 0, touring = true, clock = 0, idle = 0;
const tour = [[2, [0, 0, 1, 0]], [3, [0, 0, 1, 0]], [3, [0, 0, 0, 1]], [0, [1, 0, 0, 0]], [1, [1, 0, 0, 0]], [1, [0, 1, 0, 0]], [2, [0, 1, 1, 1]]];
let tourAt = -1;
function strength() { let s = 1; const list = [1]; RAD[rad].T.forEach((t, i) => { if (inside[i]) s *= t; list.push(s); }); return list; }
function sync() {
  root.querySelectorAll("[data-rad]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.rad === rad)));
  root.querySelectorAll("[data-abs]").forEach((b) => b.setAttribute("aria-pressed", String(inside[+b.dataset.abs])));
}
const run = loop((dt, calm) => {
  if (touring) { clock += dt; const step = Math.floor(clock / 2.8) % tour.length; if (step !== tourAt) { tourAt = step; rad = tour[step][0]; inside = tour[step][1].map(Boolean); sync(); } }
  let moving = false;
  plates.forEach((g, i) => {
    const want = inside[i] ? 0 : 1;
    pos[i] = calm ? want : pos[i] + (want - pos[i]) * (1 - Math.exp(-dt / 0.22));
    if (Math.abs(want - pos[i]) < 0.002) pos[i] = want; else moving = true;
    g.setAttribute("transform", translateAlong(P, [0, SLIDE * pos[i], 0]));
  });
  const list = strength();
  segs.forEach((g, i) => { const v = list[i]; g.style.opacity = v <= 0 ? 0 : String(0.18 + 0.82 * Math.pow(v, 0.6)); });
  const out = list[list.length - 1];
  const target = out <= 0 ? 0 : clamp(1 + Math.log10(out) / 3, 0.02, 1) * 0.92;
  shown = calm ? target : shown + (target - shown) * (1 - Math.exp(-dt / 0.35));
  needle.setAttribute("d", needleAt(P, DIAL[0], DIAL[1], 19.8, 12, shown, { span: Math.PI, from: -Math.PI / 2 }));
  flash -= dt; if (!calm && Math.random() < dt * 40 * out) flash = 0.06; blip.style.opacity = flash > 0 ? 1 : 0.15;
  const used = inside.map((v, i) => (v ? ST[i] : null)).filter(Boolean);
  say(RAD[rad].name + " (" + RAD[rad].src + ") · " + (used.length ? used.join(" + ") : "без защиты") + " · I/I₀ = " + (out <= 0 ? "0" : out >= 0.995 ? "1" : fmt(out, 3)));
  return true;
});
const manual = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; tourAt = -1; run(); }, 9000); sync(); run(); };
root.querySelectorAll("[data-rad]").forEach((b) => b.addEventListener("click", () => { rad = +b.dataset.rad; manual(); }));
root.querySelectorAll("[data-abs]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.abs; inside[i] = !inside[i]; manual(); }));
stage.addEventListener("keydown", (e) => { const n = "1234".indexOf(e.key); if (n >= 0) { inside[n] = !inside[n]; manual(); e.preventDefault(); } const r = "abgn".indexOf(e.key); if (r >= 0) { rad = r; manual(); } });
if (still.matches) touring = false;
sync();
`;

  return {
    name: "shielding",
    live,
    html: card({
      name: "shielding",
      fig: "Рис. 4.1",
      title: "Защита от излучений",
      hint: "Кнопки — излучение и поглотители",
      readout: "γ (¹³⁷Cs, 662 кэВ) · Pb 2 см · I/I₀ = 0,077",
      label: "Стенд защиты: клавиши 1–4 вставляют и вынимают поглотители",
      keys: [
        { mark: "lit", label: "Пучок и детектор; яркость — доля прошедшего излучения" },
        { mark: "raised", label: "Поглотители на салазках" },
      ],
      caption:
        "α-частицы останавливает лист бумаги, β-частицы — несколько миллиметров алюминия (лёгкий материал даёт мало тормозного излучения). γ-кванты ослабляются экспоненциально, I = I₀·e^(−μx): 2 см свинца пропускают ≈ 8 % излучения ¹³⁷Cs. Быстрые нейтроны свинец почти не задерживает; их лучше всего замедляют водородсодержащие материалы — 10 см полиэтилена ослабляют поток примерно в 3,4 раза.",
      svg,
      controls,
    }),
  };
}
