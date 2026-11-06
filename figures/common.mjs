// Shared helpers for every figure: short aliases over the Anatomy kit and the
// bench (base plate on feet with a groove, corner screws, a label plate and a ruler strip)
// that each instrument stands on.
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";

export { k, G };

export const tools = (P) => {
  const at = (point) => k.iso(point, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (points, style) => k.dotsSvg(points, style);
  const depth = (x, y, z = 0) => k.depthOf([x, y, z], P);
  const byDepth = (items, key = (item) => item) =>
    [...items].sort((a, b) => {
      const [ax, ay, az = 0] = key(a);
      const [bx, by, bz = 0] = key(b);
      return depth(ax, ay, az) - depth(bx, by, bz);
    });
  return { at, S, L, D, depth, byDepth };
};

// The heavy base every figure stands on. Returns markup for halo, feet, slab, groove,
// corner screws, an optional ruler strip along the front edge and an optional label plate.
export function bench(P, plate, { height = 12, foot = 5, ruler = true, label = true, groove = 5 } = {}) {
  const { at, S, L, D, byDepth } = tools(P);
  const out = [`<path class="iso-halo" d="${k.haloOf(plate, -height - foot, height, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(plate, 22))) {
    out.push(S(k.cylinder(x, y, 7, -height - foot, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -height - foot + 1.6, foot - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(plate, -height, height, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(plate, -height + 3, P, 8), { tone: "faint" }) }));
  if (groove) out.push(L(k.planOutline(k.insetPlan(plate, groove), 0, P), { tone: "lo" }));
  const screws = k.corners(plate, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  if (ruler) {
    const strip = { x: plate.x + 18, y: plate.y + plate.d - 15, w: plate.w - 36 - (label ? 44 : 0), d: 7, r: 1 };
    out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
    const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
    out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
    out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  }
  if (label) {
    const tag = { x: plate.x + plate.w - 56, y: plate.y + plate.d - 17, w: 38, d: 11, r: 1 };
    out.push(S(k.slabOf(tag, 0, 0.6, P, 3, 0.3), { tone: "lo", crease: "none" }));
    for (let i = 0; i < 3; i++) {
      const y = tag.y + 3 + i * 2.6;
      out.push(L(k.lineOnTop([tag.x + 4, y], [tag.x + tag.w - 8 - i * 6, y], 0.6, P), { tone: "faint", free: true }));
    }
    out.push(D([at([tag.x + 1.8, tag.y + 1.8, 0.6]), at([tag.x + tag.w - 1.8, tag.y + tag.d - 1.8, 0.6])], { size: 0.4 }));
  }
  return out.join("");
}

// A knurled knob standing on a face.
export function knob(P, x, y, z, r = 5, h = 4) {
  const { at, S, L, D } = tools(P);
  return [
    S(k.cylinder(x, y, r, z, h, P, 32), { tone: "mid" }),
    L(k.knurl(x, y, r, z, z + h, 30, P), { tone: "lo" }),
    L(k.lineOnTop([x, y], [x + r, y], z + h, P), { tone: "hi" }),
    D([at([x, y, z + h])], { size: 0.5, tone: "hi" }),
  ].join("");
}

// A round dial face lying on top of a cylinder body: bezel, ticks and an engraved unit.
export function dialFace(P, x, y, z, r, { count = 50, every = 5, text = "", span = Math.PI * 1.5, from = -Math.PI * 0.75 } = {}) {
  const { L } = tools(P);
  const ticks = k.radialTicks(x, y, r - 1.6, count, every, z, [1.2, 2.6], P, from, span);
  const out = [L(k.ring(x, y, r - 0.8, z, P, 64), { tone: "lo" }), L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }), L(k.ring(x, y, 1.4, z, P, 16), { tone: "mid" })];
  if (text) out.push(k.faceTextSvg(k.topMatrix([x, y + r * 0.42], z, P, "x"), text, { size: 2.3, tone: "lo", anchor: "middle" }));
  return out.join("");
}

// Needle on a horizontal dial, as a path string. `share` 0..1 along the dial's arc.
export const needlePath = (P, x, y, z, r, share, { span = Math.PI * 1.5, from = -Math.PI * 0.75 } = {}) => {
  const a = from + span * share;
  return k.lineOnTop([x - Math.sin(a) * 2.6, y + Math.cos(a) * 2.6], [x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3)], z + 0.2, P);
};

// Wraps a figure into the kit's card, with a stage that live code attaches to.
export function card({ name, fig, title, hint, readout, keys, caption, label, svg, controls = "" }) {
  return k.plateHtml({
    fig,
    title,
    hint,
    readout,
    keys,
    caption,
    body: `<div class="iso-stage" tabindex="0" role="group" aria-label="${label.replace(/"/g, "&quot;")}">${svg}</div>${controls}`,
  }).replace('<figure class="iso-figure">', `<figure class="iso-figure" data-fig="${name}" id="fig-${name}">`);
}

// Common live-code prelude: visibility, reduced motion, a frame loop that only runs on screen.
export const LIVE_PRELUDE = `
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = root.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const say = (text) => { if (readout.textContent !== text) readout.textContent = text; };
let visible = false, frame = 0, last = 0;
const loop = (tick) => {
  const step = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const more = tick(dt, still.matches);
    frame = visible && more !== false ? requestAnimationFrame(step) : 0;
  };
  const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(step); } };
  new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
  return run;
};
const shareX = (event) => { const box = svg.getBoundingClientRect(); return clamp((event.clientX - box.left) / box.width, 0, 1); };
const shareY = (event) => { const box = svg.getBoundingClientRect(); return clamp((event.clientY - box.top) / box.height, 0, 1); };
const fmt = (v, d = 2) => v.toFixed(d).replace(".", ",");
`;
