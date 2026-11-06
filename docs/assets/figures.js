(function () {
"use strict";
const AZIMUTH = 45;
const ELEVATION = 30;
const SHADES = 4;
const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
function cameraOf({ scale, azimuth = AZIMUTH, elevation = ELEVATION }) {
    const a = azimuth * RADIANS;
    const e = elevation * RADIANS;
    return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale * UNIT };
}
function iso([x, y, z], projection) {
    const { origin } = projection;
    const { sinA, cosA, sinE, cosE, k } = cameraOf(projection);
    return [origin[0] + (x * sinA - y * cosA) * k, origin[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}
function towardViewer(projection) {
    const { sinA, cosA } = cameraOf(projection);
    return [cosA, sinA];
}
function depthOf([x, y, z], projection) {
    const { sinA, cosA, sinE, cosE } = cameraOf(projection);
    return (x * cosA + y * sinA) * cosE + z * sinE;
}
const tenth = (value) => {
    const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return text === "-0" ? "0" : text;
};
function pathOf(points, closed = false) {
    if (!points.length)
        return "";
    return points.map(([x, y], at) => `${at ? "L" : "M"}${tenth(x)} ${tenth(y)}`).join("") + (closed ? "Z" : "");
}
const joinPaths = (paths) => paths.filter(Boolean).join("");
function roundedPlan({ x, y, w, d, r }, steps = 8) {
    const radius = Math.max(0, Math.min(r, w / 2, d / 2));
    const corners = [
        [x + w - radius, y + radius, -90],
        [x + w - radius, y + d - radius, 0],
        [x + radius, y + d - radius, 90],
        [x + radius, y + radius, 180],
    ];
    const out = [];
    for (const [cx, cy, start] of corners) {
        const count = radius > 0 ? steps : 0;
        for (let step = 0; step <= count; step++) {
            const angle = (start + (count ? (90 * step) / count : 45)) * RADIANS;
            out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
        }
    }
    return out;
}
function signedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const [ax, ay] = points[index];
        const [bx, by] = points[(index + 1) % points.length];
        area += ax * by - bx * ay;
    }
    return area / 2;
}
const oriented = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3)
        return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
            lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index--) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
            upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function runsOf(flags, want) {
    const count = flags.length;
    const runs = [];
    const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
    if (start < 0)
        return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
    let run = null;
    for (let step = 0; step < count; step++) {
        const index = (start + step) % count;
        if (flags[index] === want) {
            if (!run)
                run = [index];
            run.push((index + 1) % count);
        }
        else if (run) {
            runs.push(run);
            run = null;
        }
    }
    if (run)
        runs.push(run);
    return runs;
}
function extrude(ring, z, height, projection, options = {}) {
    const convex = options.convex ?? true;
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const { sinA, cosA } = cameraOf(projection);
    const normals = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy) || 1;
        return (counter ? [dy / length, -dx / length] : [-dy / length, dx / length]);
    });
    const facing = normals.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
    const top = ring.map(([x, y]) => iso([x, y, z + height], projection));
    const bottom = ring.map(([x, y]) => iso([x, y, z], projection));
    const outline = [];
    const crease = [];
    for (const run of runsOf(facing, false))
        outline.push(pathOf(run.map((index) => top[index])));
    for (const run of runsOf(facing, true)) {
        crease.push(pathOf(run.map((index) => top[index])));
        if (height > 0)
            outline.push(pathOf(run.map((index) => bottom[index])));
    }
    if (height > 0) {
        for (let index = 0; index < count; index++) {
            if (facing[(index + count - 1) % count] !== facing[index])
                outline.push(pathOf([top[index], bottom[index]]));
        }
    }
    let fill;
    if (convex) {
        fill = pathOf(convexHull([...top, ...bottom]), true);
    }
    else {
        const parts = [pathOf(oriented(top), true), pathOf(oriented(bottom), true)];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const next = (index + 1) % count;
            parts.push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
        fill = parts.join("");
    }
    const buckets = Array.from({ length: SHADES }, () => []);
    if (height > 0) {
        const [lx, ly] = [-sinA, cosA];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const [nx, ny] = normals[index];
            const lit = (nx * lx + ny * ly + 1) / 2;
            const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
            const next = (index + 1) % count;
            buckets[shade].push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
    }
    let bevel;
    if (options.bevel && options.bevel > 0) {
        const by = options.bevel;
        const inset = ring.map(([x, y], index) => {
            const [ax, ay] = normals[(index + count - 1) % count];
            const [bx, by2] = normals[index];
            const mx = ax + bx;
            const my = ay + by2;
            const length = Math.hypot(mx, my) || 1;
            return [x - (mx / length) * by, y - (my / length) * by];
        });
        const insetTop = inset.map(([x, y]) => iso([x, y, z + height], projection));
        bevel = runsOf(facing, true)
            .map((run) => pathOf([top[run[0]], ...run.slice(1, -1).map((index) => insetTop[index]), top[run[run.length - 1]]]))
            .join("");
    }
    return {
        fill,
        outline: outline.join(""),
        crease: crease.join(""),
        top: pathOf(oriented(top), true),
        shades: buckets.map((paths) => paths.join("")),
        bevel,
    };
}
const ringOf = (plan, steps = 8) => roundedPlan(plan, steps);
function slabOf(plan, z, height, projection, steps = 8, bevel = 0) {
    return extrude(ringOf(plan, steps), z, height, projection, { convex: true, bevel });
}
function circleRing(cx, cy, radius, steps = 40) {
    return Array.from({ length: steps }, (_, step) => {
        const angle = (step / steps) * Math.PI * 2;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
}
function cylinder(cx, cy, radius, z, height, projection, steps = 32, bevel = 0) {
    return extrude(circleRing(cx, cy, radius, steps), z, height, projection, { convex: true, bevel });
}
const insetPlan = ({ x, y, w, d, r }, by) => ({ x: x + by, y: y + by, w: w - by * 2, d: d - by * 2, r: Math.max(0, r - by) });
function onTop(points, z, projection, closed = false) {
    return pathOf(points.map(([x, y]) => iso([x, y, z], projection)), closed);
}
const planOutline = (plan, z, projection, steps = 8) => onTop(ringOf(plan, steps), z, projection, true);
const lineOnTop = (from, to, z, projection) => onTop([from, to], z, projection);
const segment = (from, to, projection) => pathOf([iso(from, projection), iso(to, projection)]);
const rise = (at, from, to, projection) => segment([at[0], at[1], from], [at[0], at[1], to], projection);
const ring = (cx, cy, radius, z, projection, steps = 40) => onTop(circleRing(cx, cy, radius, steps), z, projection, true);
const pointsAt = (points, projection) => points.map((point) => iso(point, projection));
function dotGrid(x, y, columns, rows, gap, z, projection) {
    const dots = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++)
            dots.push(iso([x + column * gap, y + row * gap, z], projection));
    }
    return dots;
}
function corners({ x, y, w, d }, inset = 0) {
    return [
        [x + inset, y + inset],
        [x + w - inset, y + inset],
        [x + inset, y + d - inset],
        [x + w - inset, y + d - inset],
    ];
}
function boxCorners({ x, y, w, d }, z0, z1) {
    const out = [];
    for (const px of [x, x + w])
        for (const py of [y, y + d])
            for (const z of [z0, z1])
                out.push([px, py, z]);
    return out;
}
function knurl(cx, cy, radius, z0, z1, count, projection, inset = 0.4) {
    const [vx, vy] = towardViewer(projection);
    const lines = [];
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        if (nx * vx + ny * vy < 0.15)
            continue;
        lines.push(segment([cx + radius * nx, cy + radius * ny, z0 + inset], [cx + radius * nx, cy + radius * ny, z1 - inset], projection));
    }
    return lines.join("");
}
function sideArc(cx, cy, radius, z, projection, steps = 24) {
    const [vx, vy] = towardViewer(projection);
    const facing = Math.atan2(vy, vx);
    const points = [];
    for (let step = 0; step <= steps; step++) {
        const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
        points.push(iso([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z], projection));
    }
    return pathOf(points);
}
function ringSeam(ring, z, projection) {
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const facing = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const [nx, ny] = counter ? [dy, -dx] : [-dy, dx];
        return nx * vx + ny * vy > 1e-9;
    });
    return runsOf(facing, true).map((run) => pathOf(run.map((index) => iso([ring[index][0], ring[index][1], z], projection)))).join("");
}
const sideSeam = (plan, z, projection, steps = 8) => ringSeam(ringOf(plan, steps), z, projection);
function sideRing(center, radius, axis, projection, steps = 20) {
    const [px, py, pz] = center;
    const points = [];
    for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        points.push(iso(axis === "x" ? [px, py + u, pz + v] : [px + u, py, pz + v], projection));
    }
    return pathOf(points, true);
}
function coil(from, to, center, radius, turns, axis, projection, perTurn = 16) {
    const count = Math.max(1, Math.round(turns * perTurn));
    const back = [];
    const front = [];
    let run = [];
    let near = null;
    for (let index = 0; index <= count; index++) {
        const share = index / count;
        const angle = share * turns * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        const along = from + (to - from) * share;
        const point = axis === "x" ? [along, center[0] + u, center[1] + v] : [center[0] + u, along, center[1] + v];
        const normal = axis === "x" ? [0, Math.cos(angle), Math.sin(angle)] : [Math.cos(angle), 0, Math.sin(angle)];
        const facing = depthOf(normal, projection) > 0;
        const flat = iso(point, projection);
        if (near === null)
            near = facing;
        if (facing !== near) {
            run.push(flat);
            (near ? front : back).push(pathOf(run));
            run = [flat];
            near = facing;
            continue;
        }
        run.push(flat);
    }
    if (run.length > 1)
        (near ? front : back).push(pathOf(run));
    return { back: back.join(""), front: front.join("") };
}
function topTicks(from, to, step, every, edge, z, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, edge] : [edge, at];
        const b = axis === "x" ? [at, edge + length] : [edge + length, at];
        (big ? major : minor).push(lineOnTop(a, b, z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function sideTicks(from, to, step, every, face, top, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, face, top] : [face, at, top];
        const b = axis === "x" ? [at, face, top - length] : [face, at, top - length];
        (big ? major : minor).push(segment(a, b, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function radialTicks(cx, cy, radius, count, every, z, lengths, projection, from = 0, span = Math.PI * 2) {
    const minor = [];
    const major = [];
    const closed = Math.abs(span - Math.PI * 2) < 1e-9;
    const steps = closed ? count : count + 1;
    for (let index = 0; index < steps; index++) {
        const angle = from + (index / count) * span;
        const big = index % every === 0;
        const inner = radius - (big ? lengths[1] : lengths[0]);
        const sx = Math.sin(angle);
        const sy = -Math.cos(angle);
        (big ? major : minor).push(lineOnTop([cx + sx * inner, cy + sy * inner], [cx + sx * radius, cy + sy * radius], z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
const haloOf = (plan, z, height, projection) => slabOf(plan, z, height, projection).fill;
function axisVector(projection, [dx, dy, dz]) {
    const origin = iso([0, 0, 0], projection);
    const moved = iso([dx, dy, dz], projection);
    return [moved[0] - origin[0], moved[1] - origin[1]];
}
const fine = (value) => Math.round(value * 100) / 100;
function translateAlong(projection, by) {
    const [x, y] = axisVector(projection, by);
    return `translate(${fine(x)} ${fine(y)})`;
}
const thousandth = (value) => Math.round(value * 1000) / 1000;
function axesAt(at, z, projection) {
    const origin = iso([at[0], at[1], z], projection);
    const along = (point) => {
        const [px, py] = iso(point, projection);
        return [px - origin[0], py - origin[1]];
    };
    return { origin, x: along([at[0] + 1, at[1], z]), y: along([at[0], at[1] + 1, z]), z: along([at[0], at[1], z + 1]) };
}
const matrixOf = (u, v, origin) => `matrix(${thousandth(u[0])} ${thousandth(u[1])} ${thousandth(v[0])} ${thousandth(v[1])} ${thousandth(origin[0])} ${thousandth(origin[1])})`;
function holdStill(element, [dx, dy]) {
    const text = dx || dy ? `translate(${-dx} ${-dy})` : "";
    element.querySelectorAll("[data-hold]").forEach((node) => (text ? node.setAttribute("transform", text) : node.removeAttribute("transform")));
}
function topMatrix(at, z, projection, along = "x") {
    const { origin, x, y } = axesAt(at, z, projection);
    return along === "x" ? matrixOf(x, y, origin) : matrixOf([-y[0], -y[1]], x, origin);
}
function sideMatrix(at, z, projection, face) {
    const { origin, x, y, z: up } = axesAt(at, z, projection);
    const down = [-up[0], -up[1]];
    return face === "left" ? matrixOf(x, down, origin) : matrixOf([-y[0], -y[1]], down, origin);
}
function screenRise(height, projection) {
    const { cosE, k } = cameraOf(projection);
    return height * cosE * k;
}
function fitProjection(points, width, height, { pad = 24, headroom = 0, azimuth = AZIMUTH, elevation = ELEVATION } = {}) {
    const unit = { origin: [0, 0], scale: 1, azimuth, elevation };
    const flat = points.map((point) => iso(point, unit));
    const xs = flat.map(([x]) => x);
    const ys = flat.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const up = Math.min(...ys);
    const down = Math.max(...ys);
    const scale = Math.min((width - pad * 2) / (right - left), (height - pad * 2 - headroom) / (down - up));
    return {
        origin: [width / 2 - ((left + right) / 2) * scale, headroom + (height - headroom) / 2 - ((up + down) / 2) * scale],
        scale,
        azimuth,
        elevation,
    };
}
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (pairs) => Object.entries(pairs)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escape(String(value))}"`)
    .join("");
function solidSvg(paths, { tone = "hi", crease = "faint", halo = false, lit = false, flat = false, className, inner = "" } = {}) {
    const parts = [];
    if (halo)
        parts.push(`<path class="iso-halo" d="${paths.fill}"/>`);
    parts.push(`<path class="iso-fill" d="${paths.fill}"/>`);
    if (!flat) {
        paths.shades.forEach((d, shade) => {
            if (d)
                parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
        });
        parts.push(`<path class="iso-top" d="${paths.top}"/>`);
    }
    if (crease !== "none" && paths.crease)
        parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
    if (crease !== "none" && paths.bevel)
        parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
    if (inner)
        parts.push(inner);
    parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
    return `<g${attrs({ class: className ? `iso-solid ${className}` : "iso-solid", "data-lit": lit ? "" : undefined, "data-seamless": paths.seamless ? "" : undefined })}>${parts.join("")}</g>`;
}
function lineSvg(d, { tone = "lo", dotted = false, dashed = false, flow = false, className, free } = {}) {
    if (!d)
        return "";
    return `<path${attrs({
        class: className ? `iso-line ${className}` : "iso-line",
        "data-tone": tone,
        "data-free": free === true ? "" : free || undefined,
        "data-dotted": dotted ? "" : undefined,
        "data-dashed": dashed ? "" : undefined,
        "data-flow": flow ? "" : undefined,
        d,
    })}/>`;
}
function dotsSvg(points, { size = 0.5, tone = "mid", pulse = false } = {}) {
    const dots = points
        .map(([x, y, alpha], index) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}${pulse ? ` data-pulse="" style="--pulse-at:${(index * 137) % 1600}ms"` : ""}/>`)
        .join("");
    return `<g class="iso-dots" data-tone="${tone}">${dots}</g>`;
}
function fadedSvg(list, style = {}) {
    const groups = new Map();
    for (const entry of list) {
        const [d, alpha] = Array.isArray(entry) ? entry : [entry.d, entry.alpha];
        if (!d || !(alpha > 0.02))
            continue;
        const level = Math.min(1, Math.round(alpha * 20) / 20);
        groups.set(level, (groups.get(level) ?? "") + d);
    }
    return [...groups].map(([alpha, d]) => (alpha >= 1 ? lineSvg(d, style) : `<g opacity="${alpha.toFixed(2)}">${lineSvg(d, style)}</g>`)).join("");
}
function fadeLineSvg(points, { fade = [0, 0], tone = "lo", className, stops = 6 } = {}) {
    if (points.length < 2)
        return "";
    const ease = (t) => t * t * (3 - 2 * t);
    const hashOf = (text) => {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++)
            hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return (hash >>> 0).toString(36);
    };
    const lengths = [0];
    for (let index = 1; index < points.length; index++)
        lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    const at = (length) => {
        let index = 1;
        while (index < points.length - 1 && lengths[index] < length)
            index++;
        const span = lengths[index] - lengths[index - 1] || 1;
        const t = Math.max(0, Math.min(1, (length - lengths[index - 1]) / span));
        return [points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t, points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t];
    };
    const pieceOf = (from, to) => [at(from), ...points.filter((_, index) => lengths[index] > from + 1e-6 && lengths[index] < to - 1e-6), at(to)];
    const total = lengths[lengths.length - 1];
    if (total < 1e-6)
        return "";
    let [start, end] = Array.isArray(fade) ? fade : [fade, fade];
    if (start + end > total) {
        const share = total / (start + end);
        start *= share;
        end *= share;
    }
    const paint = `var(--anatomy-${tone})`;
    const ramp = (piece, rising) => {
        const d = pathOf(piece);
        const [x1, y1] = piece[0];
        const [x2, y2] = piece[piece.length - 1];
        const id = `iso-fade-${hashOf(`${d}|${tone}|${rising}`)}`;
        const marks = Array.from({ length: stops + 1 }, (_, index) => {
            const t = index / stops;
            const alpha = ease(rising ? t : 1 - t);
            return `<stop offset="${t.toFixed(3)}" stop-opacity="${alpha.toFixed(3)}" style="stop-color:${paint}"/>`;
        }).join("");
        const gradient = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tenth(x1)}" y1="${tenth(y1)}" x2="${tenth(x2)}" y2="${tenth(y2)}">${marks}</linearGradient>`;
        return `<defs>${gradient}</defs><path${attrs({ class: className ? `iso-line ${className}` : "iso-line", "data-tone": tone, "data-free": rising ? "start" : "end", d, style: `stroke:url(#${id})` })}/>`;
    };
    const parts = [];
    if (start > 0.05)
        parts.push(ramp(pieceOf(0, start), true));
    if (total - end - start > 0.05)
        parts.push(lineSvg(pathOf(pieceOf(start, total - end)), { tone, className }));
    if (end > 0.05)
        parts.push(ramp(pieceOf(total - end, total), false));
    return `<g class="iso-fade">${parts.join("")}</g>`;
}
function wireSvg(from, to, { via = [], tone = "lo", dotted = false, dashed = false, flow = false, ends = "both", size = 1.2 } = {}) {
    const d = pathOf([from, ...via, to]);
    const end = ([x, y]) => `<circle class="iso-wire-end" cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"/>`;
    return `<g class="iso-wire" data-tone="${tone}">${lineSvg(d, { tone, dotted, dashed, flow })}${ends === "both" || ends === "from" ? end(from) : ""}${ends === "both" || ends === "to" ? end(to) : ""}</g>`;
}
function faceTextSvg(transform, text, { size = 3, tone = "mid", anchor = "start" } = {}) {
    return `<text class="iso-face-text" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="${anchor}">${escape(text)}</text>`;
}
function groupSvg(children, extra = {}) {
    return `<g${attrs(extra)}>${Array.isArray(children) ? children.join("") : children}</g>`;
}
function figureSvg({ width, height, label, body, standalone = false, className }) {
    const style = standalone ? `<style>${ISO_CSS}</style>` : "";
    return `<svg${attrs({
        xmlns: "http://www.w3.org/2000/svg",
        class: `iso-svg${standalone ? " iso" : ""}${className ? ` ${className}` : ""}`,
        "data-theme": standalone || undefined,
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": label,
    })}>${style}${Array.isArray(body) ? body.join("") : body}</svg>`;
}
function swatchSvg(mark) {
    if (mark === "raised" || mark === "flat" || mark === "lit") {
        const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
        const crease = mark === "flat" ? "" : `<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>`;
        return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${body}"/>${crease}</svg>`;
    }
    return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
}
function plateHtml({ fig, title, hint, readout = "", keys = [], caption, body }) {
    const corner = (name, text, extra = "") => `<span class="iso-plate-corner" data-corner="${name}"${extra}>${escape(text)}</span>`;
    const legend = keys.length || caption
        ? `<figcaption class="iso-legend">${keys.length ? `<span class="iso-keys">${keys.map((key) => `<span class="iso-key">${swatchSvg(key.mark)}${escape(key.label)}</span>`).join("")}</span>` : ""}${caption ? `<span class="iso-caption">${escape(caption)}</span>` : ""}</figcaption>`
        : "";
    return `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">${corner("fig", fig)}${title ? corner("title", title) : ""}${hint ? corner("hint", hint) : ""}${corner("readout", readout, " data-readout")}</div>${body}</div>${legend}</figure>`;
}
function pageHtml({ title, theme = "dark", body, script = "", width = 650 }) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${ISO_CSS}${PAGE_CSS.replace("__WIDTH__", String(width))}</style></head><body class="iso" data-theme="${theme}"><main class="iso-page">${body}</main>${script ? `<script type="module">${script.replace(/<\/(script)/gi, "<\\/$1")}</script>` : ""}</body></html>`;
}
const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.iso-page{width:min(__WIDTH__px,100% - 32px);margin:64px auto 96px}
`;
const ISO_CSS = `
.iso{
  --anatomy-page:#0b0b0b;--anatomy-card:#131313;--anatomy-text:#a3a3a3;--anatomy-strong:#e6e6e6;--anatomy-muted:#6e6e6e;
  --anatomy-paper:#131313;--anatomy-face:#1b1b1b;--anatomy-top:#1c1c1c;
  --anatomy-shade-0:#0f0f0f;--anatomy-shade-1:#121212;--anatomy-shade-2:#151515;--anatomy-shade-3:#181818;
  --anatomy-lit-top:#262626;--anatomy-lit-shade:#1d1d1d;
  --anatomy-hi:#d4d4d4;--anatomy-mid:#6a6a6a;--anatomy-lo:#3e3e3e;--anatomy-faint:#2a2a2a;--anatomy-lit:#ffffff;
  --anatomy-halo:#050505;--anatomy-halo-opacity:.9;--anatomy-dot:#e6e6e6;
  --anatomy-red:#ff6b6b;--anatomy-green:#6be0a0;--anatomy-blue:#6b9bff;
  --anatomy-weight:.6px;--anatomy-ease:cubic-bezier(.32,.72,0,1);
  --anatomy-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --anatomy-lift:inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014;
}
.iso[data-theme="light"]{
  --anatomy-page:#f2f2ef;--anatomy-card:#fbfbfa;--anatomy-text:#57575a;--anatomy-strong:#18181a;--anatomy-muted:#8c8c90;
  --anatomy-paper:#fbfbfa;--anatomy-face:#ffffff;--anatomy-top:#ffffff;
  --anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;
  --anatomy-lit-top:#ffffff;--anatomy-lit-shade:#eeeeeb;
  --anatomy-hi:#26262a;--anatomy-mid:#8a8a8f;--anatomy-lo:#b4b4b8;--anatomy-faint:#d4d4d6;--anatomy-lit:#000000;
  --anatomy-halo:#8a8a80;--anatomy-halo-opacity:.32;--anatomy-dot:#3a3a3e;
  --anatomy-red:#e5484d;--anatomy-green:#30a46c;--anatomy-blue:#3e63dd;
  --anatomy-lift:inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a;
}
.iso-svg{display:block;width:100%;height:auto;overflow:visible}
.iso-svg path,.iso-svg circle{vector-effect:non-scaling-stroke}
.iso-fill{fill:var(--anatomy-paper);stroke:none}
.iso-solid[data-lit]>.iso-fill{fill:var(--anatomy-face)}
.iso-shade,.iso-top{stroke:none}
.iso-shade[data-shade="0"]{fill:var(--anatomy-shade-0)}
.iso-shade[data-shade="1"]{fill:var(--anatomy-shade-1)}
.iso-shade[data-shade="2"]{fill:var(--anatomy-shade-2)}
.iso-shade[data-shade="3"]{fill:var(--anatomy-shade-3)}
.iso-top{fill:var(--anatomy-top)}
.iso-solid[data-lit]>.iso-top{fill:var(--anatomy-lit-top)}
.iso-solid[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}
.iso-solid[data-seamless]>.iso-shade,.iso-solid[data-seamless]>.iso-top{stroke-width:.4;stroke-linejoin:round}
.iso-solid[data-seamless]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}
.iso-solid[data-seamless]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}
.iso-solid[data-seamless]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}
.iso-solid[data-seamless]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}
.iso-solid[data-seamless]>.iso-top{stroke:var(--anatomy-top)}
.iso-solid[data-seamless][data-lit]>.iso-top{stroke:var(--anatomy-lit-top)}
.iso-solid[data-seamless][data-lit]>.iso-shade{stroke:var(--anatomy-lit-shade)}
.iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}
.iso-halo{fill:var(--anatomy-halo);stroke:none;filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}
.iso-line{fill:none;stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linecap:round;stroke-linejoin:round}
.iso-line[data-tone="hi"]{stroke:var(--anatomy-hi)}
.iso-line[data-tone="mid"]{stroke:var(--anatomy-mid)}
.iso-line[data-tone="lo"]{stroke:var(--anatomy-lo)}
.iso-line[data-tone="faint"]{stroke:var(--anatomy-faint)}
.iso-line[data-tone="lit"]{stroke:var(--anatomy-lit)}
.iso-line[data-tone="red"]{stroke:var(--anatomy-red)}
.iso-line[data-tone="green"]{stroke:var(--anatomy-green)}
.iso-line[data-tone="blue"]{stroke:var(--anatomy-blue)}
.iso-line[data-dotted]{stroke-dasharray:.01 3.5;stroke-width:1}
.iso-line[data-dashed]{stroke-dasharray:3 3}
.iso-line[data-flow]{stroke-dasharray:2 6}
.iso-wire-end{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}
.iso-wire[data-tone="hi"] .iso-wire-end{stroke:var(--anatomy-hi)}
.iso-wire[data-tone="mid"] .iso-wire-end{stroke:var(--anatomy-mid)}
.iso-wire[data-tone="faint"] .iso-wire-end{stroke:var(--anatomy-faint)}
.iso-wire[data-tone="lit"] .iso-wire-end{stroke:var(--anatomy-lit)}
.iso-dots circle{fill:var(--anatomy-dot);stroke:none;opacity:.32}
.iso-dots[data-tone="hi"] circle{opacity:.85}
.iso-dots[data-tone="mid"] circle{opacity:.45}
.iso-dots[data-tone="lo"] circle{opacity:.22}
.iso-dots[data-tone="faint"] circle{opacity:.12}
.iso-face-text{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.04em}
.iso-face-text[data-tone="hi"]{fill:var(--anatomy-hi)}
.iso-face-text[data-tone="lo"]{fill:var(--anatomy-lo)}
.iso-face-text[data-tone="faint"]{fill:var(--anatomy-faint)}
.tb-body{fill:var(--anatomy-shade-2);stroke:none}
.tb-shine{fill:var(--anatomy-top);stroke:none}
.tb-shade{fill:var(--anatomy-shade-0);stroke:none}
.tb-ring{fill:none;stroke:var(--anatomy-lo);stroke-width:.45;stroke-linecap:butt;stroke-linejoin:round}
.tb-ring[data-tone="mid"]{stroke:var(--anatomy-mid)}
.tb-ring[data-tone="faint"]{stroke:var(--anatomy-faint)}
.tb-ring[data-tone="hi"]{stroke:var(--anatomy-hi)}
@keyframes iso-flow{to{stroke-dashoffset:-32}}
@keyframes iso-pulse{0%,100%{opacity:.18}12%{opacity:1}40%{opacity:.18}}
.iso-line[data-flow]{animation:iso-flow 1600ms linear infinite}
.iso-dots circle[data-pulse]{animation:iso-pulse 1600ms steps(1,end) infinite;animation-delay:var(--pulse-at,0ms)}
.iso-figure{margin:32px 0 36px}
.iso-plate{position:relative;padding:52px 24px;border-radius:0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);--anatomy-paper:var(--anatomy-card)}
.iso-plate-corners{position:absolute;inset:18px 20px;pointer-events:none}
.iso-plate-corner{position:absolute;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1;letter-spacing:.04em;white-space:nowrap}
.iso-plate-corner[data-corner="fig"]{top:0;left:0;color:var(--anatomy-text)}
.iso-plate-corner[data-corner="title"]{top:0;right:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="hint"]{bottom:0;left:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="readout"]{right:0;bottom:0;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.iso-plate .iso-svg{margin:0 auto}
.iso-legend{display:grid;gap:8px;margin-top:12px;color:var(--anatomy-muted);font-size:13px;line-height:1.55}
.iso-keys{display:flex;flex-wrap:wrap;gap:6px 18px}
.iso-key{display:inline-flex;align-items:center;gap:7px}
.iso-swatch{width:16px;height:10px;flex:none;overflow:visible}
.iso-swatch path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.iso-swatch[data-mark="raised"] path,.iso-swatch[data-mark="flat"] path{stroke:var(--anatomy-mid)}
.iso-swatch[data-mark="lit"] path{stroke:var(--anatomy-lit)}
.iso-swatch[data-mark="dim"] path{stroke:var(--anatomy-lo)}
.iso-swatch[data-mark="dotted"] path{stroke-dasharray:.01 3;stroke-width:1.4}
.iso-swatch[data-mark="dashed"] path{stroke-dasharray:3 2.5}
.iso-swatch[data-mark="red"] path{stroke:var(--anatomy-red)}
.iso-swatch[data-mark="green"] path{stroke:var(--anatomy-green)}
.iso-swatch[data-mark="blue"] path{stroke:var(--anatomy-blue)}
.iso-swatch-crease{stroke:var(--anatomy-lo)!important}
@media (max-width:560px){.iso-plate{padding:48px 12px 70px}.iso-plate-corner[data-corner="hint"]{bottom:18px}}
@media (prefers-reduced-motion:reduce){.iso-line[data-flow],.iso-dots circle[data-pulse]{animation:none}}
`;

const FIGURES = {
  "binding": function (root) {

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

const P = {"origin":[327.7041323651781,244.85712856904928],"scale":1.2881912650448883,"azimuth":38,"elevation":30};
const N = [["²H",2,1.112],["⁴He",4,7.074],["⁶Li",6,5.332],["¹²C",12,7.68],["¹⁶O",16,7.976],["²⁰Ne",20,8.032],["²⁸Si",28,8.448],["⁴⁰Ca",40,8.551],["⁵⁶Fe",56,8.79],["⁶²Ni",62,8.795],["⁸⁴Kr",84,8.717],["¹²⁰Sn",120,8.505],["¹³⁸Ba",138,8.393],["²⁰⁸Pb",208,7.868],["²³⁵U",235,7.591],["²³⁸U",238,7.57]];
const STEP = 15, X0 = -112.5, PER = 8.2;
const cols = [...svg.querySelectorAll("[data-col]")];
const host = svg.querySelector("[data-cols]");
const arm = svg.querySelector("[data-probe-arm]");
const base = svg.querySelector("[data-probe-base]");
let x = 7.5, target = x, z = { at: 72.07799999999999, rate: 0 }, touring = true, clock = 0, idle = 0, lit = -1;
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

  },
  "decay": function (root) {

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

const P = {"origin":[277.30448212159837,160.69890425607286],"scale":1.7259488988879697,"azimuth":40,"elevation":30};
const LIFE = [0.4841,5.7008,2.1449,2.8181,5.4634,1.4752,5.7416,0.7741,3.9596,0.2552,1.5504,1.8213,0.2404,0.9445,0.0586,1.1277,1.4182,3.4914,5.0557,0.0214,0.1272,1.6069,0.421,2.7451,1.228,2.5687,0.1518,0.717,1.6997,0.883,1.4182,2.3632,1.286,5.3144,1.3421,0.1623,0.0431,11.4811,3.9276,2.9847,0.1658,0.2704,1.0019,2.4675,0.8925,1.9284,0.7957,1.2804,0.0278,3.6362,2.822,0.8291,1.5534,0.5422,2.4666,1.6276,0.5562,2.7031,1.8822,0.0331,0.7563,0.0881,1.4941,0.4103,1.2526,1.8375,0.6548,2.0865,0.3662,0.0661,2.8668,0.0684,0.3517,0.048,2.096,0.0152,2.2423,1.6829,2.4509,2.0985,1.2454,0.2205,1.0912,0.6511,0.3042,3.8824,0.9851,0.8062,2.7472,5.3684,0.0314,2.6319,5.7935,5.4294,0.1493,2.4488,2.1054,0.5184,2.6923,0.1307];
const ISOS = [{"id":"I131","name":"¹³¹I","half":8.02,"unit":"сут","daughter":"¹³¹Xe","mode":"β⁻"},{"id":"Cs137","name":"¹³⁷Cs","half":30.08,"unit":"лет","daughter":"¹³⁷ᵐBa","mode":"β⁻"},{"id":"Co60","name":"⁶⁰Co","half":5.27,"unit":"лет","daughter":"⁶⁰Ni","mode":"β⁻, γ"},{"id":"Rn222","name":"²²²Rn","half":3.82,"unit":"сут","daughter":"²¹⁸Po","mode":"α"},{"id":"C14","name":"¹⁴C","half":5730,"unit":"лет","daughter":"¹⁴N","mode":"β⁻"}];
const MAX_T = 5, DX = 101, DY = 10, DZ = 15, DR = 23;
const needle = svg.querySelector("[data-needle]");
const atoms = [];
svg.querySelectorAll("[data-atom]").forEach((g) => { atoms[+g.dataset.atom] = { p: g.querySelector("[data-parent]"), c: g.querySelector("[data-child]"), gone: false }; });
let iso = ISOS[0], t = 0, rate = 0.42, scrub = null, hold = 0;
const needleAt = (P, x, y, z, r, share, { span = Math.PI * 1.5, from = -Math.PI * 0.75 } = {}) => {
  const a = from + span * share;
  return lineOnTop([x - Math.sin(a) * 2.6, y + Math.cos(a) * 2.6], [x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3)], z + 0.2, P);
};
function draw() {
  let left = 0;
  for (let i = 0; i < atoms.length; i++) {
    const gone = t >= LIFE[i];
    if (gone !== atoms[i].gone) { atoms[i].gone = gone; atoms[i].p.style.display = gone ? "none" : ""; atoms[i].c.style.display = gone ? "" : "none"; }
    if (!gone) left++;
  }
  needle.setAttribute("d", needleAt(P, DX, DY, DZ, DR, Math.min(t, MAX_T) / MAX_T, { span: Math.PI * 1.6, from: -Math.PI * 0.8 }));
  const real = t * iso.half;
  const shown = real >= 100 ? fmt(real, 0) : fmt(real, 1);
  say(iso.name + " → " + iso.daughter + " (" + iso.mode + ") · t = " + fmt(t, 1) + " T½ = " + shown + " " + iso.unit + " · N = " + left + " (теория " + fmt(100 * Math.pow(2, -t), 0) + ")");
}
const run = loop((dt, calm) => {
  if (scrub !== null) { t = t + (scrub - t) * (1 - Math.exp(-dt / 0.12)); if (Math.abs(scrub - t) < 0.002) t = scrub; }
  else if (hold > 0) { hold -= dt; }
  else { t += rate * dt; if (t > MAX_T + 0.6) { t = 0; hold = 1.2; } }
  if (calm && scrub === null) t = 1;
  draw();
  return !calm || scrub !== null;
});
stage.addEventListener("pointermove", (e) => { scrub = clamp((shareX(e) - 0.1) / 0.8, 0, 1) * MAX_T; run(); });
stage.addEventListener("pointerleave", () => { scrub = null; run(); });
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") scrub = clamp((scrub ?? t) + 0.5, 0, MAX_T);
  else if (e.key === "ArrowLeft") scrub = clamp((scrub ?? t) - 0.5, 0, MAX_T);
  else if (e.key === "Escape") scrub = null;
  else return;
  e.preventDefault(); run();
});
root.querySelectorAll("[data-iso]").forEach((b) => b.addEventListener("click", () => {
  iso = ISOS[+b.dataset.iso];
  root.querySelectorAll("[data-iso]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
  draw();
}));
root.querySelector("[data-reset]").addEventListener("click", () => { t = 0; hold = 0.6; scrub = null; run(); });
draw();

  },
  "shielding": function (root) {

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

const P = {"origin":[217.20070204060966,92.83789359109116],"scale":0.926208392100941,"azimuth":32,"elevation":32};
const RAD = [{"id":"a","name":"α","src":"²⁴¹Am, 5,5 МэВ","T":[0,0,0,0]},{"id":"b","name":"β","src":"⁹⁰Sr/⁹⁰Y, до 2,28 МэВ","T":[0.97,0,0,0]},{"id":"g","name":"γ","src":"¹³⁷Cs, 662 кэВ","T":[1,0.9037409675240433,0.07691148990827339,0.45659431303056536]},{"id":"n","name":"n","src":"Pu–Be, ≈ 4 МэВ","T":[1,0.9607894391523232,0.7897806739328028,0.2922925776808594]}];
const ST = ["бумага 0,1 мм","Al 5 мм","Pb 2 см","ПЭ 10 см"];
const SLIDE = -40;
const DIAL = [401,51];
const plates = [...svg.querySelectorAll("[data-plate]")];
const segs = [...svg.querySelectorAll("[data-seg]")];
const needle = svg.querySelector("[data-needle]");
const blip = svg.querySelector("[data-blip]");
const needleAt = (P, x, y, z, r, share, { span = Math.PI * 1.5, from = -Math.PI * 0.75 } = {}) => {
  const a = from + span * share;
  return lineOnTop([x - Math.sin(a) * 2.6, y + Math.cos(a) * 2.6], [x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3)], z + 0.2, P);
};
let rad = 2, inside = [false, false, true, false], pos = inside.map((v) => (v ? 0 : 1)), shown = 0, flash = 0, touring = true, clock = 0, idle = 0;
const tour = [[2, [0, 0, 1, 0]], [3, [0, 0, 1, 0]], [3, [0, 0, 0, 1]], [0, [1, 0, 0, 0]], [1, [1, 0, 0, 0]], [1, [0, 1, 0, 0]], [2, [0, 1, 1, 1]]];
let tourAt = -1;
function strength() { let s = 1; const list = [1]; RAD[rad].T.forEach((t, i) => { if (inside[i]) s *= t; list.push(s); }); return list; }
function sync() {
  root.querySelectorAll("[data-rad]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.rad === rad)));
  root.querySelectorAll("[data-abs]").forEach((b) => b.setAttribute("aria-pressed", String(inside[+b.dataset.abs])));
}
const run = loop((dt, calm) => {
  if (touring) { clock += dt; const step = Math.floor(clock / 2.8) % tour.length; if (step !== tourAt) { tourAt = step; rad = tour[step][0]; inside = tour[step][1].map(Boolean); sync(); } }
  let moving = false;
  plates.forEach((g, i) => {
    const want = inside[i] ? 0 : 1;
    pos[i] = calm ? want : pos[i] + (want - pos[i]) * (1 - Math.exp(-dt / 0.22));
    if (Math.abs(want - pos[i]) < 0.002) pos[i] = want; else moving = true;
    g.setAttribute("transform", translateAlong(P, [0, SLIDE * pos[i], 0]));
  });
  const list = strength();
  segs.forEach((g, i) => { const v = list[i]; g.style.opacity = v <= 0 ? 0 : String(0.18 + 0.82 * Math.pow(v, 0.6)); });
  const out = list[list.length - 1];
  const target = out <= 0 ? 0 : clamp(1 + Math.log10(out) / 3, 0.02, 1) * 0.92;
  shown = calm ? target : shown + (target - shown) * (1 - Math.exp(-dt / 0.35));
  needle.setAttribute("d", needleAt(P, DIAL[0], DIAL[1], 19.8, 12, shown, { span: Math.PI, from: -Math.PI / 2 }));
  flash -= dt; if (!calm && Math.random() < dt * 40 * out) flash = 0.06; blip.style.opacity = flash > 0 ? 1 : 0.15;
  const used = inside.map((v, i) => (v ? ST[i] : null)).filter(Boolean);
  say(RAD[rad].name + " (" + RAD[rad].src + ") · " + (used.length ? used.join(" + ") : "без защиты") + " · I/I₀ = " + (out <= 0 ? "0" : out >= 0.995 ? "1" : fmt(out, 3)));
  return true;
});
const manual = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; tourAt = -1; run(); }, 9000); sync(); run(); };
root.querySelectorAll("[data-rad]").forEach((b) => b.addEventListener("click", () => { rad = +b.dataset.rad; manual(); }));
root.querySelectorAll("[data-abs]").forEach((b) => b.addEventListener("click", () => { const i = +b.dataset.abs; inside[i] = !inside[i]; manual(); }));
stage.addEventListener("keydown", (e) => { const n = "1234".indexOf(e.key); if (n >= 0) { inside[n] = !inside[n]; manual(); e.preventDefault(); } const r = "abgn".indexOf(e.key); if (r >= 0) { rad = r; manual(); } });
if (still.matches) touring = false;
sync();

  },
  "chain": function (root) {

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

const P = {"origin":[341.8337160899416,192.7830215622752],"scale":1.4454847784482265,"azimuth":36,"elevation":34};
const NUC = [[-95,-57,0],[-76,-57,1],[-57,-57,2],[-38,-57,3],[-19,-57,4],[0,-57,5],[19,-57,6],[38,-57,7],[57,-57,8],[76,-57,9],[95,-57,10],[-95,-38,11],[-76,-38,12],[-57,-38,13],[-38,-38,14],[-19,-38,15],[0,-38,16],[19,-38,17],[38,-38,18],[57,-38,19],[76,-38,20],[95,-38,21],[-95,-19,22],[-76,-19,23],[-57,-19,24],[-38,-19,25],[-19,-19,26],[0,-19,27],[19,-19,28],[38,-19,29],[57,-19,30],[76,-19,31],[95,-19,32],[-95,0,33],[-76,0,34],[-57,0,35],[-38,0,36],[-19,0,37],[0,0,38],[19,0,39],[38,0,40],[57,0,41],[76,0,42],[95,0,43],[-95,19,44],[-76,19,45],[-57,19,46],[-38,19,47],[-19,19,48],[0,19,49],[19,19,50],[38,19,51],[57,19,52],[76,19,53],[95,19,54],[-95,38,55],[-76,38,56],[-57,38,57],[-38,38,58],[-19,38,59],[0,38,60],[19,38,61],[38,38,62],[57,38,63],[76,38,64],[95,38,65],[-95,57,66],[-76,57,67],[-57,57,68],[-38,57,69],[-19,57,70],[0,57,71],[19,57,72],[38,57,73],[57,57,74],[76,57,75],[95,57,76]];
const BLADES = [-66.5,-28.5,9.5,47.5,85.5];
const BT = 2.4, BD = 128, LEVER = 164, Y0 = -64, Y1 = 64;
const X0 = -112, X1 = 112, Z = 8;
const SRC = [-110, 0];
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

  },
  "core": function (root) {

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

const P = {"origin":[331.9489297187558,314.62212406801984],"scale":1.370163958354725,"azimuth":40,"elevation":30};
const RODS = [-32,-16,0,16,32];
const ZC1 = 74, HC = 60, HZ0 = 138, RR = 2.8, SR = 1.1;
const BETA = 0.0065, LAMBDA = 0.0001, LAM = 0.0767, BANK = 6.5, EXCESS = 0.5;
const DIAL = [46,55];
const rods = [...svg.querySelectorAll("[data-rod]")];
const glow = svg.querySelector("[data-glow]");
const needle = svg.querySelector("[data-needle]");
const needleAt = (P, x, y, z, r, share, { span = Math.PI * 1.5, from = -Math.PI * 0.75 } = {}) => {
  const a = from + span * share;
  return lineOnTop([x - Math.sin(a) * 2.6, y + Math.cos(a) * 2.6], [x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3)], z + 0.2, P);
};
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

  },
  "fuel": function (root) {

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

const P = {"origin":[331.5111507844245,215.92011050659966],"scale":0.958790651698504,"azimuth":34,"elevation":32};
const END = 290, MAX_OUT = 110, PEL_L = 10;
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

  },
  "loop": function (root) {

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

const P = {"origin":[300.83051571956355,272.32570624337154],"scale":1.1011989874718748,"azimuth":36,"elevation":30};
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

  },
};
document.querySelectorAll("[data-fig]").forEach((root) => { try { FIGURES[root.dataset.fig]?.(root); } catch (e) { console.error(root.dataset.fig, e); } });
})();
