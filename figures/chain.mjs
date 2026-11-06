// Fig 5.1 — Chain reaction table: 77 uranium nuclei on a cushioned table, neutrons rolling
// between them. A neutron that meets a nucleus may split it; each fission releases 2 or 3 new
// neutrons (ν ≈ 2,43). Cadmium blades rise from slots in the bed and absorb
// neutrons that cross them; the cushions are the reactor's edge, where neutrons leak away.
import { k, G, tools, bench, card, knob, LIVE_PRELUDE } from "./common.mjs";

const TABLE = { x: -120, y: -72, w: 240, d: 144, r: 6 };
const CUSHION = 8;
const COLS = 11, ROWS = 7, GAP = 19;
const NUC_R = 3.8;
const NUC_Z = 5;
const BLADES = [-76, -38, 0, 38, 76].map((x) => x + 9.5);
const BLADE_T = 2.4;
const BLADE_D = TABLE.d - CUSHION * 2;

export function build() {
  const W = 660, H = 420;
  const PLATE = { x: TABLE.x - 18, y: TABLE.y - 14, w: TABLE.w + 36, d: TABLE.d + 44, r: 8 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [TABLE.x, TABLE.y, 16]], W, H, { pad: 26, azimuth: 36, elevation: 34 });
  const { at, S, L, D, byDepth } = tools(P);
  const out = [`<g data-part="base">${bench(P, PLATE, { ruler: false })}</g>`, `<g data-part="table">`];

  // Table bed and cushions (the front cushion is cut by a slot per blade).
  out.push(`<path class="iso-halo" d="${k.haloOf(TABLE, 0, 4, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.slabOf(TABLE, 0, 3, P, 6, 0.8), { tone: "mid" }));
  const bed = k.insetPlan(TABLE, CUSHION);
  out.push(L(k.planOutline(k.insetPlan(bed, 4), 3, P, 4), { tone: "faint" }));
  const z0 = 3;
  const back = [
    { x: TABLE.x, y: TABLE.y, w: TABLE.w, d: CUSHION, r: 2 },
    { x: TABLE.x, y: TABLE.y + CUSHION, w: CUSHION, d: TABLE.d - CUSHION * 2, r: 1 },
  ];
  const right = { x: TABLE.x + TABLE.w - CUSHION, y: TABLE.y + CUSHION, w: CUSHION, d: TABLE.d - CUSHION * 2, r: 1 };
  for (const c of back) out.push(S(k.slabOf(c, z0, 9, P, 3, 0.5), { tone: "mid" }));

  out.push(`</g><g data-part="source">`);
  // Neutron source capsule on the left cushion.
  out.push(S(k.cylinder(TABLE.x + CUSHION / 2, 0, 3.6, z0 + 9, 4, P, 20), { tone: "hi", lit: true }));
  out.push(D([at([TABLE.x + CUSHION / 2, 0, z0 + 13])], { size: 0.6, tone: "hi" }));
  out.push(`</g>`);

  // Nuclei: a ball on a small seat each, sorted back to front; fragments are pre-built and hidden.
  const nuclei = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) nuclei.push([-(COLS - 1) * GAP / 2 + i * GAP, -(ROWS - 1) * GAP / 2 + j * GAP, j * COLS + i]);
  // Blades rise out of slots in the bed between nucleus columns; paint column by column.
  const byCol = (c) => nuclei.filter(([x]) => Math.abs(x - (-(COLS - 1) * GAP / 2 + c * GAP)) < 0.1).sort((a, b) => a[1] - b[1]);
  for (const x of BLADES) out.push(`<g data-part="table">` + L(k.planOutline({ x: x - 0.8, y: TABLE.y + CUSHION + 2, w: BLADE_T + 1.6, d: BLADE_D - 4, r: 0.5 }, 3, P, 2), { tone: "lo" }) + `</g>`);
  const layer = [];
  for (let c = 0; c < COLS; c++) {
    for (const [x, y, i] of byCol(c)) {
      const seat = L(k.ring(x, y, NUC_R + 1.2, z0, P, 20), { tone: "faint" });
      const ball = S(G.sphereOf([x, y, z0 + NUC_Z], NUC_R, P, { steps: 20 }), { tone: "hi", lit: true });
      const frags = [-1, 1].map((s) => S(G.sphereOf([x + s * 3.4, y - s * 1.2, z0 + 3], 2.5, P, { steps: 16 }), { tone: "lo", crease: "none" })).join("");
      layer.push(`<g data-nuc="${i}" data-part="nuclei">${seat}<g data-whole>${ball}</g><g data-split style="display:none">${frags}</g></g>`);
    }
    const cx = -(COLS - 1) * GAP / 2 + c * GAP;
    BLADES.forEach((bx, b) => { if (bx > cx && bx < cx + GAP) layer.push(`<g data-blade="${b}" data-part="blades"></g>`); });
  }
  out.push(`<g data-layer>${layer.join("")}</g>`);
  out.push(`<g data-part="table">` + S(k.slabOf(right, z0, 9, P, 3, 0.5), { tone: "mid" }));

  out.push(S(k.slabOf({ x: TABLE.x, y: TABLE.y + TABLE.d - CUSHION, w: TABLE.w, d: CUSHION, r: 2 }, z0, 9, P, 3, 0.5), { tone: "mid" }));
  out.push(`</g><g data-part="lever">`);
  const lever = { x: TABLE.x + 30, y: TABLE.y + TABLE.d + 8, w: TABLE.w - 60, d: 10, r: 2 };
  out.push(S(k.slabOf(lever, 0, 3, P, 3, 0.4), { tone: "mid" }));
  out.push(L(k.lineOnTop([lever.x + 6, lever.y + 5], [lever.x + lever.w - 6, lever.y + 5], 3, P), { tone: "faint" }));
  out.push(D(k.corners(lever, 2.5).map(([x, y]) => at([x, y, 3])), { size: 0.45 }));
  out.push(`<g data-slider transform="${k.translateAlong(P, [0, 0, 0])}">${S(k.slabOf({ x: lever.x + 3, y: lever.y - 1, w: 10, d: 12, r: 1.5 }, 3, 4, P, 3, 0.4), { tone: "hi", lit: true })}</g>`);
  out.push(knob(P, TABLE.x + TABLE.w - 12, TABLE.y + TABLE.d + 14, 0, 5, 5));
  out.push(`</g><g data-neutrons data-part="neutrons"></g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Стол цепной реакции: 77 ядер урана между бортами, нейтроны катятся от ядра к ядру. Кадмиевые пластины поднимаются из прорезей в столе и поглощают нейтроны.",
    body: out,
  });

  const controls = `<div class="fig-controls"><label class="fig-range">Кадмиевые пластины <input type="range" min="0" max="100" value="0" step="1" data-rods> <output data-rods-out>0 %</output></label><button type="button" data-restart>Новый запуск</button></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const NUC = ${JSON.stringify(nuclei)};
const BLADES = ${JSON.stringify(BLADES)};
const BT = ${BLADE_T}, BD = ${BLADE_D}, LEVER = ${TABLE.w - 60 - 16}, Y0 = ${TABLE.y + CUSHION}, Y1 = ${TABLE.y + TABLE.d - CUSHION};
const X0 = ${TABLE.x + CUSHION}, X1 = ${TABLE.x + TABLE.w - CUSHION}, Z = ${z0 + NUC_Z};
const SRC = [${TABLE.x + CUSHION + 2}, 0];
const nodes = [];
svg.querySelectorAll("[data-nuc]").forEach((g) => { nodes[+g.dataset.nuc] = { whole: g.querySelector("[data-whole]"), split: g.querySelector("[data-split]") }; });
const blades = []; svg.querySelectorAll("[data-blade]").forEach((g) => (blades[+g.dataset.blade] = g));
const slider = svg.querySelector("[data-slider]");
let drawnIns = -1;
const host = svg.querySelector("[data-neutrons]");
const range = root.querySelector("[data-rods]");
const rangeOut = root.querySelector("[data-rods-out]");
const NS = "http://www.w3.org/2000/svg";
let ins = 0, shownIns = 0, n = [], split = new Array(NUC.length).fill(false), fissions = 0, gens = [], wait = 0.6, touring = true, runs = 0, idle = 0;
const SPEED = 95, P_FISSION = 0.6, P_ABSORB = 0.9, P_PARASITE = 0.0015;
const pool = [];
function dot() { const c = pool.pop() || document.createElementNS(NS, "circle"); c.setAttribute("r", "1.5"); c.setAttribute("class", "fig-neutron"); host.appendChild(c); return c; }
function kill(i) { const m = n[i]; pool.push(m.el); m.el.remove(); n[i] = n[n.length - 1]; n.pop(); }
function spawn(x, y, g) { const a = Math.random() * Math.PI * 2; n.push({ x, y, vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED, g, el: dot(), skip: -1 }); }
function reset() {
  while (n.length) kill(0);
  split.fill(false); fissions = 0; gens = [];
  nodes.forEach((d) => { d.whole.style.display = ""; d.split.style.display = "none"; });
  wait = 0.8;
}
function inBlade(x) { return BLADES.some((bx) => x >= bx - 0.6 && x <= bx + BT + 0.6); }
function kEstimate() {
  const done = gens.length - 1; // the last generation is still running
  let a = 0, b = 0;
  for (let g = 0; g < done; g++) { a += gens[g]; if (g + 1 <= done) b += gens[g + 1] || 0; }
  return a > 0 ? b / a : null;
}
const run = loop((dt, calm) => {
  shownIns += (ins - shownIns) * (1 - Math.exp(-dt / 0.25));
  if (Math.abs(shownIns - drawnIns) > 0.002) {
    drawnIns = shownIns;
    blades.forEach((g, b) => { g.innerHTML = shownIns < 0.02 ? "" : solidSvg(slabOf({ x: BLADES[b], y: Y0, w: BT, d: BD, r: 0.6 }, 3, 10 * shownIns, P, 2, 0), { tone: "mid" }); });
    slider.setAttribute("transform", translateAlong(P, [LEVER * shownIns, 0, 0]));
  }
  if (wait > 0) { wait -= dt; if (wait <= 0) { for (let q = 0; q < 3; q++) { spawn(SRC[0], SRC[1] + (Math.random() - 0.5) * 20, 0); n[n.length - 1].vx = Math.abs(n[n.length - 1].vx) + 30; } } }
  const sub = 3, h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (let i = n.length - 1; i >= 0; i--) {
      const m = n[i];
      const px = m.x;
      m.x += m.vx * h; m.y += m.vy * h;
      if (m.x < X0 || m.x > X1 || m.y < Y0 || m.y > Y1) { kill(i); continue; }
      if (inBlade(m.x) && !inBlade(px) && Math.random() < P_ABSORB * shownIns) { kill(i); continue; }
      if (Math.random() < P_PARASITE) { kill(i); continue; }
      let hit = -1;
      for (let j = 0; j < NUC.length; j++) { if (split[j] || j === m.skip) continue; const dx = NUC[j][0] - m.x, dy = NUC[j][1] - m.y; if (dx * dx + dy * dy < 16) { hit = j; break; } }
      if (hit < 0) continue;
      if (Math.random() < P_FISSION) {
        split[hit] = true; fissions++;
        nodes[hit].whole.style.display = "none"; nodes[hit].split.style.display = "";
        gens[m.g] = (gens[m.g] || 0) + 1;
        const nu = Math.random() < 0.43 ? 3 : 2;
        const [x, y] = NUC[hit];
        kill(i);
        for (let c = 0; c < nu; c++) { spawn(x, y, m.g + 1); n[n.length - 1].skip = hit; }
      } else m.skip = hit;
    }
  }
  for (const m of n) { const [sx, sy] = iso([m.x, m.y, Z], P); m.el.setAttribute("cx", sx.toFixed(1)); m.el.setAttribute("cy", sy.toFixed(1)); }
  if (wait <= 0 && n.length === 0) {
    runs++;
    if (touring) { ins = [0, 0.35, 0.75][runs % 3]; range.value = String(Math.round(ins * 100)); rangeOut.textContent = range.value + " %"; }
    wait = 2.2; setTimeout(() => { if (n.length === 0) reset(); }, 1600);
  }
  const kk = kEstimate();
  const gen = gens.length;
  say("поколение " + gen + " · нейтронов " + n.length + " · делений " + fissions + "/" + NUC.length + (kk === null ? "" : " · k ≈ " + fmt(kk, 2)));
  return true;
});
range.addEventListener("input", () => { ins = +range.value / 100; rangeOut.textContent = range.value + " %"; touring = false; clearTimeout(idle); idle = setTimeout(() => (touring = true), 20000); run(); });
root.querySelector("[data-restart]").addEventListener("click", () => { reset(); wait = 0.2; run(); });
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "ArrowRight") range.value = String(Math.min(100, +range.value + 10));
  else if (e.key === "ArrowDown" || e.key === "ArrowLeft") range.value = String(Math.max(0, +range.value - 10));
  else if (e.key === "Enter" || e.key === " ") { reset(); wait = 0.2; e.preventDefault(); return; }
  else return;
  e.preventDefault(); range.dispatchEvent(new Event("input"));
});
`;

  return {
    P,
    name: "chain",
    live,
    html: card({
      name: "chain",
      fig: "Рис. 5.1",
      title: "Цепная реакция",
      hint: "Ползунок — глубина пластин",
      readout: "поколение 0 · нейтронов 0",
      label: "Стол цепной реакции: стрелки меняют глубину кадмиевых пластин, Enter запускает заново",
      keys: [
        { mark: "lit", label: "Ядро ²³⁵U и источник нейтронов" },
        { mark: "dim", label: "Осколки деления" },
        { mark: "raised", label: "Кадмиевые пластины и борта" },
      ],
      caption:
        "Каждый нейтрон либо вызывает деление, либо поглощается в кадмии и материалах, либо вылетает за борт. Если в среднем на одно деление приходится больше одного нового деления (k > 1), лавина растёт — пока не выгорит «топливо» стола; при k < 1 цепочка затухает. Пластины уменьшают k так же, как стержни СУЗ в реакторе.",
      svg,
      controls,
    }),
  };
}
