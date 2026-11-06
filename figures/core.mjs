// Fig 6.1 — A critical assembly: a 5 × 5 array of fuel assemblies on a grid plate, a bank of five
// control rods hung from a drive bridge, an ion chamber and a log power meter. The rods' height
// sets the reactivity through the S-shaped integral worth curve; one-group point kinetics with
// delayed neutrons turns reactivity into power. Units: centimetres.
import { k, G, tools, bench, card, dialFace, needlePath, LIVE_PRELUDE } from "./common.mjs";

const FA = 16;           // assembly pitch
const FA_W = 15;         // assembly width
const NFA = 5;
const ZC0 = 14;          // core bottom (top of the grid plate)
const HC = 60;           // core height = rod absorber length
const ZC1 = ZC0 + HC;
const ROD_R = 2.8;
const SHAFT_R = 1.1;
const HOUSING_Z0 = ZC1 + HC + 4;
const HOUSING_Z1 = HOUSING_Z0 + 18;
const BEAM_Z = HOUSING_Z1;
const POST_X = 64;
const RODS = [-2, -1, 0, 1, 2].map((i) => i * FA);

// Physics: one delayed group, prompt generation time Λ, total bank worth 6,5 β, excess +0,5 β.
const BETA = 0.0065, LAMBDA = 1e-4, LAM = 0.0767, BANK = 6.5, EXCESS = 0.5;

export function build() {
  const W = 640, H = 470;
  const PLATE = { x: -92, y: -66, w: 184, d: 150, r: 8 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [-POST_X - 6, 0, BEAM_Z + 8], [POST_X + 6, 0, BEAM_Z + 8]], W, H, { pad: 22, azimuth: 40, elevation: 30 });
  const { at, S, L, D, byDepth } = tools(P);
  const out = [`<g data-part="base">${bench(P, PLATE)}</g>`, `<g data-part="grid">`];
  const half = (NFA * FA) / 2;

  // Grid plate on four legs.
  const grid = { x: -half - 5, y: -half - 5, w: NFA * FA + 10, d: NFA * FA + 10, r: 2 };
  out.push(`<path class="iso-halo" d="${k.haloOf(grid, 0, 4, P)}" style="filter:blur(6px)"/>`);
  for (const [x, y] of byDepth(k.corners(grid, 6))) out.push(S(k.cylinder(x, y, 3.2, 0, ZC0 - 5, P, 20), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf(grid, ZC0 - 5, 5, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(grid, ZC0 - 2.5, P, 3), { tone: "faint" }) }));

  // Left post of the bridge stands behind the core.
  const post = (x) => [
    S(k.slabOf({ x: x - 7, y: -9, w: 14, d: 18, r: 2 }, 0, 4, P, 3, 0.5), { tone: "mid" }),
    S(k.slabOf({ x: x - 4, y: -4, w: 8, d: 8, r: 1 }, 4, BEAM_Z - 4, P, 2, 0.4), { tone: "mid", inner: L([30, 60, 90, 120].map((z) => k.sideSeam({ x: x - 4, y: -4, w: 8, d: 8, r: 1 }, z, P, 2)).join(""), { tone: "faint" }) }),
    D([at([x - 4.5, -6, 4]), at([x + 4.5, 6, 4])], { size: 0.45 }),
  ].join("");
  out.push(`</g><g data-part="bridge">${post(-POST_X)}</g><g data-part="fuel">`);

  // Fuel assemblies: shroud, a top nozzle with a dot pattern of rod ends, guide hole if rodded.
  const cells = [];
  for (let j = 0; j < NFA; j++) for (let i = 0; i < NFA; i++) cells.push([-half + FA / 2 + i * FA, -half + FA / 2 + j * FA, i, j]);
  for (const [x, y, , j] of byDepth(cells, ([x, y]) => [x, y, 0])) {
    const plan = { x: x - FA_W / 2, y: y - FA_W / 2, w: FA_W, d: FA_W, r: 0.8 };
    const seams = [ZC0 + 15, ZC0 + 30, ZC0 + 45].map((z) => k.sideSeam(plan, z, P, 2)).join("");
    out.push(S(k.slabOf(plan, ZC0, HC - 3, P, 2, 0.4), { tone: "mid", inner: L(seams, { tone: "faint" }) }));
    const head = k.insetPlan(plan, 1.2);
    out.push(S(k.slabOf(head, ZC1 - 3, 3, P, 2, 0.4), { tone: "hi", crease: "lo" }));
    const rodded = j === 2;
    const dots = [];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      const px = x - 4.5 + a * 3, py = y - 4.5 + b * 3;
      if (rodded && Math.abs(px - x) < 2 && Math.abs(py - y) < 2) continue;
      dots.push(at([px, py, ZC1]));
    }
    out.push(D(dots, { size: 0.55, tone: "lo" }));
    out.push(L(k.ring(x, y, rodded ? ROD_R + 0.8 : 1.2, ZC1, P, 20), { tone: rodded ? "mid" : "faint" }));
  }

  out.push(`</g>`);
  // Cherenkov glow over the core: its strength follows the power.
  out.push(`<defs><radialGradient id="fig-core-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7fb2ff" stop-opacity=".9"/><stop offset=".55" stop-color="#3d7bff" stop-opacity=".35"/><stop offset="1" stop-color="#3d7bff" stop-opacity="0"/></radialGradient></defs>`);
  out.push(`<path data-glow data-part="glow" class="fig-glow" d="${k.ring(0, 0, half + 8, ZC1 + 1, P, 64)}" fill="url(#fig-core-glow)" style="opacity:.5"/>`);

  // Rods (rebuilt per frame), drive housings, the beam and the right post.
  out.push(`<g data-rods data-part="rods">${RODS.map((x) => `<g data-rod="${x}"></g>`).join("")}</g>`);
  out.push(`<g data-part="bridge">`);
  for (const x of RODS) {
    out.push(S(k.cylinder(x, 0, 4.6, HOUSING_Z0, HOUSING_Z1 - HOUSING_Z0, P, 28), { tone: "mid", inner: L(k.sideArc(x, 0, 4.6, HOUSING_Z0 + 6, P, 16), { tone: "faint" }) }));
    out.push(S(k.cylinder(x, 0, 2.2, HOUSING_Z0 - 2, 2, P, 18), { tone: "mid" }));
  }
  const beam = { x: -POST_X - 5, y: -6, w: POST_X * 2 + 10, d: 12, r: 1.5 };
  out.push(S(k.slabOf(beam, BEAM_Z, 7, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(beam, BEAM_Z + 3.5, P, 3), { tone: "faint" }) }));
  out.push(D(RODS.map((x) => at([x, 0, BEAM_Z + 7])), { size: 0.5 }));
  out.push(post(POST_X) + `</g><g data-part="chamber">`);

  // Ion chamber at the front-left, cabled to the power meter at the front-right.
  const ic = [-58, 46];
  out.push(S(k.cylinder(ic[0], ic[1], 6, 0, 3, P, 28), { tone: "lo" }));
  out.push(S(k.cylinder(ic[0], ic[1], 4.4, 3, 34, P, 28), { tone: "hi", inner: L([12, 24].map((z) => k.sideArc(ic[0], ic[1], 4.4, z, P, 16)).join(""), { tone: "faint" }) }));
  out.push(S(k.cylinder(ic[0], ic[1], 2.4, 37, 4, P, 18), { tone: "mid" }));
  out.push(`</g><g data-part="meter">`);
  const meter = { x: 30, y: 40, w: 46, d: 30, r: 3 };
  out.push(`<path class="iso-halo" d="${k.haloOf(meter, 0, 16, P)}" style="filter:blur(5px)"/>`);
  out.push(k.wireSvg(at([ic[0], ic[1], 41]), at([meter.x, meter.y + 15, 8]), { via: [at([ic[0], ic[1], 46]), at([ic[0] + 10, ic[1] + 14, 0]), at([meter.x - 10, meter.y + 15, 0]), at([meter.x - 4, meter.y + 15, 8])], tone: "mid" }));
  out.push(S(k.slabOf(meter, 0, 16, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(meter, 4, P, 4), { tone: "faint" }) }));
  const dial = [meter.x + 16, meter.y + 15];
  out.push(S(k.cylinder(dial[0], dial[1], 12, 16, 1.6, P, 48), { tone: "hi", crease: "lo" }));
  out.push(dialFace(P, dial[0], dial[1], 17.6, 12, { count: 35, every: 5, text: "lg N", span: Math.PI * 1.4, from: -Math.PI * 0.7 }));
  out.push(S(k.cylinder(meter.x + 37, meter.y + 9, 3.4, 16, 2, P, 20), { tone: "mid" }));
  out.push(`<g data-scram>${S(k.cylinder(meter.x + 37, meter.y + 9, 2.6, 18, 2.6, P, 20), { tone: "hi" })}</g>`);
  out.push(S(k.cylinder(meter.x + 37, meter.y + 22, 3, 16, 3, P, 20), { tone: "mid" }));
  out.push(D(k.corners(meter, 2.5).map(([x, y]) => at([x, y, 16])), { size: 0.45 }));
  out.push(`<path data-needle class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1" d="${needlePath(P, dial[0], dial[1], 17.8, 12, 0.8, { span: Math.PI * 1.4, from: -Math.PI * 0.7 })}"/>`);
  out.push(`</g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Критический стенд: 25 тепловыделяющих сборок на опорной решётке, пять стержней СУЗ на приводах под мостом, ионизационная камера и логарифмический измеритель мощности.",
    body: out,
  });

  const controls = `<div class="fig-controls"><button type="button" data-up>Поднять ↑</button><button type="button" data-down>Опустить ↓</button><button type="button" data-crit>В критику</button><button type="button" data-az class="fig-danger">АЗ</button></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const RODS = ${JSON.stringify(RODS)};
const ZC1 = ${ZC1}, HC = ${HC}, HZ0 = ${HOUSING_Z0}, RR = ${ROD_R}, SR = ${SHAFT_R};
const BETA = ${BETA}, LAMBDA = ${LAMBDA}, LAM = ${LAM}, BANK = ${BANK}, EXCESS = ${EXCESS};
const DIAL = ${JSON.stringify(dial)};
const rods = [...svg.querySelectorAll("[data-rod]")];
const glow = svg.querySelector("[data-glow]");
const needle = svg.querySelector("[data-needle]");
const needleAt = ${needlePath.toString().replace(/k\.lineOnTop/g, "lineOnTop")};
const F = (x) => x - Math.sin(2 * Math.PI * x) / (2 * Math.PI);
const rhoOf = (h) => (EXCESS - BANK * F(1 - h)) * BETA;
// Critical height: solve rho(h) = 0 by bisection.
let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (rhoOf(m) > 0) hi = m; else lo = m; }
const CRIT = (lo + hi) / 2;
let h = CRIT, target = CRIT, n = 0.5, C = BETA * 0.5 / (LAMBDA * LAM), scram = false, drawnH = -1, shownNeedle = 0, touring = true, clock = 0, idle = 0, period = Infinity;
const tour = [0, 0.06, 0, -0.05, 0];
function drawRods() {
  if (Math.abs(h - drawnH) < 0.0005) return;
  drawnH = h;
  const top = ZC1 + HC * h;
  rods.forEach((g, i) => {
    const x = RODS[i];
    let html = "";
    if (h > 0.004) html += solidSvg(cylinder(x, 0, RR, ZC1, top - ZC1, P, 24), { tone: "hi", lit: true });
    html += solidSvg(cylinder(x, 0, SR, top, HZ0 - 2 - top, P, 14), { tone: "mid", crease: "none" });
    html += solidSvg(cylinder(x, 0, RR + 0.6, top, 1.4, P, 24), { tone: "mid" });
    g.innerHTML = html;
  });
}
function step(dt) {
  const rho = Math.min(rhoOf(h), BETA * 0.95);
  const sub = 40, s = dt / sub;
  const before = n;
  for (let i = 0; i < sub; i++) {
    n = (n + s * (LAM * C + 1e-9)) / (1 - s * (rho - BETA) / LAMBDA);
    C = (C + s * (BETA / LAMBDA) * n) / (1 + s * LAM);
  }
  const rate = (n - before) / dt / Math.max(n, 1e-12);
  period = Math.abs(rate) < 1e-4 ? Infinity : 1 / rate;
  return rho;
}
const run = loop((dt, calm) => {
  if (touring && !scram) { clock += dt; target = clamp(CRIT + tour[Math.floor(clock / 9) % tour.length], 0, 1); }
  const speed = scram ? 1.6 : 0.1; // full travel: 10 s on the drives, 0,6 s when dropped
  h += clamp(target - h, -speed * dt, speed * dt);
  const rho = step(dt);
  if (n > 1.2 && !scram) { scram = true; target = 0; touring = false; }
  drawRods();
  const lg = Math.log10(Math.max(n, 1e-6));
  const share = clamp((lg + 6) / (Math.log10(1.5) + 6), 0, 1);
  shownNeedle = calm ? share : shownNeedle + (share - shownNeedle) * (1 - Math.exp(-dt / 0.15));
  needle.setAttribute("d", needleAt(P, DIAL[0], DIAL[1], 17.8, 12, shownNeedle, { span: Math.PI * 1.4, from: -Math.PI * 0.7 }));
  glow.style.opacity = String(clamp(0.08 + 0.75 * Math.pow(Math.min(n, 1.2) / 1.2, 0.7), 0, 0.9));
  const p = n >= 0.1 ? fmt(n * 100, 0) : n >= 0.001 ? fmt(n * 100, 2) : (n * 100).toExponential(1).replace(".", ",");
  const T = !isFinite(period) || Math.abs(period) > 3000 ? "∞" : (period > 0 ? "+" : "−") + fmt(Math.abs(period), 0) + " с";
  say((scram ? "АЗ! · " : "") + "стержни " + fmt(h * 100, 0) + " % · ρ = " + (rho >= 0 ? "+" : "−") + fmt(Math.abs(rho / BETA), 2) + " β · N = " + p + " % · T = " + T);
  return true;
});
const manual = (to) => { touring = false; target = clamp(to, 0, 1); clearTimeout(idle); idle = setTimeout(() => { if (!scram) { touring = !still.matches; clock = 0; } }, 15000); run(); };
const release = () => { if (scram) { scram = false; } };
stage.addEventListener("pointermove", (e) => { if (scram) return; manual(1 - clamp((shareY(e) - 0.15) / 0.6, 0, 1)); });
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") { release(); manual(target + 0.02); }
  else if (e.key === "ArrowDown") manual(target - 0.02);
  else if (e.key === "Home") { release(); manual(CRIT); }
  else return;
  e.preventDefault();
});
root.querySelector("[data-up]").addEventListener("click", () => { release(); manual(target + 0.05); });
root.querySelector("[data-down]").addEventListener("click", () => manual(target - 0.05));
root.querySelector("[data-crit]").addEventListener("click", () => { release(); manual(CRIT); });
root.querySelector("[data-az]").addEventListener("click", () => { scram = true; touring = false; target = 0; run(); });
if (still.matches) touring = false;
drawRods();
`;

  return {
    P,
    name: "core",
    live,
    html: card({
      name: "core",
      fig: "Рис. 6.1",
      title: "Управление реактором",
      hint: "Курсор вверх-вниз — стержни",
      readout: "стержни 76 % · ρ = 0 β · N = 50 %",
      label: "Критический стенд: стрелки вверх и вниз двигают стержни, Home — в критическое положение",
      keys: [
        { mark: "lit", label: "Поглощающая часть стержней СУЗ" },
        { mark: "blue", label: "Черенковское свечение — мощность" },
        { mark: "raised", label: "ТВС, мост приводов, ионизационная камера" },
      ],
      caption:
        "Пять стержней суммарной эффективностью 6,5 β; запас реактивности активной зоны +0,5 β, поэтому реактор критичен, когда стержни подняты примерно на 76 %. Эффективность стержня по высоте — S-образная кривая: в середине зоны он работает сильнее всего. Благодаря запаздывающим нейтронам (β = 0,0065) мощность меняется с периодом в десятки секунд, а не за доли миллисекунды. При N > 120 % срабатывает аварийная защита: стержни падают за доли секунды.",
      svg,
      controls,
    }),
  };
}
