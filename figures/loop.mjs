// Fig 9.1 — A VVER-1000 plant as a bench model: reactor vessel with its drive nozzles, one loop of
// the primary circuit (hot leg → horizontal steam generator → main coolant pump → cold leg), the
// pressurizer, the steam line to a turbine with high- and low-pressure cylinders, the generator,
// the condenser and a cooling tower. Pipe colours show temperature; the power lever sets N.
import { k, G, tools, bench, card, LIVE_PRELUDE } from "./common.mjs";

const UP = [0, 0, 1], AX = [1, 0, 0], AY = [0, 1, 0];
const R = { x: -150, y: 10 };           // reactor
const SG = { x: -70, y: -30, z: 62 };   // steam generator axis along y
const PUMP = { x: -95, y: 55 };
const PZR = { x: -150, y: -75 };
const TURB = { x0: -10, x1: 120, y: -20, z: 46 };
const GEN = { x0: 128, x1: 176 };
const COND = { x: 30, y: -36, w: 86, d: 32, r: 3 };
const TOWER = { x: 150, y: -120 };

export function build() {
  const W = 700, H = 470;
  const PLATE = { x: -200, y: -170, w: 410, d: 260, r: 10 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [R.x, R.y, 124], [TOWER.x, TOWER.y, 120], [PZR.x, PZR.y, 112]], W, H, { pad: 22, azimuth: 36, elevation: 30 });
  const { at, S, L, D, depth } = tools(P);
  const items = []; // [depthKey, svg]
  const put = (part, key, svg) => items.push([depth(...key), `<g data-part="${part}">${svg}</g>`]);

  const pipe = (a, b, r, tone, flow) => {
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...dir);
    const F = G.frameAlong(a, dir.map((v) => v / len));
    const body = S(G.disc(0, len, r, F, P), { tone: "mid", crease: "none" });
    const line = flow ? `<path class="iso-line fig-flow" data-tone="${flow}" data-flowline="${flow}" d="${k.segment(a, b, P)}" style="stroke-width:1.3"/>` : "";
    return body + line;
  };
  const elbow = (c, r) => S(G.sphereOf(c, r * 1.12, P, { steps: 24 }), { tone: "mid" });

  // Cooling tower (hyperboloid) at the back right.
  const tF = G.frameAlong([TOWER.x, TOWER.y, 0], UP);
  const prof = [];
  for (let i = 0; i <= 24; i++) { const s = 4 + i * 4.5; const r = Math.sqrt(26 * 26 + ((s - 78) * 0.42) ** 2) ; prof.push([s, r, 1]); }
  const tower = [
    S(G.disc(0, 4, 46, tF, P), { tone: "lo" }),
    S(G.lathe([[4, 0], [4, prof[0][1]], ...prof.slice(1, -1), [prof[prof.length - 1][0], prof[prof.length - 1][1]], [prof[prof.length - 1][0], 0]], tF, P, { rims: "last" }), { tone: "mid" }),
    L(G.circleOf(tF, prof[prof.length - 1][0], prof[prof.length - 1][1] - 1.5, P), { tone: "lo" }),
    `<g data-steam>${[0, 1, 2].map((i) => `<path class="fig-plume" d="${k.ring(TOWER.x + i * 4 - 4, TOWER.y - i * 3, 22 - i * 4, 112 + i * 10, P, 40)}" style="opacity:.0"/>`).join("")}</g>`,
  ];
  put("tower", [TOWER.x, TOWER.y, 0], tower.join(""));

  // Pressurizer: a tall vessel with heater flange, surge line to the hot leg.
  const pF = G.frameAlong([PZR.x, PZR.y, 0], UP);
  put("pzr", [PZR.x, PZR.y, 0], [
    S(k.cylinder(PZR.x, PZR.y, 15, 0, 6, P, 40), { tone: "lo" }),
    S(G.solidOf([[6, 8], [14, 11, 1], [22, 12, 1], [96, 12, 1], [104, 11, 1], [110, 6, 1], [112, 0]], pF, P), { tone: "hi", inner: L([30, 60, 90].map((s) => G.arcOf(pF, s, 12, P)).join(""), { tone: "faint" }) }),
    S(G.disc(108, 116, 2.4, pF, P), { tone: "mid" }),
  ].join(""));

  // Reactor vessel: support ring, shell, flange, head with CRDM nozzles.
  const rF = G.frameAlong([R.x, R.y, 0], UP);
  const crdm = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) crdm.push([R.x + i * 9, R.y + j * 9]);
  const vessel = [
    S(k.cylinder(R.x, R.y, 30, 0, 8, P, 56, 0.8), { tone: "lo" }),
    S(G.solidOf([[8, 0], [8, 14], [12, 20, 1], [18, 22, 1], [80, 22], [80, 0]], rF, P), { tone: "hi", inner: L([30, 50].map((s) => G.arcOf(rF, s, 22, P)).join(""), { tone: "faint" }) }),
    S(G.disc(80, 88, 27, rF, P), { tone: "mid" }),
    D(G.dotsOf(rF, 88, 24.5, 28, P), { size: 0.5, tone: "mid" }),
    S(G.solidOf([[88, 0], [88, 23], [94, 21, 1], [100, 16, 1], [104, 8, 1], [105, 0]], rF, P), { tone: "mid" }),
  ];
  const sortedCrdm = [...crdm].sort((a, b) => depth(a[0], a[1]) - depth(b[0], b[1]));
  for (const [x, y] of sortedCrdm) {
    const top = 104 + 14 - Math.hypot(x - R.x, y - R.y) * 0.25;
    const base = 105 - Math.hypot(x - R.x, y - R.y) * 0.55;
    vessel.push(S(k.cylinder(x, y, 2.4, base, top - base, P, 16), { tone: "mid", crease: "none" }));
    vessel.push(S(k.cylinder(x, y, 3.2, top, 3, P, 18), { tone: "mid" }));
  }
  put("reactor", [R.x, R.y, 0], vessel.join(""));

  // Primary loop: hot leg reactor → SG (inlet header), cold leg SG → pump → reactor.
  const hot = [[R.x + 22, R.y - 8, 62], [SG.x - 4, R.y - 8, 62], [SG.x - 4, SG.y + 20, 62]];
  const cold = [[SG.x + 4, SG.y + 30, 50], [SG.x + 4, PUMP.y, 50], [PUMP.x + 7, PUMP.y, 50]];
  const cold2 = [[PUMP.x - 7, PUMP.y, 40], [R.x + 6, PUMP.y, 40], [R.x + 6, R.y + 18, 40]];
  const surge = [[PZR.x + 10, PZR.y + 2, 14], [PZR.x + 26, PZR.y + 2, 14], [PZR.x + 26, R.y - 8, 14], [PZR.x + 26, R.y - 8, 56]];
  const route = (pts, r, flow) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(pipe(pts[i], pts[i + 1], r, "mid", flow));
    for (let i = 1; i < pts.length - 1; i++) out.push(elbow(pts[i], r));
    return out.join("");
  };
  put("pzr", [PZR.x + 26, PZR.y + 2, 0], route(surge, 2, null));
  put("hot", [R.x + 40, R.y - 8, 0], route(hot, 5, "red"));

  // Steam generator: horizontal shell along y on two saddles, with headers and steam nozzle.
  const sF = G.frameAlong([SG.x, SG.y - 46, SG.z], AY);
  const sg = [
    ...[SG.y - 30, SG.y + 26].map((y) => S(k.slabOf({ x: SG.x - 12, y: y - 4, w: 24, d: 8, r: 1 }, 0, SG.z - 16, P, 2, 0.5), { tone: "mid" })),
    S(G.solidOf([[0, 0], [0, 8, 1], [3, 13, 1], [8, 16, 1], [84, 16, 1], [89, 13, 1], [92, 8, 1], [92, 0]], sF, P), { tone: "hi", inner: L([20, 46, 72].map((s) => G.arcOf(sF, s, 16, P)).join(""), { tone: "faint" }) }),
    S(k.cylinder(SG.x, SG.y - 4, 4, SG.z + 14, 10, P, 20), { tone: "mid" }),
    S(k.cylinder(SG.x - 4, SG.y + 20, 6, SG.z + 2, 0.1, P, 20), { tone: "mid" }),
  ];
  put("sg", [SG.x, SG.y - 40, 0], sg.join(""));

  // Main coolant pump: casing, flange, motor, motor fan cap.
  const mF = G.frameAlong([PUMP.x, PUMP.y, 0], UP);
  put("pump", [PUMP.x, PUMP.y, 0], [
    S(k.cylinder(PUMP.x, PUMP.y, 13, 0, 4, P, 40), { tone: "lo" }),
    S(G.solidOf([[4, 0], [4, 8], [30, 11, 1], [44, 10, 1], [56, 9], [56, 0]], mF, P), { tone: "mid" }),
    S(G.disc(56, 60, 12, mF, P), { tone: "mid" }),
    S(G.disc(60, 84, 10, mF, P), { tone: "hi", inner: k.fadedSvg(G.ribsOf(mF, 61, 83, 10, 36, P, { fade: [0.05, 0.45] }), { tone: "faint" }) }),
    S(G.solidOf([[84, 0], [84, 8], [88, 6, 1], [90, 0]], mF, P), { tone: "mid" }),
  ].join(""));
  put("cold", [PUMP.x - 10, PUMP.y + 2, 0], route(cold, 5, "blue") );
  put("cold", [R.x + 10, PUMP.y + 4, 0], route(cold2, 5, "blue"));

  // Steam line SG → turbine, feedwater condenser → SG.
  const steam = [[SG.x, SG.y - 4, SG.z + 24], [SG.x, SG.y - 4, 96], [TURB.x0 + 10, SG.y - 4, 96], [TURB.x0 + 10, TURB.y, 96], [TURB.x0 + 10, TURB.y, TURB.z + 16]];
  put("steam", [SG.x + 20, SG.y - 4, 0], route(steam, 4, "lit"));
  const feed = [[COND.x + 10, COND.y + COND.d, 8], [COND.x + 10, SG.y + 48, 8], [SG.x + 10, SG.y + 48, 8], [SG.x + 10, SG.y + 48, SG.z - 10]];
  put("condenser", [COND.x, SG.y + 48, 0], route(feed, 3, "blue"));

  // Condenser under the turbine.
  put("condenser", [COND.x + COND.w / 2, COND.y - 30, 0], [
    S(k.slabOf(COND, 0, 22, P, 3, 0.8), { tone: "mid", inner: L([8, 16].map((z) => k.sideSeam(COND, z, P, 3)).join(""), { tone: "faint" }) }),
    D(k.corners(COND, 3).map(([x, y]) => at([x, y, 22])), { size: 0.45 }),
  ].join(""));
  // Cooling water to the tower.
  const cw = [[COND.x + COND.w, COND.y + 10, 10], [TOWER.x - 10, COND.y + 10, 10], [TOWER.x - 10, TOWER.y + 40, 10]];
  put("tower", [COND.x + COND.w + 10, COND.y + 10, 0], route(cw, 3, "blue"));

  // Turbine on pedestals: HP cylinder, two LP cylinders, shaft, then the generator.
  const tbF = G.frameAlong([TURB.x0, TURB.y, TURB.z], AX);
  const turbine = [];
  for (const x of [TURB.x0 + 4, TURB.x0 + 42, TURB.x0 + 88, TURB.x1 + 4, GEN.x1 + 2]) turbine.push(S(k.slabOf({ x: x - 4, y: TURB.y - 10, w: 8, d: 20, r: 1 }, 24, TURB.z - 24 - 8, P, 2, 0.4), { tone: "mid" }));
  turbine.push(S(G.disc(-4, GEN.x1 - TURB.x0 + 8, 3, tbF, P), { tone: "mid", crease: "none" }));
  turbine.push(S(G.solidOf([[4, 0], [4, 10], [10, 15, 1], [26, 15, 1], [32, 10], [32, 0]], tbF, P), { tone: "hi", inner: L(G.arcOf(tbF, 18, 15, P), { tone: "faint" }) }));
  for (const s0 of [40, 84]) turbine.push(S(G.solidOf([[s0, 0], [s0, 12], [s0 + 6, 20, 1], [s0 + 30, 20, 1], [s0 + 36, 12], [s0 + 36, 0]], tbF, P), { tone: "hi", inner: L(G.arcOf(tbF, s0 + 18, 20, P), { tone: "faint" }) }));
  const gF = G.frameAlong([GEN.x0, TURB.y, TURB.z], AX);
  turbine.push(`<g data-gen data-part="generator">${S(G.disc(0, GEN.x1 - GEN.x0, 15, gF, P), { tone: "hi", lit: true, inner: `<g data-ribs>${k.fadedSvg(G.ribsOf(gF, 1, GEN.x1 - GEN.x0 - 1, 15, 40, P, { fade: [0.05, 0.45] }), { tone: "faint" })}</g>` })}</g>`);
  turbine.push(S(G.disc(GEN.x1 - GEN.x0, GEN.x1 - GEN.x0 + 4, 9, gF, P), { tone: "mid" }));
  put("turbine", [TURB.x0 + 60, TURB.y, 0], turbine.join(""));

  items.sort((a, b) => a[0] - b[0]);
  const lever = { x: -170, y: 60, w: 70, d: 12, r: 2 };
  const body = [
    `<g data-part="base">${bench(P, PLATE)}</g>`,
    ...items.map(([, svg]) => svg),
    `<g data-part="base">`,
    S(k.slabOf(lever, 0, 3, P, 3, 0.4), { tone: "mid" }),
    L(k.lineOnTop([lever.x + 5, lever.y + 6], [lever.x + lever.w - 5, lever.y + 6], 3, P), { tone: "faint" }),
    `<g data-knob>${S(k.slabOf({ x: lever.x + 2, y: lever.y - 1, w: 9, d: 14, r: 1.5 }, 3, 5, P, 3, 0.4), { tone: "hi", lit: true })}</g></g>`,
  ];

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Модель энергоблока ВВЭР-1000: корпус реактора, горячая и холодная нитки петли, горизонтальный парогенератор, главный циркуляционный насос, компенсатор давления, паропровод, турбина с цилиндрами высокого и низкого давления, генератор, конденсатор и градирня.",
    body,
  });

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const knobEl = svg.querySelector("[data-knob]");
const flows = [...svg.querySelectorAll("[data-flowline]")];
const plumes = [...svg.querySelectorAll(".fig-plume")];
const ribs = svg.querySelector("[data-ribs]");
let N = 1, target = 1, offset = 0, touring = true, clock = 0, idle = 0;
const tour = [1, 1, 0.75, 0.5, 0.5, 0.75];
flows.forEach((f) => { f.setAttribute("stroke-dasharray", "3 7"); });
const run = loop((dt, calm) => {
  if (touring) { clock += dt; target = tour[Math.floor(clock / 4) % tour.length]; }
  N = calm ? target : N + (target - N) * (1 - Math.exp(-dt / 0.8));
  knobEl.setAttribute("transform", translateAlong(P, [(N - 0.3) / 0.7 * 56, 0, 0]));
  offset += dt * 18;
  flows.forEach((f) => { const kind = f.dataset.flowline; const v = kind === "red" || (kind === "blue" && f.closest("g")) ? 1 : N; f.style.strokeDashoffset = String(-(offset * (kind === "lit" ? N * 1.6 : 1)) % 100); });
  plumes.forEach((p, i) => { p.style.opacity = String((0.05 + 0.1 * N) * (1 - i * 0.25)); });
  const tin = 289 + 8 * (1 - N), tout = tin + 31 * N;
  say("N = " + fmt(N * 100, 0) + " % · ГЦН: " + fmt(tin, 0) + " → " + fmt(tout, 0) + " °C · пар ≈ " + fmt(5870 * N, 0) + " т/ч · Nэ ≈ " + fmt(1000 * N, 0) + " МВт");
  return true;
});
stage.addEventListener("pointermove", (e) => { touring = false; target = 0.3 + 0.7 * clamp((shareX(e) - 0.15) / 0.7, 0, 1); clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; }, 5000); run(); });
stage.addEventListener("keydown", (e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); touring = false; target = clamp(target + (e.key === "ArrowRight" ? 0.05 : -0.05), 0.3, 1); run(); });
if (still.matches) touring = false;
`;

  return {
    P,
    name: "loop",
    live,
    html: card({
      name: "loop",
      fig: "Рис. 9.1",
      title: "Энергоблок ВВЭР-1000",
      hint: "Курсор влево-вправо — мощность",
      readout: "N = 100 % · 289 → 320 °C · Nэ ≈ 1000 МВт",
      label: "Энергоблок ВВЭР-1000: стрелки влево и вправо меняют мощность",
      keys: [
        { mark: "red", label: "Горячая нитка первого контура, ≈ 320 °C" },
        { mark: "blue", label: "Холодная нитка, питательная и охлаждающая вода" },
        { mark: "lit", label: "Насыщенный пар второго контура, ≈ 6,3 МПа" },
      ],
      caption:
        "Двухконтурная схема: вода первого контура под давлением 15,7 МПа не кипит, нагревается в активной зоне примерно с 289 до 320 °C и отдаёт тепло в парогенераторе воде второго контура. Насыщенный пар (≈ 6,3 МПа, 278 °C) вращает турбину и генератор с частотой 3000 об/мин, отработавший пар конденсируется, а тепло конденсатора уходит в градирню. Из 3000 МВт тепла в электричество превращается около 1000 МВт — КПД ≈ 33 %. Показан один из четырёх циркуляционных контуров.",
      svg,
    }),
  };
}
