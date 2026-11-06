// Fig 13.1 — A tokamak of the ITER layout as a bench model: 18 D-shaped toroidal-field coils, the
// central solenoid, poloidal-field rings, the vacuum vessel ports and the plasma ring inside.
// The plasma glow follows a design discharge of ITER: current ramp, 400 s of burn at 500 MW
// fusion power with 50 MW of heating (Q = 10), ramp-down. These are ITER design goals.
import { k, G, tools, bench, card, LIVE_PRELUDE } from "./common.mjs";

const N_TF = 18;
const ZC = 78; // plasma mid-plane height
const R0 = 62; // major radius (model units)
const D_SHAPE = [[28, -50], [28, 50], [40, 64], [60, 70], [80, 62], [94, 42], [100, 0], [94, -42], [80, -62], [60, -70], [40, -64]];

export function build() {
  const W = 640, H = 520;
  const PLATE = { x: -128, y: -128, w: 256, d: 256, r: 12 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [0, 0, ZC + 92], [-104, 0, ZC], [104, 0, ZC]], W, H, { pad: 22, azimuth: 40, elevation: 26 });
  const { at, S, L, D, depth } = tools(P);
  const UP = [0, 0, 1];
  const [vx, vy] = k.towardViewer(P);
  const out = [`<g data-part="base">${bench(P, PLATE)}${S(k.cylinder(0, 0, 108, 0, 6, P, 120, 1), { tone: "lo" })}${L(k.ring(0, 0, 100, 6, P, 120), { tone: "faint" })}</g>`];

  // Support ring and the central solenoid stack (6 modules).
  const cs = [];
  cs.push(S(k.cylinder(0, 0, 30, 6, 10, P, 64, 0.6), { tone: "mid" }));
  for (let i = 0; i < 6; i++) cs.push(S(k.cylinder(0, 0, 22, 16 + i * 21, 20, P, 56, 0.5), { tone: "hi", crease: "lo" }));
  cs.push(S(k.cylinder(0, 0, 24, 142, 6, P, 56, 0.5), { tone: "mid" }));

  // TF coils, split into the half behind the solenoid's axis and the half in front.
  const coils = [];
  for (let i = 0; i < N_TF; i++) {
    const a = (i / N_TF) * Math.PI * 2 + Math.PI / N_TF;
    const u = [Math.cos(a), Math.sin(a), 0];
    const t = [-Math.sin(a), Math.cos(a), 0];
    const F = G.frameOf([0, 0, ZC], t, u, UP);
    const facing = u[0] * vx + u[1] * vy;
    // A D-shaped ring: one convex prism per edge of the D, 7 units deep toward its centre.
    const cx = 64, cy = 0, segs = [];
    for (let j = 0; j < D_SHAPE.length; j++) {
      const a0 = D_SHAPE[j], a1 = D_SHAPE[(j + 1) % D_SHAPE.length];
      const inset = (p) => { const dx = cx - p[0], dy = cy - p[1], l = Math.hypot(dx, dy); return [p[0] + (dx / l) * 8, p[1] + (dy / l) * 8]; };
      const quad = [a0, a1, inset(a1), inset(a0)];
      const mid = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
      const world = [u[0] * mid[0], u[1] * mid[0], ZC + mid[1]];
      segs.push({ d: depth(...world), svg: S(G.prismOf(F, quad, -3.2, 3.2, P), { tone: "mid", crease: "none" }) });
    }
    segs.sort((p, q) => p.d - q.d);
    coils.push({ facing, svg: segs.map((x) => x.svg).join("") });
  }
  coils.sort((a, b) => a.facing - b.facing);
  const back = coils.filter((c) => c.facing < 0).map((c) => c.svg).join("");
  // Cutaway: the coils facing the viewer are left out so the plasma can be seen.
  const front = coils.filter((c) => c.facing >= 0 && c.facing < 0.6).map((c) => c.svg).join("");

  // Plasma: a glowing ring of the minor cross-section, as back and front arcs of thick strokes.
  const arc = (r, z, sign) => {
    const pts = [];
    for (let j = 0; j <= 96; j++) {
      const a = (j / 96) * Math.PI * 2;
      const c = Math.cos(a) * vx + Math.sin(a) * vy;
      if (Math.sign(c || 1) === sign) pts.push(k.iso([Math.cos(a) * r, Math.sin(a) * r, z], P));
      else if (pts.length && pts[pts.length - 1] !== null) pts.push(null);
    }
    const runs = [];
    let cur = [];
    for (const p of pts) { if (p === null) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(p); }
    if (cur.length > 1) runs.push(cur);
    return runs.map((r) => "M" + r.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L")).join("");
  };
  const scale = k.cameraOf(P).k;
  const plasma = (sign) => [
    `<path class="fig-plasma" d="${arc(R0, ZC, sign)}" stroke="url(#fig-plasma-grad)" style="stroke-width:${(40 * scale).toFixed(1)};opacity:.5;filter:blur(${(3 * scale).toFixed(1)}px)"/>`,
    `<path class="fig-plasma" d="${arc(R0, ZC, sign)}" stroke="#ff8fd8" style="stroke-width:${(18 * scale).toFixed(1)};opacity:.85;filter:blur(${(1.5 * scale).toFixed(1)}px)"/>`,
    `<path class="fig-plasma" d="${arc(R0 + 3, ZC, sign)}" stroke="#ffe8f8" style="stroke-width:${(3 * scale).toFixed(1)};opacity:1"/>`,
  ].join("");
  const defs = `<defs><linearGradient id="fig-plasma-grad"><stop offset="0" stop-color="#b56cff"/><stop offset="1" stop-color="#ff6fb7"/></linearGradient></defs>`;

  // Poloidal-field rings above and below, and four ports (equatorial) pointing outward.
  const pf = (z, r) => `<path class="iso-line" data-tone="mid" style="stroke-width:3.2" d="${k.ring(0, 0, r, z, P, 120)}"/><path class="iso-line" data-tone="hi" style="stroke-width:.8" d="${k.ring(0, 0, r, z + 0.6, P, 120)}"/>`;
  const ports = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.35;
    const u = [Math.cos(a), Math.sin(a), 0];
    const Fp = G.frameAlong([u[0] * 98, u[1] * 98, ZC], u);
    ports.push({ facing: u[0] * vx + u[1] * vy, svg: S(G.disc(0, 14, 9, Fp, P), { tone: "mid" }) + S(G.disc(14, 17, 12, Fp, P), { tone: "mid" }) });
  }
  const portsBack = ports.filter((p) => p.facing < 0).map((p) => p.svg).join("");
  const portsFront = ports.filter((p) => p.facing >= 0 && p.facing < 0.6).map((p) => p.svg).join("");

  // Neutral beam injector box on the right, its duct pointing at a front port.
  const nbi = { x: 112, y: -40, w: 18, d: 30, r: 2 };

  out.push(defs);
  out.push(`<g data-part="ports">${portsBack}</g>`);
  out.push(`<g data-part="pf">${pf(ZC + 64, 70)}</g>`);
  out.push(`<g data-part="coils">${back}</g>`);
  out.push(`<g data-part="plasma"><g data-plasma="back" class="fig-glow">${plasma(-1)}</g></g>`);
  out.push(`<g data-part="solenoid">${cs.join("")}</g>`);
  out.push(`<g data-part="plasma"><g data-plasma="front" class="fig-glow">${plasma(1)}</g></g>`);
  out.push(`<g data-part="coils">${front}</g>`);
  out.push(`<g data-part="pf">${pf(ZC - 68, 74)}</g>`);
  out.push(`<g data-part="ports">${portsFront}</g>`);
  out.push(`<g data-part="nbi">${S(k.slabOf(nbi, 6, 60, P, 3, 0.8), { tone: "mid", inner: L([20, 40].map((zz) => k.sideSeam(nbi, zz, P, 3)).join(""), { tone: "faint" }) })}${D(k.corners(nbi, 3).map(([x, y]) => at([x, y, 66])), { size: 0.45 })}</g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Модель токамака по схеме ИТЭР в разрезе (передние катушки сняты): восемнадцать D-образных катушек тороидального поля, центральный соленоид, катушки полоидального поля, патрубки вакуумной камеры и кольцо плазмы внутри.",
    body: out,
  });

  const live = `
${LIVE_PRELUDE}
const back = svg.querySelector('[data-plasma="back"]'), front = svg.querySelector('[data-plasma="front"]');
// Design discharge (ITER goals): 0–100 s current ramp, heating, 400 s burn, ramp-down.
const PHASES = [[0, "ввод тока"], [100, "нагрев плазмы"], [150, "горение, Q = 10"], [550, "гашение"], [650, "пауза"]];
let t = 0, scrub = null, speed = 60;
const phaseAt = (s) => { let p = PHASES[0][1]; for (const [t0, name] of PHASES) if (s >= t0) p = name; return p; };
const run = loop((dt, calm) => {
  if (scrub !== null) t = t + (scrub - t) * (1 - Math.exp(-dt / 0.15));
  else { t += dt * speed; if (t > 760) t = 0; }
  if (calm && scrub === null) t = 300;
  const ip = t < 100 ? 15 * t / 100 : t < 550 ? 15 : t < 650 ? 15 * (650 - t) / 100 : 0;
  const pf = t < 100 ? 0 : t < 150 ? 500 * (t - 100) / 50 : t < 550 ? 500 : t < 600 ? 500 * (600 - t) / 50 : 0;
  const glow = Math.min(1, ip / 15 * 0.55 + pf / 500 * 0.45);
  const flicker = calm ? 1 : 0.93 + 0.07 * Math.sin(performance.now() / 90);
  back.style.opacity = front.style.opacity = (glow * flicker).toFixed(3);
  say("t = " + fmt(t, 0) + " с · " + phaseAt(t) + " · Ip = " + fmt(ip, 1) + " МА · Pсинт ≈ " + fmt(pf, 0) + " МВт");
  return true;
});
stage.addEventListener("pointermove", (e) => { scrub = clamp((shareX(e) - 0.1) / 0.8, 0, 1) * 700; });
stage.addEventListener("pointerleave", () => { scrub = null; });
stage.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") scrub = Math.min(700, (scrub ?? t) + 50); else if (e.key === "ArrowLeft") scrub = Math.max(0, (scrub ?? t) - 50); else if (e.key === "Escape") scrub = null; else return; e.preventDefault(); });
`;

  return {
    P,
    name: "tokamak",
    live,
    html: card({
      name: "tokamak",
      fig: "Рис. 13.1",
      title: "Токамак ИТЭР",
      hint: "Курсор влево-вправо — время разряда",
      readout: "t = 0 с · ввод тока",
      label: "Модель токамака: стрелки влево и вправо перематывают проектный разряд",
      keys: [
        { mark: "red", label: "Плазма D–T, ≈ 150 млн °C" },
        { mark: "raised", label: "Катушки тороидального и полоидального поля, соленоид" },
      ],
      caption:
        "Модель показана в разрезе: передний сектор катушек снят. В токамаке горячую плазму удерживает магнитное поле: 18 катушек создают тороидальное поле, а ток в плазме, наведённый центральным соленоидом, — полоидальное. Проектные цели ИТЭР: ток плазмы 15 МА, термоядерная мощность 500 МВт при 50 МВт нагрева (Q = 10) в импульсах около 400 с. Модель показывает проектный сценарий; ИТЭР ещё строится, график работ сдвигается, о нём подробнее — в тексте главы.",
      svg,
    }),
  };
}
