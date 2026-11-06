// Fig 7.1 — Fuel on the bench: a VVER-1000 fuel rod lying on V-blocks, its open end showing the
// stack of UO₂ pellets that slides out, and a short section of a hexagonal TVS-2M fuel assembly
// whose top shows all 331 lattice positions (312 fuel rods, 18 guide channels, a central tube).
// Units: millimetres. Pellet Ø7,6 × 10 mm, ρ(UO₂) ≈ 10,5 г/см³, cladding Ø9,1 × 0,65 mm (Э110).
import { k, G, tools, bench, card, LIVE_PRELUDE } from "./common.mjs";

const ROD_Y = 120, ROD_Z = 26;
const R_OUT = 4.55, R_IN = 3.9, PEL_R = 3.8, PEL_L = 10, PEL_GAP = 0.25;
const ROD_X0 = -170, ROD_X1 = 120;
const NPEL = 26;
const MAX_OUT = 110;
const HEX = [-60, -40];
const PITCH = 12.75;
const RINGS = 10;
const HEX_H = 56;
const HEX_R = (RINGS * PITCH * Math.cos(Math.PI / 6) + 6.6) / Math.cos(Math.PI / 6); // across flats ≈ 234 мм

// Hexagonal lattice positions: ring n has 6n positions.
function lattice() {
  const out = [[0, 0, 0, 0]];
  const dirs = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);
  for (let n = 1; n <= RINGS; n++) {
    for (let side = 0; side < 6; side++) {
      const a = dirs[side], b = dirs[(side + 2) % 6];
      for (let s = 0; s < n; s++) out.push([(a[0] * n + b[0] * s) * PITCH, (a[1] * n + b[1] * s) * PITCH, n, s]);
    }
  }
  return out;
}
const guide = ([, , n, s]) => (n === 3 && s === 0) || (n === 5 && s === 2) || (n === 7 && s === 0) ;

export function build() {
  const W = 680, H = 420;
  const PLATE = { x: Math.min(ROD_X0, HEX[0] - HEX_R) - 30, y: HEX[1] - HEX_R - 16, w: 0, d: ROD_Y + 34 - (HEX[1] - HEX_R - 16), r: 10 };
  PLATE.w = Math.max(ROD_X1 + 70, HEX[0] + HEX_R + 120) - PLATE.x;
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [HEX[0], HEX[1] - HEX_R, HEX_H + 6]], W, H, { pad: 24, azimuth: 34, elevation: 32 });
  const { at, S, L, D } = tools(P);
  const out = [`<g data-part="base">${bench(P, PLATE, { label: false })}</g>`, `<g data-part="hex">`];

  // Hex assembly section: a standing hexagonal shroud with every lattice position on its top.
  const ring = [0, 1, 2, 3, 4, 5].map((i) => [HEX[0] + HEX_R * Math.cos((i * Math.PI) / 3), HEX[1] + HEX_R * Math.sin((i * Math.PI) / 3)]);
  const pad = [0, 1, 2, 3, 4, 5].map((i) => [HEX[0] + (HEX_R + 8) * Math.cos((i * Math.PI) / 3), HEX[1] + (HEX_R + 8) * Math.sin((i * Math.PI) / 3)]);
  out.push(`<path class="iso-halo" d="${k.extrude(pad, 0, 3, P).fill}"/>`);
  out.push(S(k.extrude(pad, 0, 4, P, { bevel: 0.6 }), { tone: "lo" }));
  out.push(S(k.extrude(ring, 4, HEX_H - 4, P, { bevel: 0.8 }), { tone: "mid", inner: L([24, 44].map((z) => k.ringSeam(ring, z, P)).join(""), { tone: "faint" }) }));
  const pts = lattice();
  const fuel = [], guides = [];
  for (const p of pts) {
    const [x, y] = [HEX[0] + p[0], HEX[1] + p[1]];
    if (p[2] === 0) guides.push(k.ring(x, y, 5.2, HEX_H, P, 20));
    else if (guide(p)) guides.push(k.ring(x, y, 6.3, HEX_H, P, 22));
    else fuel.push(k.ring(x, y, R_OUT, HEX_H, P, 14));
  }
  out.push(L(fuel.join(""), { tone: "lo" }));
  out.push(`<g data-part="guides">` + L(guides.join(""), { tone: "hi" }) + `</g>`);
  out.push(D(pts.filter((p) => !guide(p) && p[2] > 0).map((p) => at([HEX[0] + p[0], HEX[1] + p[1], HEX_H])), { size: 0.55, tone: "mid" }));
  out.push(L(k.onTop(ring.map(([x, y]) => [HEX[0] + (x - HEX[0]) * 0.97, HEX[1] + (y - HEX[1]) * 0.97]), HEX_H, P, true), { tone: "faint" }));

  out.push(`</g><g data-part="vblocks">`);
  // V-blocks for the rod.
  for (const x of [ROD_X0 + 40, -100, ROD_X1 - 30]) {
    const block = { x: x - 7, y: ROD_Y - 12, w: 14, d: 24, r: 1.5 };
    out.push(S(k.slabOf(block, 0, ROD_Z - R_OUT - 1, P, 2, 0.5), { tone: "mid", inner: L(k.sideSeam(block, 6, P, 2), { tone: "faint" }) }));
    out.push(D([at([x - 4, ROD_Y - 9, ROD_Z - R_OUT - 1]), at([x + 4, ROD_Y + 9, ROD_Z - R_OUT - 1])], { size: 0.4 }));
  }

  out.push(`</g>`);
  // The rod: a closed end plug, the cladding (an annulus, so its open end shows the bore).
  const F = G.frameAlong([ROD_X0, ROD_Y, ROD_Z], [1, 0, 0]);
  out.push(`<g data-part="cladding">` + S(G.solidOf([[-12, 0], [-12, 1.6], [-9, 2.4, 1], [-6, 3.2], [-6, 4.55], [0, 4.55]], F, P), { tone: "mid" }) + `</g>`);
  out.push(`<g data-back data-part="pellets"></g>`);
  out.push(`<g data-part="cladding">` + S(G.ringBand(0, ROD_X1 - ROD_X0, R_IN, R_OUT, F, P), { tone: "mid", inner: L([60, 130, 200].map((s) => G.arcOf(F, s, R_OUT, P)).join(""), { tone: "faint" }) }) + `</g>`);
  out.push(`<g data-front data-part="pellets"></g>`);

  // Pellets, built at rest inside the tube; live code moves them and files each into back or front.
  const pellets = [];
  for (let i = 0; i < NPEL; i++) {
    const s1 = ROD_X1 - ROD_X0 - 2 - i * (PEL_L + PEL_GAP);
    const s0 = s1 - PEL_L;
    const body = G.solidOf([[s0, 0], [s0, PEL_R - 0.5], [s0 + 0.5, PEL_R], [s1 - 0.5, PEL_R], [s1, PEL_R - 0.5], [s1, 0]], F, P);
    pellets.push(`<g data-pellet="${i}" data-s="${s1 - PEL_L / 2}">${S(body, { tone: "hi", lit: i < 0 })}${L(G.arcOf(F, s0 + PEL_L / 2, PEL_R, P), { tone: "faint" })}</g>`);
  }
  out.push(`<g data-pellets style="display:none">${pellets.join("")}</g>`);

  out.push(`<g data-part="tray">`);
  // An end cap lying on the bench and a small pellet tray.
  const capF = G.frameAlong([ROD_X1 + 40, ROD_Y + 4, R_OUT + 0.2], [1, 0, 0]);
  out.push(S(G.solidOf([[0, 0], [0, 4.55], [6, 4.55], [9, 3.2, 1], [12, 1.6], [12, 0]], capF, P), { tone: "mid" }));
  const tray = { x: HEX[0] + HEX_R + 30, y: HEX[1] - 20, w: 70, d: 30, r: 2 };
  out.push(S(k.slabOf(tray, 0, 4, P, 3, 0.5), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(tray, 2.5), 4, P, 3), { tone: "faint" }));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const cx = tray.x + 12 + i * 15, cy = tray.y + 9 + j * 12;
    out.push(S(k.cylinder(cx, cy, PEL_R, 4, PEL_L, P, 22), { tone: "hi", inner: L(k.sideArc(cx, cy, PEL_R, 9, P, 12), { tone: "faint" }) }));
    out.push(L(k.ring(cx, cy, PEL_R - 0.9, 4 + PEL_L, P, 18), { tone: "faint" }));
  }
  out.push(`</g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Твэл ВВЭР-1000 на призмах с открытым торцом, из которого выдвигается столбик таблеток диоксида урана, и отрезок шестигранной ТВС с 331 позицией решётки на торце.",
    body: out,
  });

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const END = ${ROD_X1 - ROD_X0}, MAX_OUT = ${MAX_OUT}, PEL_L = ${PEL_L};
const back = svg.querySelector("[data-back]"), front = svg.querySelector("[data-front]");
const pels = [...svg.querySelectorAll("[data-pellet]")].map((g) => ({ g, s: +g.dataset.s, side: null }));
pels.forEach((p) => back.appendChild(p.g));
let out = 0, target = 0, touring = true, clock = 0, idle = 0;
const MASS = Math.PI * 0.38 * 0.38 * 1.0 * 10.5; // г UO₂
const draw = () => {
  const move = translateAlong(P, [out, 0, 0]);
  let n = 0;
  for (const p of pels) {
    p.g.setAttribute("transform", move);
    const side = p.s + out > END + PEL_L * 0.15 ? "front" : "back";
    if (side === "front") n++;
    if (side !== p.side) { (side === "front" ? front : back).appendChild(p.g); p.side = side; }
  }
  const sorted = pels.filter((p) => p.side === "front").sort((a, b) => a.s - b.s);
  sorted.forEach((p) => front.appendChild(p.g));
  const u = MASS * 0.8815;
  say("снаружи " + n + " табл. · 1 табл. = " + fmt(MASS, 1) + " г UO₂ ≈ " + fmt(u * 50 * 24 / 1000, 1) + " МВт·ч тепла");
};
const run = loop((dt, calm) => {
  if (touring) { clock += dt; target = (0.5 - 0.5 * Math.cos(clock * 0.5)) * MAX_OUT; }
  out = calm ? target : out + (target - out) * (1 - Math.exp(-dt / 0.25));
  draw();
  return touring || Math.abs(target - out) > 0.05;
});
stage.addEventListener("pointermove", (e) => { touring = false; target = clamp((shareX(e) - 0.15) / 0.6, 0, 1) * MAX_OUT; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = Math.acos(1 - 2 * out / MAX_OUT) / 0.5; run(); }, 4000); run(); });
stage.addEventListener("keydown", (e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); touring = false; target = clamp(target + (e.key === "ArrowRight" ? 1 : -1) * PEL_L, 0, MAX_OUT); run(); });
if (still.matches) { touring = false; target = out = MAX_OUT * 0.6; }
svg.querySelector("[data-pellets]").remove();
draw();
`;

  return {
    P,
    name: "fuel",
    live,
    html: card({
      name: "fuel",
      fig: "Рис. 7.1",
      title: "Твэл и ТВС",
      hint: "Курсор вдоль стенда — таблетки",
      readout: "снаружи 0 табл.",
      label: "Твэл и ТВС: стрелки влево и вправо выдвигают таблетки по одной",
      keys: [
        { mark: "lit", label: "Таблетки UO₂ и направляющие каналы на торце ТВС" },
        { mark: "raised", label: "Оболочка твэла из сплава Э110, чехол ТВС" },
      ],
      caption:
        "Таблетка диоксида урана диаметром 7,6 мм и высотой около 10 мм весит ≈ 4,8 г; при выгорании 50 МВт·сут/кг урана она даёт около 5 МВт·ч тепла — столько же, сколько сжигание 0,6–0,8 т угля. В твэле ВВЭР-1000 высотой ≈ 3,8 м таких таблеток более трёхсот; 312 твэлов, 18 направляющих каналов и центральная трубка собраны в шестигранную ТВС с шагом решётки 12,75 мм.",
      svg,
    }),
  };
}
