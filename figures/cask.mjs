// Fig 12.1 — Dry storage of spent fuel: a ventilated cask on a concrete pad, its lid lifted by a
// crane yoke over a basket of spent fuel assemblies. Each assembly's top glows with its decay heat,
// which falls with cooling time. Decay heat per tonne of heavy metal for burn-up ≈ 50 МВт·сут/кг
// is an order-of-magnitude estimate (log–log interpolation of typical published curves).
import { k, G, tools, bench, card, LIVE_PRELUDE } from "./common.mjs";

const UP = [0, 0, 1];
const R = 46, HC = 104, LID_H = 10;
// [years, kW per tonne HM] — typical values for ~50 GWd/t UO₂ fuel.
const HEAT = [[1, 10], [5, 2.6], [10, 1.6], [30, 1.0], [50, 0.75], [100, 0.4], [300, 0.15], [1000, 0.07]];
const TU_PER_FA = 0.43; // т тяжёлого металла в одной ТВС ВВЭР-1000 (≈ 0,43 т U)

function cells() {
  const out = [];
  const pitch = 14.5;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const x = i * pitch, y = j * pitch;
    if (Math.hypot(x, y) + 9 < R - 6) out.push([x, y]);
  }
  return out;
}

export function build() {
  const W = 620, H = 520;
  const PLATE = { x: -96, y: -90, w: 192, d: 180, r: 10 };
  const LIFT = 70;
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [0, 0, HC + LID_H + LIFT + 46], [-R, 0, 0], [R, 0, 0]], W, H, { pad: 22, azimuth: 40, elevation: 32 });
  const { at, S, L, D } = tools(P);
  const F = G.frameAlong([0, 0, 0], UP);
  const out = [`<g data-part="base">${bench(P, PLATE)}${S(k.slabOf({ x: -70, y: -70, w: 140, d: 140, r: 4 }, 0, 6, P, 4, 0.8), { tone: "lo", inner: L(k.sideSeam({ x: -70, y: -70, w: 140, d: 140, r: 4 }, 3, P, 4), { tone: "faint" }) })}${L(k.planOutline({ x: -64, y: -64, w: 128, d: 128, r: 3 }, 6, P, 4), { tone: "faint" })}</g>`];

  // Cask body: steel shell with ribs (fins) and inlet vents near the base, trunnions.
  const body = [];
  body.push(S(G.solidOf([[6, 0], [6, R + 2], [12, R + 2], [12, R], [HC + 6, R], [HC + 6, 0]], F, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(F, 16, HC, R, 48, P, { fade: [0.06, 0.5] }), { tone: "faint" }) + L([30, 60, 90].map((s) => G.arcOf(F, s, R, P)).join(""), { tone: "faint" }) }));
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const dir = [Math.cos(a + 0.7), Math.sin(a + 0.7), 0];
    const T = G.frameAlong([dir[0] * (R - 1), dir[1] * (R - 1), HC - 8], dir);
    body.push(S(G.disc(0, 7, 4.4, T, P), { tone: "mid" }));
  }
  out.push(`<g data-part="cask">${body.join("")}</g>`);

  // Basket with assemblies (inside, seen when the lid is off): each cell gets a heat tint.
  const z = HC + 6;
  const cs = cells();
  const basket = [L(k.ring(0, 0, R - 4, z, P, 72), { tone: "lo" })];
  cs.forEach(([x, y], i) => {
    const plan = { x: x - 6.4, y: y - 6.4, w: 12.8, d: 12.8, r: 0.6 };
    basket.push(L(k.planOutline(plan, z, P, 2), { tone: "lo" }));
    basket.push(`<path data-heat="${i}" class="fig-heat" d="${k.planOutline(k.insetPlan(plan, 1.6), z, P, 2)}"/>`);
    basket.push(D([at([x, y, z])], { size: 0.5, tone: "mid" }));
  });
  out.push(`<g data-part="basket">${basket.join("")}</g>`);

  // Lid and the crane yoke above it (they move together).
  const lid = [];
  lid.push(S(G.disc(0, LID_H, R + 1, G.frameAlong([0, 0, z], UP), P), { tone: "mid" }));
  lid.push(D(G.dotsOf(G.frameAlong([0, 0, z], UP), LID_H, R - 3, 36, P, { all: true }), { size: 0.45, tone: "mid" }));
  lid.push(S(k.cylinder(0, 0, 10, z + LID_H, 4, P, 32), { tone: "mid" }));
  for (const [x, y] of [[-24, 0], [24, 0]]) lid.push(S(k.slabOf({ x: x - 3, y: y - 3, w: 6, d: 6, r: 1 }, z + LID_H, 8, P, 2, 0.4), { tone: "mid" }));
  const yoke = { x: -30, y: -4, w: 60, d: 8, r: 2 };
  const yz = z + LID_H + 30;
  lid.push(k.wireSvg(at([-24, 0, z + LID_H + 8]), at([-6, 0, yz]), { tone: "mid", ends: "both" }));
  lid.push(k.wireSvg(at([24, 0, z + LID_H + 8]), at([6, 0, yz]), { tone: "mid", ends: "both" }));
  lid.push(S(k.slabOf(yoke, yz, 6, P, 3, 0.5), { tone: "mid" }));
  lid.push(S(k.cylinder(0, 0, 3, yz + 6, 16, P, 18), { tone: "mid", crease: "none" }));
  out.push(`<g data-part="lid"><g data-lid>${lid.join("")}</g></g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Контейнер сухого хранения отработавшего топлива на бетонной площадке. Крышку поднимает траверса крана; внутри корзина с тепловыделяющими сборками, подсвеченными по остаточному тепловыделению.",
    body: out,
  });

  const controls = `<div class="fig-controls"><button type="button" data-lidbtn aria-pressed="true">Крышка снята</button></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const HEAT = ${JSON.stringify(HEAT)};
const N = ${cs.length}, TU = ${TU_PER_FA}, LIFT = ${LIFT};
const lid = svg.querySelector("[data-lid]");
const heats = [...svg.querySelectorAll("[data-heat]")];
const btn = root.querySelector("[data-lidbtn]");
let lg = Math.log10(5), target = lg, open = 1, openT = 1, touring = true, clock = 0, idle = 0;
const heatAt = (t) => {
  const x = Math.log10(t);
  for (let i = 0; i < HEAT.length - 1; i++) {
    const [t0, q0] = HEAT[i], [t1, q1] = HEAT[i + 1];
    const a = Math.log10(t0), b = Math.log10(t1);
    if (x <= b || i === HEAT.length - 2) { const f = (x - a) / (b - a); return Math.pow(10, Math.log10(q0) + f * (Math.log10(q1) - Math.log10(q0))); }
  }
};
const run = loop((dt, calm) => {
  if (touring) { clock += dt; target = Math.log10([5, 10, 40, 100, 300][Math.floor(clock / 2.6) % 5]); }
  lg = calm ? target : lg + (target - lg) * (1 - Math.exp(-dt / 0.4));
  open = calm ? openT : open + (openT - open) * (1 - Math.exp(-dt / 0.35));
  lid.setAttribute("transform", translateAlong(P, [0, 0, LIFT * open]));
  const t = Math.pow(10, lg);
  const q = heatAt(t);
  const glow = Math.max(0, Math.min(1, (Math.log10(q) + 1.2) / 2.2));
  heats.forEach((h) => { h.style.opacity = (0.15 + 0.85 * glow).toFixed(3); });
  const perFA = q * TU; // кВт на сборку
  say("выдержка " + (t >= 100 ? fmt(t, 0) : fmt(t, 1)) + " лет · ≈ " + fmt(q, q < 1 ? 2 : 1) + " кВт/т · " + N + " ТВС ≈ " + fmt(perFA * N, 1) + " кВт");
  return touring || Math.abs(target - lg) > 0.001 || Math.abs(openT - open) > 0.002;
});
const manual = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 6000); run(); };
stage.addEventListener("pointermove", (e) => { target = clamp((shareX(e) - 0.12) / 0.76, 0, 1) * 3; manual(); });
stage.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") target = Math.min(3, target + 0.25); else if (e.key === "ArrowLeft") target = Math.max(0, target - 0.25); else return; e.preventDefault(); manual(); });
btn.addEventListener("click", () => { openT = openT ? 0 : 1; btn.setAttribute("aria-pressed", String(!!openT)); btn.textContent = openT ? "Крышка снята" : "Крышка закрыта"; manual(); });
if (still.matches) touring = false;
`;

  return {
    P,
    name: "cask",
    live,
    html: card({
      name: "cask",
      fig: "Рис. 12.1",
      title: "Сухое хранение ОЯТ",
      hint: "Курсор влево-вправо — время выдержки",
      readout: "выдержка 5 лет",
      label: "Контейнер сухого хранения: стрелки влево и вправо меняют время выдержки",
      keys: [
        { mark: "red", label: "Остаточное тепловыделение сборок" },
        { mark: "raised", label: "Корпус контейнера, крышка, траверса" },
      ],
      caption:
        "После выгрузки из реактора отработавшее топливо несколько лет охлаждают в бассейне выдержки, а затем перегружают в контейнеры сухого хранения, которые охлаждаются естественной конвекцией воздуха. Тепловыделение быстро падает: с ≈ 10 кВт на тонну через год до долей киловатта через сто лет. Числа — оценка порядка величины для выгорания около 50 МВт·сут/кг; реальная кривая зависит от топлива и режима облучения.",
      svg,
      controls,
    }),
  };
}
