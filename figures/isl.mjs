// Fig 14.1 — In-situ leaching (ISL), the method behind almost all of Kazakhstan's uranium: a block of
// ground cut away at its front corner. An ore-bearing sand aquifer lies between two clay aquitards;
// six injection wells pump a weak sulfuric-acid solution into it, the solution flows through the
// ore and dissolves uranium, and the central production well lifts the pregnant solution to the plant.
// Layer thicknesses are schematic; real ore horizons in Kazakhstan lie at depths of hundreds of metres.
import { k, tools, bench, card, LIVE_PRELUDE } from "./common.mjs";

const X0 = -110, X1 = 110, Y0 = -80, Y1 = 80;
const CUT = [10, 0]; // the cut quadrant is x > 10, y > 0 (nearest the viewer)
const LAYERS = [
  { id: "clay", z0: 0, z1: 14, name: "водоупор (глина)", tone: "lo" },
  { id: "ore", z0: 14, z1: 34, name: "рудовмещающий горизонт (пески)", tone: "hi" },
  { id: "clay", z0: 34, z1: 46, name: "водоупор (глина)", tone: "lo" },
  { id: "overburden", z0: 46, z1: 74, name: "перекрывающие породы", tone: "mid" },
  { id: "overburden", z0: 74, z1: 82, name: "почва", tone: "mid" },
];
const PROD = [60, 40];
const INJ = Array.from({ length: 6 }, (_, i) => [PROD[0] + 30 * Math.cos((i * Math.PI) / 3 + 0.3), PROD[1] + 30 * Math.sin((i * Math.PI) / 3 + 0.3)]);
const TOP = 82, ORE = 34;

export function build() {
  const W = 660, H = 500;
  const PLATE = { x: X0 - 24, y: Y0 - 24, w: X1 - X0 + 48, d: Y1 - Y0 + 48, r: 10 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [X0, Y0, TOP + 40], [X1, Y1, 0]], W, H, { pad: 20, azimuth: 40, elevation: 32 });
  const { at, S, L, D, byDepth } = tools(P);
  const out = [`<g data-part="base">${bench(P, PLATE)}</g>`];
  const full = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
  const ell = [[X0, Y0], [X1, Y0], [X1, CUT[1]], [CUT[0], CUT[1]], [CUT[0], Y1], [X0, Y1]];

  for (const layer of LAYERS) {
    const ring = layer.z0 < ORE ? full : ell;
    const solid = k.extrude(ring, layer.z0, layer.z1 - layer.z0, P, { convex: ring === full, bevel: 0 });
    out.push(`<g data-part="${layer.id}">${S(solid, { tone: layer.tone, crease: "lo", lit: layer.id === "ore" })}</g>`);
  }
  // Ore surface texture inside the cut (sand grains) and the trace of the leaching cell.
  const grains = [];
  for (let x = CUT[0] + 6; x < X1 - 3; x += 6) for (let y = CUT[1] + 6; y < Y1 - 3; y += 6) grains.push(at([x + ((y * 7) % 3), y, ORE]));
  out.push(`<g data-part="ore">${D(grains, { size: 0.45, tone: "lo" })}${L(k.ring(PROD[0], PROD[1], 34, ORE, P, 48), { tone: "faint", dashed: true })}</g>`);

  // Surface plant on the uncut ground: sorption columns, a tank and a building.
  const plant = { x: -96, y: -66, w: 56, d: 40, r: 2 };
  const pl = [S(k.slabOf(plant, TOP, 22, P, 3, 0.8), { tone: "mid", inner: L(k.sideSeam(plant, TOP + 8, P, 3), { tone: "faint" }) })];
  for (const [x, y] of [[-24, -58], [-12, -58], [-24, -44], [-12, -44]]) pl.push(S(k.cylinder(x, y, 5, TOP, 30, P, 24, 0.4), { tone: "hi", inner: L(k.sideArc(x, y, 5, TOP + 15, P, 12), { tone: "faint" }) }));
  pl.push(S(k.cylinder(-74, 4, 12, TOP, 14, P, 40, 0.6), { tone: "mid" }));
  pl.push(D(k.corners(plant, 3).map(([x, y]) => at([x, y, TOP + 22])), { size: 0.45 }));
  out.push(`<g data-part="plant">${pl.join("")}</g>`);

  // Wells: casings from the ore top up through the open cut to wellheads above ground level.
  const wells = [...INJ.map((p) => ({ p, kind: "inj" })), { p: PROD, kind: "prod" }];
  const pipes = [];
  for (const w of byDepth(wells, (w) => [w.p[0], w.p[1], 0])) {
    const [x, y] = w.p;
    const prod = w.kind === "prod";
    const g = [
      S(k.cylinder(x, y, prod ? 2.2 : 1.6, ORE, TOP + 8 - ORE, P, 16), { tone: prod ? "hi" : "mid", crease: "none", lit: prod }),
      S(k.cylinder(x, y, prod ? 4.4 : 3.4, TOP + 8, 5, P, 20), { tone: prod ? "hi" : "mid", lit: prod }),
      L(k.ring(x, y, prod ? 5 : 4, ORE, P, 20), { tone: "mid" }),
    ];
    out.push(`<g data-part="${prod ? "prod" : "inj"}">${g.join("")}</g>`);
    pipes.push(k.wireSvg(at([x, y, TOP + 13]), at([-40, prod ? -30 : -40, TOP + 10]), { via: [at([x, y, TOP + 18]), at([-30, y, TOP + 18]), at([-30, prod ? -30 : -40, TOP + 18])], tone: prod ? "green" : "blue", ends: "both", size: 1 }));
  }
  out.push(`<g data-part="pipes">${pipes.join("")}</g>`);
  out.push(`<g data-part="flow" data-flowdots class="fig-flowdots"></g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Разрез участка подземного скважинного выщелачивания: рудный горизонт из песков между двумя слоями глины, шесть закачных скважин вокруг одной откачной, трубопроводы к перерабатывающей установке.",
    body: out,
  });

  const controls = `<div class="fig-controls"><button type="button" data-pump aria-pressed="true">Насосы работают</button></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const INJ = ${JSON.stringify(INJ)}, PROD = ${JSON.stringify(PROD)}, Z = ${ORE + 0.4};
const host = svg.querySelector("[data-flowdots]");
const btn = root.querySelector("[data-pump]");
const NS = "http://www.w3.org/2000/svg";
const dots = [];
for (let w = 0; w < INJ.length; w++) for (let j = 0; j < 5; j++) {
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("r", "1.3");
  host.appendChild(c);
  dots.push({ c, w, t: j / 5 });
}
let on = true, rate = 1, clock = 0;
const run = loop((dt, calm) => {
  rate = calm ? (on ? 1 : 0) : rate + ((on ? 1 : 0) - rate) * (1 - Math.exp(-dt / 0.6));
  clock += dt * rate;
  for (const d of dots) {
    d.t = (d.t + dt * 0.22 * rate) % 1;
    const [x0, y0] = INJ[d.w];
    const s = d.t;
    // a slight bow, as streamlines spread between wells
    const bow = Math.sin(s * Math.PI) * 5 * (d.w % 2 ? 1 : -1);
    const dx = PROD[0] - x0, dy = PROD[1] - y0, l = Math.hypot(dx, dy);
    const x = x0 + dx * s - (dy / l) * bow, y = y0 + dy * s + (dx / l) * bow;
    const [sx, sy] = iso([x, y, Z], P);
    d.c.setAttribute("cx", sx.toFixed(1)); d.c.setAttribute("cy", sy.toFixed(1));
    d.c.style.opacity = (rate * (0.35 + 0.65 * Math.sin(s * Math.PI))).toFixed(2);
    d.c.style.fill = s > 0.6 ? "var(--anatomy-green)" : "var(--anatomy-blue)";
  }
  say(on ? "закачка: слабый раствор H₂SO₄ → рудный горизонт → откачка продуктивного раствора · 6 закачных + 1 откачная" : "насосы остановлены");
  return on || rate > 0.01;
});
btn.addEventListener("click", () => { on = !on; btn.setAttribute("aria-pressed", String(on)); btn.textContent = on ? "Насосы работают" : "Насосы остановлены"; run(); });
`;

  return {
    P,
    name: "isl",
    live,
    html: card({
      name: "isl",
      fig: "Рис. 14.1",
      title: "Скважинное выщелачивание",
      hint: "Кнопка — насосы",
      readout: "закачка → откачка",
      label: "Разрез участка подземного скважинного выщелачивания урана",
      keys: [
        { mark: "blue", label: "Выщелачивающий раствор (закачка)" },
        { mark: "green", label: "Продуктивный раствор с ураном (откачка)" },
        { mark: "raised", label: "Рудный горизонт между глинистыми водоупорами" },
      ],
      caption:
        "Подземное скважинное выщелачивание (ПСВ) — основной способ добычи урана в Казахстане. Раствор закачивают в проницаемый рудный горизонт, зажатый между водоупорными глинами; он растворяет уран прямо в недрах, а откачные скважины поднимают продуктивный раствор на поверхность, где уран извлекают сорбцией. Ни карьера, ни шахты, ни отвалов. Толщины слоёв на модели схематичные.",
      svg,
      controls,
    }),
  };
}
