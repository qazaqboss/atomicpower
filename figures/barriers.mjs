// Fig 10.1 — Four physical barriers as a nest of shells on a bench: the UO₂ pellet stack,
// the fuel cladding, the reactor vessel (primary circuit boundary) and the containment.
// Opening a barrier lifts that shell off the one inside it. A teaching model, not to scale.
import { k, G, tools, bench, card, LIVE_PRELUDE } from "./common.mjs";

const UP = [0, 0, 1];
const BARRIERS = [
  { id: "pellets", name: "Топливная матрица", holds: "удерживает большую часть продуктов деления в кристаллической решётке UO₂" },
  { id: "cladding", name: "Оболочка твэла", holds: "герметичная трубка из циркониевого сплава удерживает газообразные и летучие продукты деления" },
  { id: "vessel", name: "Граница первого контура", holds: "корпус реактора и трубопроводы держат теплоноситель под давлением 15,7 МПа" },
  { id: "containment", name: "Защитная оболочка", holds: "железобетонный контаймент с металлической облицовкой удерживает выбросы даже при разрыве контура" },
];
const LIFT = { cladding: 47, vessel: 118, containment: 262 };

export function build() {
  const W = 620, H = 600;
  const PLATE = { x: -110, y: -100, w: 220, d: 200, r: 10 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [0, 0, 138 + LIFT.containment], [-80, 0, 0], [80, 0, 0]], W, H, { pad: 22, azimuth: 40, elevation: 28 });
  const { at, S, L, D } = tools(P);
  const F = G.frameAlong([0, 0, 0], UP);
  const out = [`<g data-part="base">${bench(P, PLATE)}`];
  out.push(S(k.cylinder(0, 0, 84, 0, 4, P, 96, 0.8), { tone: "lo" }));
  out.push(L(k.ring(0, 0, 80, 4, P, 96), { tone: "faint" }));
  out.push(D(G.dotsOf(G.frameAlong([0, 0, 4], UP), 0, 81.5, 24, P, { all: true }), { size: 0.45, tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 16, 4, 6, P, 48), { tone: "mid" }));
  out.push(`</g>`);

  // Barrier 1: pellet stack on a base plug.
  const pel = [];
  for (let i = 0; i < 5; i++) {
    const z0 = 10 + i * 8.4;
    pel.push(S(k.cylinder(0, 0, 4.6, z0, 8, P, 28), { tone: "hi", lit: true, inner: L(k.sideArc(0, 0, 4.6, z0 + 4, P, 14), { tone: "faint" }) }));
  }
  out.push(`<g data-part="pellets">${pel.join("")}</g>`);

  // Barrier 2: cladding tube with end plug.
  const clad = G.frameAlong([0, 0, 9], UP);
  out.push(`<g data-part="cladding" data-lift="cladding">${S(G.solidOf([[0, 0], [0, 6], [58, 6], [61, 5, 1], [63, 3, 1], [64, 0]], clad, P), { tone: "mid", inner: L([12, 30, 48].map((s) => G.arcOf(clad, s, 6, P)).join(""), { tone: "faint" }) })}</g>`);

  // Barrier 3: reactor vessel with nozzles and a bolted head.
  const v = [];
  v.push(S(G.solidOf([[6, 0], [6, 20], [9, 26, 1], [14, 28], [70, 28], [70, 0]], F, P), { tone: "mid", inner: L([30, 50].map((s) => G.arcOf(F, s, 28, P)).join(""), { tone: "faint" }) }));
  for (const a of [0.25, 1.25, 2.25]) {
    const dir = [Math.cos(a), Math.sin(a), 0];
    const N = G.frameAlong([dir[0] * 27, dir[1] * 27, 60], dir);
    v.push(S(G.disc(0, 10, 5, N, P), { tone: "mid" }), S(G.disc(10, 13, 7, N, P), { tone: "mid" }));
  }
  v.push(S(G.disc(70, 76, 33, F, P), { tone: "mid" }));
  v.push(D(G.dotsOf(F, 76, 30.5, 24, P), { size: 0.5, tone: "mid" }));
  v.push(S(G.solidOf([[76, 0], [76, 29], [82, 26, 1], [88, 18, 1], [91, 8, 1], [92, 0]], F, P), { tone: "mid" }));
  for (const [x, y] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, 0]]) v.push(S(k.cylinder(x, y, 2.4, 88, 14, P, 16), { tone: "mid", crease: "none" }));
  out.push(`<g data-part="vessel" data-lift="vessel">${v.join("")}</g>`);

  // Barrier 4: containment: cylinder wall, dome, ring seams, equipment hatch, a crane rail ring.
  const c = [];
  const dome = [[0, 0], [0, 70], [96, 70], [100, 69.5, 1], [112, 64, 1], [124, 52, 1], [133, 34, 1], [137, 16, 1], [138, 0]];
  c.push(S(G.solidOf(dome, F, P), { tone: "mid", inner: L([20, 44, 68, 92].map((s) => G.arcOf(F, s, 70, P)).join(""), { tone: "faint" }) }));
  const hatchDir = k.towardViewer(P);
  const hatch = G.frameAlong([hatchDir[0] * 69.5, hatchDir[1] * 69.5, 26], [hatchDir[0], hatchDir[1], 0]);
  c.push(S(G.disc(0, 4, 12, hatch, P), { tone: "mid" }), S(G.disc(4, 6, 9, hatch, P), { tone: "hi" }));
  c.push(D(G.dotsOf(hatch, 4, 10.5, 14, P, { all: true }), { size: 0.45, tone: "mid" }));
  out.push(`<g data-part="containment" data-lift="containment">${c.join("")}</g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Учебная модель четырёх барьеров безопасности: столбик топливных таблеток, оболочка твэла, корпус реактора и защитная оболочка, вложенные друг в друга.",
    body: out,
  });

  const controls = `<div class="fig-controls">${BARRIERS.map((b, i) => `<button type="button" data-open="${i}" aria-pressed="false">${4 - i}. ${b.name}</button>`).reverse().join("")}</div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const B = ${JSON.stringify(BARRIERS)};
const LIFT = ${JSON.stringify(LIFT)};
const shells = { cladding: svg.querySelector('[data-lift="cladding"]'), vessel: svg.querySelector('[data-lift="vessel"]'), containment: svg.querySelector('[data-lift="containment"]') };
let open = 0, target = 0, shown = { cladding: 0, vessel: 0, containment: 0 }, touring = true, clock = 0, idle = 0;
// open: how many outer barriers are lifted (0..3): 1 = containment, 2 = + vessel, 3 = + cladding.
const order = ["containment", "vessel", "cladding"];
const run = loop((dt, calm) => {
  if (touring) { clock += dt; target = [0, 1, 2, 3, 3, 0][Math.floor(clock / 3) % 6]; }
  let moving = false;
  order.forEach((id, i) => {
    const want = target > i ? 1 : 0;
    shown[id] = calm ? want : shown[id] + (want - shown[id]) * (1 - Math.exp(-dt / 0.4));
    if (Math.abs(want - shown[id]) < 0.002) shown[id] = want; else moving = true;
    shells[id].setAttribute("transform", translateAlong(P, [0, 0, LIFT[id] * shown[id]]));
  });
  const inner = 3 - target; // index of the barrier now on the outside
  const b = B[inner];
  say("открыто " + target + " из 3 · снаружи: " + b.name.toLowerCase() + " (барьер " + (inner + 1) + ")");
  root.querySelectorAll("[data-open]").forEach((btn) => btn.setAttribute("aria-pressed", String(+btn.dataset.open === inner)));
  return touring || moving;
});
const pick = (inner) => { touring = false; target = 3 - inner; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 12000); run(); };
root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => pick(+b.dataset.open)));
stage.addEventListener("keydown", (e) => { if (e.key === "ArrowUp") pick(Math.max(0, 3 - Math.min(3, target + 1))); else if (e.key === "ArrowDown") pick(3 - Math.max(0, target - 1)); else return; e.preventDefault(); });
if (still.matches) touring = false;
`;

  return {
    P,
    name: "barriers",
    live,
    html: card({
      name: "barriers",
      fig: "Рис. 10.1",
      title: "Барьеры безопасности",
      hint: "Кнопки — открыть барьер",
      readout: "открыто 0 из 3 · снаружи: защитная оболочка",
      label: "Четыре барьера безопасности: стрелки вверх и вниз открывают и закрывают барьеры",
      keys: [
        { mark: "lit", label: "Топливные таблетки UO₂ — первый барьер" },
        { mark: "raised", label: "Оболочка твэла, корпус реактора, защитная оболочка" },
      ],
      caption:
        "Глубокоэшелонированная защита опирается на последовательные физические барьеры на пути радиоактивных веществ: топливную матрицу, оболочку твэла, границу первого контура и герметичную защитную оболочку. Выброс в окружающую среду возможен, только если отказали все барьеры. Модель учебная: размеры барьеров не в масштабе, у реального контаймента ВВЭР-1200 диаметр около 44 м.",
      svg,
      controls,
    }),
  };
}
