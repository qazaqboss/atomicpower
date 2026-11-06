// Fig 2.1 — Binding energy per nucleon as a profile gauge: a row of gauge columns, one per
// nuclide, each as tall as its B/A; a probe carriage on the front rail rides over them and its
// arm drops onto the column under it. Values: AME2020 (rounded to 0.001 MeV).
import { k, tools, bench, card, LIVE_PRELUDE } from "./common.mjs";

const NUCLIDES = [
  ["²H", 2, 1.112], ["⁴He", 4, 7.074], ["⁶Li", 6, 5.332], ["¹²C", 12, 7.680], ["¹⁶O", 16, 7.976],
  ["²⁰Ne", 20, 8.032], ["²⁸Si", 28, 8.448], ["⁴⁰Ca", 40, 8.551], ["⁵⁶Fe", 56, 8.790], ["⁶²Ni", 62, 8.795],
  ["⁸⁴Kr", 84, 8.717], ["¹²⁰Sn", 120, 8.505], ["¹³⁸Ba", 138, 8.393], ["²⁰⁸Pb", 208, 7.868], ["²³⁵U", 235, 7.591], ["²³⁸U", 238, 7.570],
];
const PER_MEV = 8.2;
const STEP = 15;
const COL = 10.4;
const COUNT = NUCLIDES.length;
const X0 = -((COUNT - 1) * STEP) / 2;
const COL_Y = -14;
const RAIL_Y = 30;
const PLATE = { x: X0 - 34, y: -50, w: (COUNT - 1) * STEP + 68, d: 112, r: 8 };
const PANEL = { x: X0 - 14, y: -44, w: (COUNT - 1) * STEP + 28, d: 5, r: 1 };
const PANEL_H = 9.5 * PER_MEV;
const POST_H = 98;

export function build() {
  const W = 640, H = 420;
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [PANEL.x, PANEL.y, PANEL_H + 4], [X0, RAIL_Y, POST_H + 8], [-X0, RAIL_Y, POST_H + 8]], W, H, { pad: 26, azimuth: 38 });
  const { at, S, L, D } = tools(P);
  const out = [bench(P, PLATE)];

  // Back panel: a scale wall with a rule every 1 MeV and a heavier rule every 5 MeV.
  out.push(S(k.slabOf({ x: PANEL.x - 2, y: PANEL.y - 1, w: PANEL.w + 4, d: PANEL.d + 2, r: 1.2 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
  const rules = [];
  const majors = [];
  for (let mev = 1; mev <= 9; mev++) {
    const z = mev * PER_MEV;
    const d = k.segment([PANEL.x, PANEL.y + PANEL.d, z], [PANEL.x + PANEL.w, PANEL.y + PANEL.d, z], P);
    (mev % 5 === 0 ? majors : rules).push(d);
  }
  out.push(S(k.slabOf(PANEL, 3, PANEL_H - 3, P, 3, 0.4), { tone: "mid", inner: k.lineSvg(rules.join(""), { tone: "faint" }) + k.lineSvg(majors.join(""), { tone: "lo" }) }));
  for (let mev = 0; mev <= 9; mev += 1) {
    out.push(k.faceTextSvg(k.sideMatrix([PANEL.x + 2, PANEL.y + PANEL.d], mev * PER_MEV + 1.2, P, "left"), String(mev), { size: 3, tone: "lo" }));
  }
  out.push(k.faceTextSvg(k.sideMatrix([PANEL.x + PANEL.w - 40, PANEL.y + PANEL.d], PANEL_H - 5, P, "left"), "МэВ / нуклон", { size: 3, tone: "lo" }));
  out.push(D([at([PANEL.x + 4, PANEL.y + PANEL.d, PANEL_H - 4]), at([PANEL.x + PANEL.w - 4, PANEL.y + PANEL.d, PANEL_H - 4])], { size: 0.5 }));

  // Front rail with end stops.
  const rail = { x: X0 - 22, y: RAIL_Y - 4, w: (COUNT - 1) * STEP + 44, d: 8, r: 1.5 };
  out.push(S(k.slabOf(rail, 0, 4, P, 3, 0.5), { tone: "mid", inner: k.lineSvg(k.sideSeam(rail, 2, P, 3), { tone: "faint" }) }));
  out.push(k.lineSvg(k.lineOnTop([rail.x + 6, RAIL_Y], [rail.x + rail.w - 6, RAIL_Y], 4, P), { tone: "faint" }));
  for (const x of [rail.x - 5, rail.x + rail.w]) {
    out.push(S(k.slabOf({ x, y: RAIL_Y - 7, w: 5, d: 14, r: 1.2 }, 0, 9, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([x + 2.5, RAIL_Y - 3, 9]), at([x + 2.5, RAIL_Y + 3, 9])], { size: 0.45 }));
  }

  // Columns, each in its own group so the probe can be slotted between them in depth order.
  const cols = NUCLIDES.map(([, , ba], i) => {
    const x = X0 + i * STEP;
    const h = ba * PER_MEV;
    const plan = { x: x - COL / 2, y: COL_Y - COL / 2, w: COL, d: COL, r: 1 };
    const seat = { x: x - COL / 2 - 1.4, y: COL_Y - COL / 2 - 1.4, w: COL + 2.8, d: COL + 2.8, r: 1.4 };
    const body = [
      S(k.slabOf(seat, 0, 1.6, P, 3, 0.3), { tone: "lo" }),
      `<g data-col-body>${S(k.slabOf(plan, 1.6, h - 1.6, P, 3, 0.5), { tone: "hi", crease: "lo", inner: k.lineSvg(k.sideSeam(plan, 6, P, 3), { tone: "faint" }) })}</g>`,
      k.lineSvg(k.planOutline(k.insetPlan(plan, 2), h, P, 3), { tone: "faint" }),
      D([at([x, COL_Y, h])], { size: 0.45, tone: "lo" }),
    ];
    return `<g data-col="${i}">${body.join("")}</g>`;
  });

  // Probe: carriage on the rail, a post, and an arm on a clamp that slides down the post.
  const carriage = [];
  const cplan = { x: -9, y: RAIL_Y - 9, w: 18, d: 18, r: 2 };
  carriage.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(cplan, 2), 4, 0.1, P)}" style="filter:blur(4px)"/>`);
  carriage.push(S(k.slabOf(cplan, 4, 6, P, 4, 0.6), { tone: "mid", inner: k.lineSvg(k.sideSeam(cplan, 7, P, 4), { tone: "faint" }) }));
  carriage.push(D([[-6, RAIL_Y - 6], [6, RAIL_Y - 6], [-6, RAIL_Y + 6], [6, RAIL_Y + 6]].map(([x, y]) => at([x, y, 10])), { size: 0.45 }));
  carriage.push(S(k.cylinder(0, RAIL_Y, 4.2, 10, 3, P, 28), { tone: "mid" }));
  carriage.push(S(k.cylinder(0, RAIL_Y, 2.6, 13, POST_H - 13, P, 24), { tone: "mid", crease: "none", inner: k.lineSvg([40, 70].map((z) => k.sideArc(0, RAIL_Y, 2.6, z, P, 12)).join(""), { tone: "faint" }) }));
  carriage.push(S(k.cylinder(0, RAIL_Y, 3.4, POST_H, 2.4, P, 24), { tone: "mid" }));
  carriage.push(S(k.slabOf({ x: 5, y: RAIL_Y + 5, w: 5, d: 5, r: 1.4 }, 4, 4, P, 2), { tone: "mid" }));
  const arm = [];
  const clamp = { x: -5, y: RAIL_Y - 5, w: 10, d: 10, r: 2 };
  const armPlan = { x: -2.4, y: COL_Y - 2, w: 4.8, d: RAIL_Y - 5 - COL_Y + 2, r: 1.4 };
  arm.push(S(k.slabOf(armPlan, 6, 3.6, P, 3, 0.4), { tone: "mid" }));
  arm.push(D([at([0, COL_Y + 6, 9.6]), at([0, RAIL_Y - 9, 9.6])], { size: 0.4 }));
  arm.push(S(k.cylinder(0, COL_Y, 1.4, 0.2, 5.8, P, 16), { tone: "hi", crease: "none", lit: true }));
  arm.push(S(k.cylinder(0, COL_Y, 2.2, 5, 1.2, P, 16), { tone: "hi", lit: true }));
  arm.push(S(k.slabOf(clamp, 4, 8, P, 4, 0.5), { tone: "mid" }));
  arm.push(S(k.cylinder(0, RAIL_Y + 7, 2.2, 6, 4, P, 18), { tone: "mid" }));
  arm.push(k.lineSvg(k.knurl(0, RAIL_Y + 7, 2.2, 6, 10, 14, P), { tone: "lo" }));

  const startIndex = 8;
  const startX = X0 + startIndex * STEP;
  const startZ = NUCLIDES[startIndex][2] * PER_MEV;
  const probe = `<g data-probe-arm transform="${k.translateAlong(P, [startX, 0, startZ])}">${arm.join("")}</g>`;
  const probeBase = `<g data-probe-base transform="${k.translateAlong(P, [startX, 0, 0])}">${carriage.join("")}</g>`;

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Стенд-профилометр: шестнадцать мерных столбиков, по одному на нуклид от дейтерия до урана-238, высота каждого равна удельной энергии связи в МэВ на нуклон. Щуп на каретке опускается на столбик под ним.",
    body: [
      ...out,
      `<g data-cols>${cols.join("")}</g>`,
      probeBase,
      probe,
    ],
  });

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const N = ${JSON.stringify(NUCLIDES)};
const STEP = ${STEP}, X0 = ${X0}, PER = ${PER_MEV};
const cols = [...svg.querySelectorAll("[data-col]")];
const host = svg.querySelector("[data-cols]");
const arm = svg.querySelector("[data-probe-arm]");
const base = svg.querySelector("[data-probe-base]");
let x = ${startX}, target = x, z = { at: ${startZ}, rate: 0 }, touring = true, clock = 0, idle = 0, lit = -1;
const tour = [8, 1, 0, 3, 9, 14, 13];
const indexAt = (px) => Math.round((px - X0) / STEP);
function draw() {
  base.setAttribute("transform", translateAlong(P, [x, 0, 0]));
  arm.setAttribute("transform", translateAlong(P, [x, 0, z.at]));
  const i = clamp(indexAt(x), 0, N.length - 1);
  // Depth: columns at or left of the probe sit behind it, the ones to its right in front.
  const after = cols[i + 1] || null;
  if (arm.nextSibling !== after || arm.parentNode !== host) { host.insertBefore(base, after); host.insertBefore(arm, after); }
  if (i !== lit) { if (lit >= 0) cols[lit].querySelector("[data-col-body] .iso-solid").removeAttribute("data-lit"); cols[i].querySelector("[data-col-body] .iso-solid").setAttribute("data-lit", ""); lit = i; }
  const [name, A, ba] = N[i];
  const fe = ba / 8.795;
  say(name + " · A = " + A + " · " + fmt(ba, 3) + " МэВ/нуклон · Eсв ≈ " + fmt(ba * A, 0) + " МэВ");
  stage.setAttribute("aria-valuetext", name + ", " + fmt(ba, 3) + " МэВ на нуклон");
}
const run = loop((dt, calm) => {
  if (touring) { clock += dt; target = X0 + tour[Math.floor(clock / 2.4) % tour.length] * STEP; }
  x = calm ? target : x + (target - x) * (1 - Math.exp(-dt / 0.3));
  if (Math.abs(target - x) < 0.01) x = target;
  const i = clamp(indexAt(x), 0, N.length - 1);
  const dx = Math.abs(x - (X0 + i * STEP));
  const want = dx < 6 ? N[i][2] * PER : Math.max(N[i][2], (N[i + (x > X0 + i * STEP ? 1 : -1)] || N[i])[2]) * PER + 2;
  for (let s = 0; s < 4; s++) { z.rate += ((want - z.at) * 380 - z.rate * 30) * dt / 4; z.at += z.rate * dt / 4; }
  if (calm) { z.at = want; z.rate = 0; }
  draw();
  return touring || Math.abs(target - x) > 0.01 || Math.abs(z.rate) > 0.01 || Math.abs(want - z.at) > 0.01;
});
const steer = (to) => { touring = false; target = clamp(to, X0, X0 + (N.length - 1) * STEP); clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 4000); run(); };
stage.addEventListener("pointermove", (e) => steer(X0 + clamp((shareX(e) - 0.12) / 0.76, 0, 1) * (N.length - 1) * STEP));
stage.addEventListener("keydown", (e) => {
  const i = clamp(indexAt(target), 0, N.length - 1);
  let to = null;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") to = Math.min(N.length - 1, i + 1);
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = Math.max(0, i - 1);
  if (e.key === "Home") to = 0;
  if (e.key === "End") to = N.length - 1;
  if (to === null) return;
  e.preventDefault(); steer(X0 + to * STEP);
});
if (still.matches) touring = false;
draw();
`;

  return {
    name: "binding",
    live,
    html: card({
      name: "binding",
      fig: "Рис. 2.1",
      title: "Энергия связи",
      hint: "Ведите курсор вдоль стенда",
      readout: "⁵⁶Fe · A = 56 · 8,790 МэВ/нуклон",
      label: "Удельная энергия связи: стрелки влево и вправо переводят щуп от нуклида к нуклиду",
      keys: [
        { mark: "lit", label: "Щуп и столбик под ним — измеряемый нуклид" },
        { mark: "raised", label: "Высота столбика — удельная энергия связи B/A" },
      ],
      caption:
        "Кривая удельной энергии связи как ряд мерных столбиков. Максимум (≈ 8,8 МэВ/нуклон) — у ⁵⁶Fe и ⁶²Ni. Справа от максимума тяжёлые ядра связаны слабее: деление ²³⁵U (7,59) на два осколка с A ≈ 95 и 140 (≈ 8,5) выделяет ≈ 0,9 МэВ на нуклон, около 200 МэВ на акт деления. Слева — выгода синтеза: из ²H (1,11) в ⁴He (7,07).",
      svg,
    }),
  };
}
