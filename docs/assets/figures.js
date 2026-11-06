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
  "worldmap": function (root) {

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

const SITES = [["Ågesta","SE",[["Ågesta","sd","PHWR",9]]],["Akademik Lomonosov","RU",[["Akademik Lomonosov-1","op","PWR",30],["Akademik Lomonosov-2","op","PWR",30]]],["Akkuyu","TR",[["Akkuyu-1","uc","PWR",1114],["Akkuyu-2","uc","PWR",1114],["Akkuyu-3","uc","PWR",1114],["Akkuyu-4","uc","PWR",1114]]],["Aktau","KZ",[["Aktau (Shevchenko)","sd","FBR",52]]],["Almaraz","ES",[["Almaraz-1","op","PWR",900],["Almaraz-2","op","PWR",900]]],["Angra","BR",[["Angra-1","op","PWR",609],["Angra-2","op","PWR",1245],["Angra-3","uc","PWR",1340]]],["APS-1 Obninsk","RU",[["APS-1 Obninsk","sd","LWGR",5]]],["Arkansas Nuclear One","US",[["Arkansas Nuclear One-1 (ANO-1)","op","PWR",850],["Arkansas Nuclear One-2 (ANO-2)","op","PWR",912]]],["Armenian","AM",[["Armenian-1","sd","PWR",376],["Armenian-2","op","PWR",375],["Armenian-3","pl","PWR",0]]],["Asco","ES",[["Asco-1","op","PWR",888],["Asco-2","op","PWR",888]]],["Atucha","AR",[["Atucha-1","op","PHWR",319],["Atucha-2","op","PHWR",692],["CAREM25","uc","PWR",25]]],["Balakovo","RU",[["Balakovo-1","op","PWR",950],["Balakovo-2","op","PWR",950],["Balakovo-3","op","PWR",950],["Balakovo-4","op","PWR",950]]],["Baltic","RU",[["Baltic-1","uc","PWR",1109]]],["Barakah","AE",[["Barakah-1 (Braka)","op","PWR",1310],["Barakah-2 (Braka)","op","PWR",1310],["Barakah-3 (Braka)","op","PWR",1310],["Barakah-4 (Braka)","uc","PWR",1310]]],["Barseback","SE",[["Barseback-1","sd","BWR",570],["Barseback-2","sd","BWR",570]]],["Beaver Valley","US",[["Beaver Valley-1","op","PWR",835],["Beaver Valley-2","op","PWR",836],["Shippingport","sd","PWR",60]]],["Belarusian","BY",[["Belarusian-1","op","PWR",1110],["Belarusian-2","op","PWR",1110]]],["Belene","BG",[["Belene-1","cc","PWR",953],["Belene-2","cc","PWR",953]]],["Belleville","FR",[["Belleville-1","op","PWR",1310],["Belleville-2","op","PWR",1310]]],["Beloyarsk","RU",[["Beloyarsk-1","sd","LWGR",102],["Beloyarsk-2","sd","LWGR",146],["Beloyarsk-3","op","FBR",560],["Beloyarsk-4","op","FBR",820],["Beloyarsk-5","pl","FBR",0]]],["Berkeley","GB",[["Berkeley-1","sd","GCR",138],["Berkeley-2","sd","GCR",138]]],["Beznau","CH",[["Beznau-1","op","PWR",350],["Beznau-2","op","PWR",350]]],["Biblis","DE",[["Biblis-A","sd","PWR",1146],["Biblis-B","sd","PWR",1178]]],["Big Rock Point","US",[["Big Rock Point","sd","BWR",72]]],["Bilibino","RU",[["Bilibino-1","sd","LWGR",11],["Bilibino-2","op","LWGR",11],["Bilibino-3","op","LWGR",11],["Bilibino-4","op","LWGR",11]]],["Blayais","FR",[["Blayais-1","op","PWR",910],["Blayais-2","op","PWR",910],["Blayais-3","op","PWR",910],["Blayais-4","op","PWR",910]]],["Bohunice","SK",[["Bohunice-1","sd","PWR",408],["Bohunice-2","sd","PWR",408],["Bohunice-3","op","PWR",466],["Bohunice-4","op","PWR",466],["Bohunice-A1","sd","HWGCR",110]]],["BONUS","US",[["BONUS","sd","BWR",17]]],["Borssele","NL",[["Borssele","op","PWR",495]]],["BR","BE",[["BR-3","sd","PWR",11]]],["Bradwell","GB",[["Bradwell-1","sd","GCR",150],["Bradwell-2","sd","GCR",150]]],["Braidwood","US",[["Braidwood-1","op","PWR",1120],["Braidwood-2","op","PWR",1120]]],["Brokdorf","DE",[["Brokdorf","sd","PWR",1307]]],["Browns Ferry","US",[["Browns Ferry-1","op","BWR",1065],["Browns Ferry-2","op","BWR",1065],["Browns Ferry-3","op","BWR",1065]]],["Bruce","CA",[["Bruce-1","op","PHWR",732],["Bruce-2","op","PHWR",732],["Bruce-3","op","PHWR",750],["Bruce-4","op","PHWR",750],["Bruce-5","op","PHWR",822],["Bruce-6","op","PHWR",822],["Bruce-7","op","PHWR",822],["Bruce-8","op","PHWR",795],["Douglas Point","sd","PHWR",203]]],["Brunsbuettel","DE",[["Brunsbuettel","sd","BWR",770]]],["Brunswick","US",[["Brunswick-1","op","BWR",821],["Brunswick-2","op","BWR",821]]],["Bugey","FR",[["Bugey-1","sd","GCR",540],["Bugey-2","op","PWR",920],["Bugey-3","op","PWR",920],["Bugey-4","op","PWR",900],["Bugey-5","op","PWR",900]]],["Bushehr","IR",[["Bushehr-1","op","PWR",915],["Bushehr-2","uc","PWR",974],["Bushehr-3","pl","",0],["Bushehr-4","pl","",0]]],["Byron","US",[["Byron-1","op","PWR",1120],["Byron-2","op","PWR",1120]]],["Calder Hall","GB",[["Calder Hall-1","sd","GCR",35],["Calder Hall-2","sd","GCR",35],["Calder Hall-3","sd","GCR",35],["Calder Hall-4","sd","GCR",35],["Windscale AGR","sd","GCR",32]]],["Callaway","US",[["Callaway-1","op","PWR",1171]]],["Calvert Cliffs","US",[["Calvert Cliffs-1","op","PWR",845],["Calvert Cliffs-2","op","PWR",845]]],["Caorso","IT",[["Caorso","sd","BWR",840]]],["Summer","US",[["Carolinas CVTR","sd","PHWR",17],["Summer-1","op","PWR",900],["Summer-2","sc","PWR",1117],["Summer-3","sc","PWR",1117]]],["Catawba","US",[["Catawba-1","op","PWR",1145],["Catawba-2","op","PWR",1145]]],["Cattenom","FR",[["Cattenom-1","op","PWR",1300],["Cattenom-2","op","PWR",1300],["Cattenom-3","op","PWR",1300],["Cattenom-4","op","PWR",1300]]],["CEFR","CN",[["CEFR (China Experimental Fast Reactor)","op","FBR",20]]],["Cernavoda","RO",[["Cernavoda-1","op","PHWR",650],["Cernavoda-2","op","PHWR",650],["Cernavoda-3","sc","PHWR",655],["Cernavoda-4","sc","PHWR",655],["Cernavoda-5","cc","PHWR",655]]],["Changjiang","CN",[["Changjiang SMR-1","uc","PWR",100],["Changjiang-1","op","PWR",601],["Changjiang-2","op","PWR",601],["Changjiang-3","uc","PWR",1000],["Changjiang-4","uc","PWR",1000]]],["Chapelcross","GB",[["Chapelcross-1","sd","GCR",35],["Chapelcross-2","sd","GCR",35],["Chapelcross-3","sd","GCR",35],["Chapelcross-4","sd","GCR",35]]],["CHASNUPP","PK",[["CHASNUPP-1","op","PWR",300],["CHASNUPP-2","op","PWR",300],["CHASNUPP-3","op","PWR",315],["CHASNUPP-4","op","PWR",313]]],["Chernobyl","UA",[["Chernobyl-1","sd","LWGR",925],["Chernobyl-2","sd","LWGR",925],["Chernobyl-3","sd","LWGR",925],["Chernobyl-4","sd","LWGR",925]]],["Chin Shan","TW",[["Chin Shan-1","sd","BWR",604],["Chin Shan-2","sd","BWR",604]]],["Chinon","FR",[["Chinon-A1","sd","GCR",68],["Chinon-A2","sd","GCR",170],["Chinon-A3","sd","GCR",480],["Chinon-B1","op","PWR",870],["Chinon-B2","op","PWR",870],["Chinon-B3","op","PWR",905],["Chinon-B4","op","PWR",905]]],["Chooz","FR",[["Chooz-A","sd","PWR",280],["Chooz-B1","op","PWR",1455],["Chooz-B2","op","PWR",1455]]],["Civaux","FR",[["Civaux-1","op","PWR",1450],["Civaux-2","op","PWR",1450]]],["Clinton","US",[["Clinton-1","op","BWR",950]]],["Cofrentes","ES",[["Cofrentes","op","BWR",939]]],["Columbia","US",[["Columbia (WNP-2)","op","BWR",1100]]],["Comanche Peak","US",[["Comanche Peak-1","op","PWR",1150],["Comanche Peak-2","op","PWR",1150]]],["Cooper","US",[["Cooper","op","BWR",778]]],["Cruas","FR",[["Cruas-1","op","PWR",880],["Cruas-2","op","PWR",915],["Cruas-3","op","PWR",880],["Cruas-4","op","PWR",880]]],["Crystal River","US",[["Crystal River-3","sd","PWR",825]]],["Dampierre","FR",[["Dampierre-1","op","PWR",890],["Dampierre-2","op","PWR",890],["Dampierre-3","op","PWR",890],["Dampierre-4","op","PWR",890]]],["Darkhovin","IR",[["Darkhovin","un","PWR",0]]],["Darlington","CA",[["Darlington-1","op","PHWR",881],["Darlington-2","op","PHWR",881],["Darlington-3","op","PHWR",881],["Darlington-4","op","PHWR",881],["Darlington-5","pl","PHWR",0],["Darlington-6","pl","PHWR",0]]],["Davis Besse","US",[["Davis Besse-1","op","PWR",906]]],["Lingao","CN",[["Daya Bay-1 (Guangdong-1)","op","PWR",930],["Daya Bay-2 (Guangdong-2)","op","PWR",930],["Lingao-1","op","PWR",950],["Lingao-2","op","PWR",950],["Lingao-3","op","PWR",1007],["Lingao-4","op","PWR",1007]]],["Diablo Canyon","US",[["Diablo Canyon-1","op","PWR",1084],["Diablo Canyon-2","op","PWR",1106]]],["Doel","BE",[["Doel-1","op","PWR",392],["Doel-2","op","PWR",445],["Doel-3","sd","PWR",890],["Doel-4","op","PWR",1000]]],["Donald Cook","US",[["Donald Cook-1","op","PWR",1030],["Donald Cook-2","op","PWR",1100]]],["Dounreay DFR","GB",[["Dounreay DFR","sd","FBR",14],["Dounreay PFR","sd","FBR",234]]],["Dresden","US",[["Dresden-1","sd","BWR",192],["Dresden-2","op","BWR",794],["Dresden-3","op","BWR",794]]],["Duane Arnold","US",[["Duane Arnold-1","sd","BWR",601]]],["Dukovany","CZ",[["Dukovany-1","op","PWR",420],["Dukovany-2","op","PWR",420],["Dukovany-3","op","PWR",420],["Dukovany-4","op","PWR",420]]],["Dungeness","GB",[["Dungeness-A1","sd","GCR",275],["Dungeness-A2","sd","GCR",275],["Dungeness-B1","sd","GCR",607],["Dungeness-B2","sd","GCR",607]]],["El Dabaa","EG",[["El Dabaa-1","uc","PWR",1100],["El Dabaa-2","uc","PWR",1100],["El Dabaa-3","uc","PWR",1100]]],["EL","FR",[["EL-4 (Monts D'Arree)","sd","HWGCR",70]]],["Elk River","US",[["Elk River","sd","BWR",22]]],["Embalse","AR",[["Embalse","op","PHWR",608]]],["Emsland","DE",[["Emsland","sd","PWR",1242],["Lingen","sd","BWR",183]]],["Enrico Fermi","IT",[["Enrico Fermi","sd","PWR",247]]],["Enrico Fermi","US",[["Enrico Fermi-1","sd","FBR",60],["Enrico Fermi-2","op","BWR",1093]]],["Fangchenggang","CN",[["Fangchenggang-1","op","PWR",1000],["Fangchenggang-2","op","PWR",1000],["Fangchenggang-3","op","PWR",1000],["Fangchenggang-4","uc","PWR",1000]]],["Qinshan","CN",[["Fangjiashan-1","op","PWR",1000],["Fangjiashan-2","op","PWR",1000],["Qinshan-1","op","PWR",289],["Qinshan-2-1 (Qinshan 2)","op","PWR",610],["Qinshan-2-2 (Qinshan 3)","op","PWR",610],["Qinshan-2-3 (Qinshan 4)","op","PWR",619],["Qinshan-2-4 (Qinshan 5)","op","PWR",619],["Qinshan-3-1 (Qinshan 6)","op","PHWR",677],["Qinshan-3-2 (Qinshan 7)","op","PHWR",677]]],["Farley","US",[["Farley-1","op","PWR",829],["Farley-2","op","PWR",829]]],["Fessenheim","FR",[["Fessenheim-1","sd","PWR",880],["Fessenheim-2","sd","PWR",880]]],["Nine Mile Point","US",[["FitzPatrick","op","BWR",821],["Nine Mile Point-1","op","BWR",620],["Nine Mile Point-2","op","BWR",1100]]],["Flamanville","FR",[["Flamanville-1","op","PWR",1330],["Flamanville-2","op","PWR",1330],["Flamanville-3","uc","PWR",1630]]],["Forsmark","SE",[["Forsmark-1","op","BWR",900],["Forsmark-2","op","BWR",900],["Forsmark-3","op","BWR",1050]]],["Fort Calhoun","US",[["Fort Calhoun-1","sd","PWR",478]]],["Fort St. Vrain","US",[["Fort St. Vrain","sd","HTGR",330]]],["Fugen ATR","JP",[["Fugen ATR","sd","HWLWR",148],["Monju","sd","FBR",246]]],["Fukushima Daiichi","JP",[["Fukushima Daiichi-1","sd","BWR",439],["Fukushima Daiichi-2","sd","BWR",760],["Fukushima Daiichi-3","sd","BWR",760],["Fukushima Daiichi-4","sd","BWR",760],["Fukushima Daiichi-5","sd","BWR",760],["Fukushima Daiichi-6","sd","BWR",1067]]],["Fukushima Daini","JP",[["Fukushima Daini-1","sd","BWR",1067],["Fukushima Daini-2","sd","BWR",1067],["Fukushima Daini-3","sd","BWR",1067],["Fukushima Daini-4","sd","BWR",1067]]],["Fuqing","CN",[["Fuqing-1","op","PWR",1000],["Fuqing-2","op","PWR",1000]]],["Fuqing","CN",[["Fuqing-3","op","PWR",1000],["Fuqing-4","op","PWR",1000],["Fuqing-5","op","PWR",1075],["Fuqing-6","op","PWR",1075]]],["G","FR",[["G-2 (Marcoule)","sd","GCR",36],["G-3 (Marcoule)","sd","GCR",36],["Phenix","sd","FBR",233]]],["Garigliano","IT",[["Garigliano","sd","BWR",150]]],["GE Vallecitos","US",[["GE Vallecitos","sd","BWR",24]]],["Genkai","JP",[["Genkai-1","sd","PWR",529],["Genkai-2","sd","PWR",529],["Genkai-3","op","PWR",1127],["Genkai-4","op","PWR",1127]]],["Gentilly","CA",[["Gentilly-1 (Demo)","sd","HWLWR",250],["Gentilly-2","sd","PHWR",645]]],["Dodewaard","NL",[["Dodewaard","sd","BWR",54]]],["Goesgen","CH",[["Goesgen","op","PWR",920]]],["Golfech","FR",[["Golfech-1","op","PWR",1310],["Golfech-2","op","PWR",1310]]],["Grafenrheinfeld","DE",[["Grafenrheinfeld","sd","PWR",1225]]],["Grand Gulf","US",[["Grand Gulf-1","op","BWR",1250]]],["Gravelines","FR",[["Gravelines-1","op","PWR",910],["Gravelines-2","op","PWR",910],["Gravelines-3","op","PWR",910],["Gravelines-4","op","PWR",910],["Gravelines-5","op","PWR",910],["Gravelines-6","op","PWR",910]]],["Greifswald","DE",[["Greifswald-1","sd","PWR",440],["Greifswald-2","sd","PWR",408],["Greifswald-3","sd","PWR",408],["Greifswald-4","sd","PWR",408],["Greifswald-5","sd","PWR",408]]],["Grohnde","DE",[["Grohnde","sd","PWR",1289]]],["Grosswelzheim","DE",[["Grosswelzheim","dc","BWR",23],["Kahl","dc","BWR",15]]],["Gundremmingen","DE",[["Gundremmingen-A","sd","BWR",237],["Gundremmingen-B","sd","BWR",1244],["Gundremmingen-C","sd","BWR",1249]]],["H. B. Robinson","US",[["H. B. Robinson-2","op","PWR",700]]],["Haddam Neck","US",[["Haddam Neck","sd","PWR",582]]],["Haiyang","CN",[["Haiyang-1","op","PWR",1126],["Haiyang-2","op","PWR",1126],["Haiyang-3","uc","PWR",1161],["Haiyang-4","uc","PWR",1161]]],["Hallam","US",[["Hallam","sd","OCR",75]]],["Hamaoka","JP",[["Hamaoka-1","sd","BWR",516],["Hamaoka-2","sd","BWR",814],["Hamaoka-3","so","BWR",1056],["Hamaoka-4","so","BWR",1092],["Hamaoka-5","so","BWR",1325],["Hamaoka-6","pl","ABWR",0]]],["Hanbit","KR",[["Hanbit-1","op","PWR",903],["Hanbit-2","op","PWR",903],["Hanbit-3","op","PWR",950],["Hanbit-4","op","PWR",950],["Hanbit-5","op","PWR",950],["Hanbit-6","op","PWR",993]]],["Hanul","KR",[["Hanul-1","op","PWR",903],["Hanul-2","op","PWR",903],["Hanul-3","op","PWR",997],["Hanul-4","op","PWR",950],["Hanul-5","op","PWR",950],["Hanul-6","op","PWR",950],["Shin-Hanul-1","op","PWR",1340],["Shin-Hanul-2","op","PWR",1340]]],["Hartlepool","GB",[["Hartlepool-A1","op","GCR",590],["Hartlepool-A2","op","GCR",595]]],["Hatch","US",[["Hatch-1","op","BWR",777],["Hatch-2","op","BWR",784]]],["Heysham","GB",[["Heysham-A1","op","GCR",611],["Heysham-A2","op","GCR",611],["Heysham-B1","op","GCR",615],["Heysham-B2","op","GCR",615]]],["Higashi Dori","JP",[["Higashi Dori-1 (Tohoku)","so","BWR",1067],["Higashi Dori-1 (Tokyo)","pl","ABWR",0],["Higashi Dori-2 (Tohoku)","pl","ABWR",0],["Higashi Dori-2 (Tokyo)","pl","ABWR",0]]],["Hinkley Point","GB",[["Hinkley Point-A1","sd","GCR",250],["Hinkley Point-A2","sd","GCR",250],["Hinkley Point-B1","sd","GCR",625],["Hinkley Point-B2","sd","GCR",625],["Hinkley Point-C1","uc","PWR",1630],["Hinkley Point-C2","uc","PWR",1630]]],["Hongyanhe","CN",[["Hongyanhe-1","op","PWR",1061],["Hongyanhe-2","op","PWR",1061],["Hongyanhe-3","op","PWR",1061],["Hongyanhe-4","op","PWR",1061],["Hongyanhe-5","op","PWR",1061],["Hongyanhe-6","op","PWR",1061]]],["Salem","US",[["Hope Creek-1","op","BWR",1067],["Salem-1","op","PWR",1090],["Salem-2","op","PWR",1115]]],["Humboldt Bay","US",[["Humboldt Bay","sd","BWR",65]]],["Hunterston","GB",[["Hunterston-A1","sd","GCR",150],["Hunterston-A2","sd","GCR",150],["Hunterston-B1","sd","GCR",624],["Hunterston-B2","sd","GCR",624]]],["Ignalina","LT",[["Ignalina-1","sd","LWGR",1500],["Ignalina-2","sd","LWGR",1500],["Ignalina-3","cc","LWGR",1380],["Visaginas-1","pl","",0],["Visaginas-2","pl","",0]]],["Ikata","JP",[["Ikata-1","sd","PWR",538],["Ikata-2","sd","PWR",538],["Ikata-3","op","PWR",846]]],["Indian Point","US",[["Indian Point-1","sd","PWR",265],["Indian Point-2","sd","PWR",873],["Indian Point-3","sd","PWR",965]]],["Isar","DE",[["Isar-1","sd","BWR",870],["Isar-2","sd","PWR",1285],["Niederaichbach","dc","HWGCR",100]]],["Jaitapur","IN",[["Jaitapur-1","pl","PWR",0],["Jaitapur-2","pl","PWR",0]]],["Jose Cabrera","ES",[["Jose Cabrera-1 (Zorita)","sd","PWR",153]]],["Tokai","JP",[["JPDR","sd","BWR",10],["Tokai-1","sd","GCR",159],["Tokai-2","so","BWR",1056]]],["AVR Juelich","DE",[["AVR Juelich","sd","HTGR",13]]],["Kaiga","IN",[["Kaiga-1","op","PHWR",202],["Kaiga-2","op","PHWR",202],["Kaiga-3","op","PHWR",202],["Kaiga-4","op","PHWR",202],["Kaiga-5","pl","PWR",0],["Kaiga-6","pl","PWR",0]]],["Kakrapar","IN",[["Kakrapar-1","op","PHWR",202],["Kakrapar-2","op","PHWR",202],["Kakrapar-3","op","PHWR",630],["Kakrapar-4","uc","PHWR",630]]],["Kalinin","RU",[["Kalinin-1","op","PWR",950],["Kalinin-2","op","PWR",950],["Kalinin-3","op","PWR",950],["Kalinin-4","op","PWR",950]]],["Kalpakkam","IN",[["Kalpakkam (PFBR)","uc","FBR",470],["Kalpakkam-1 (Madras-1 / MAPS1)","so","PHWR",202],["Kalpakkam-2 (Madras-2 / MAPS2)","op","PHWR",202]]],["KANUPP","PK",[["KANUPP-1","sd","PHWR",125],["KANUPP-2","op","PWR",1017],["KANUPP-3","op","PWR",1014]]],["MZFR","DE",[["KNK-II","sd","FBR",18],["MZFR","sd","PHWR",50]]],["Kashiwazaki Kariwa","JP",[["Kashiwazaki Kariwa-1","so","BWR",1067],["Kashiwazaki Kariwa-2","so","BWR",1067],["Kashiwazaki Kariwa-3","so","BWR",1067],["Kashiwazaki Kariwa-4","so","BWR",1067],["Kashiwazaki Kariwa-5","so","BWR",1067],["Kashiwazaki Kariwa-6","so","BWR",1315],["Kashiwazaki Kariwa-7","so","BWR",1315]]],["Kewaunee","US",[["Kewaunee","sd","PWR",535]]],["Khmelnitski","UA",[["Khmelnitski-1","op","PWR",950],["Khmelnitski-2","op","PWR",950],["Khmelnitski-3","uc","PWR",1035],["Khmelnitski-4","uc","PWR",1035]]],["Koeberg","ZA",[["Koeberg-1","op","PWR",921],["Koeberg-2","op","PWR",921]]],["Kola","RU",[["Kola-1","op","PWR",411],["Kola-2","op","PWR",411],["Kola-3","op","PWR",411],["Kola-4","op","PWR",411]]],["Kori","KR",[["Kori-1","sd","PWR",558],["Kori-2","op","PWR",618],["Kori-3","op","PWR",1001],["Kori-4","op","PWR",1012],["Saeul-1","op","PWR",1340],["Saeul-2","op","PWR",1340],["Saeul-3","uc","PWR",1340],["Saeul-4","uc","PWR",1340],["Shin-Kori-1","op","PWR",998],["Shin-Kori-2","op","PWR",995]]],["Kozloduy","BG",[["Kozloduy-1","sd","PWR",408],["Kozloduy-2","sd","PWR",408],["Kozloduy-3","sd","PWR",408],["Kozloduy-4","sd","PWR",408],["Kozloduy-5","op","PWR",953],["Kozloduy-6","op","PWR",1003]]],["Krsko","SI",[["Krsko","op","PWR",632]]],["Kruemmel","DE",[["Kruemmel","sd","BWR",1260]]],["Kudankulam","IN",[["Kudankulam-1","op","PWR",917],["Kudankulam-2","op","PWR",917],["Kudankulam-3","uc","PWR",917],["Kudankulam-4","uc","PWR",917],["Kudankulam-5","uc","PWR",917],["Kudankulam-6","uc","PWR",917]]],["Kuosheng","TW",[["Kuosheng-1","sd","BWR",948],["Kuosheng-2","sd","BWR",948]]],["Kursk","RU",[["Kursk 2-1","uc","PWR",1200],["Kursk 2-2","uc","PWR",1200],["Kursk-1","sd","LWGR",925],["Kursk-2","op","LWGR",925],["Kursk-3","op","LWGR",925],["Kursk-4","op","LWGR",925]]],["LaCrosse","US",[["LaCrosse","sd","BWR",50]]],["Laguna Verde","MX",[["Laguna Verde-1","op","BWR",780],["Laguna Verde-2","op","BWR",780]]],["LaSalle","US",[["LaSalle-1","op","BWR",1078],["LaSalle-2","op","BWR",1078]]],["Latina","IT",[["Latina","sd","GCR",200]]],["Leibstadt","CH",[["Leibstadt","op","BWR",960]]],["Leningrad 2","RU",[["Leningrad 2-1","op","PWR",1066],["Leningrad 2-2","op","PWR",1066],["Leningrad 2-3","pl","PWR",1085],["Leningrad 2-4","pl","PWR",1085],["Leningrad-1","sd","LWGR",925],["Leningrad-2","sd","LWGR",925],["Leningrad-3","op","LWGR",925],["Leningrad-4","op","LWGR",925]]],["Limerick","US",[["Limerick-1","op","BWR",1055],["Limerick-2","op","BWR",1055]]],["Loviisa","FI",[["Loviisa-1","op","PWR",420],["Loviisa-2","op","PWR",420]]],["Lucens","CH",[["Lucens","sd","HWGCR",6]]],["Lungmen","TW",[["Lungmen-1","sc","BWR",1300],["Lungmen-2","sc","BWR",1300],["Maanshan-1","op","PWR",936],["Maanshan-2","op","PWR",938]]],["Maine Yankee","US",[["Maine Yankee","sd","PWR",825]]],["McGuire","US",[["McGuire-1","op","PWR",1180],["McGuire-2","op","PWR",1180]]],["Mihama","JP",[["Mihama-1","sd","PWR",320],["Mihama-2","sd","PWR",470],["Mihama-3","op","PWR",780]]],["Millstone","US",[["Millstone-1","sd","BWR",660],["Millstone-2","op","PWR",870],["Millstone-3","op","PWR",1159]]],["Mochovce","SK",[["Mochovce-1","op","PWR",408],["Mochovce-2","op","PWR",408],["Mochovce-3","op","PWR",440],["Mochovce-4","uc","PWR",440]]],["Monticello","US",[["Monticello","op","BWR",545]]],["Muehleberg","CH",[["Muehleberg","sd","BWR",306]]],["Muelheim-Kaerlich","DE",[["Muelheim-Kaerlich","sd","PWR",1219]]],["Narora","IN",[["Narora-1","op","PHWR",202],["Narora-2","op","PHWR",202]]],["Neckarwestheim","DE",[["Neckarwestheim-1","sd","PWR",805],["Neckarwestheim-2","sd","PWR",1225]]],["Ningde","CN",[["Ningde-1","op","PWR",1018],["Ningde-2","op","PWR",1018],["Ningde-3","op","PWR",1018],["Ningde-4","op","PWR",1018],["Ningde-5","pl","PWR",0],["Ningde-6","pl","PWR",0]]],["Nizhny Novgorod","RU",[["Nizhny Novgorod-1","pl","PWR",0],["Nizhny Novgorod-2","pl","PWR",0]]],["Nogent","FR",[["Nogent-1","op","PWR",1310],["Nogent-2","op","PWR",1310]]],["North Anna","US",[["North Anna-1","op","PWR",907],["North Anna-2","op","PWR",907]]],["Novovoronezh","RU",[["Novovoronezh 2-1","op","PWR",1114],["Novovoronezh 2-2","op","PWR",1114],["Novovoronezh-1","sd","PWR",197],["Novovoronezh-2","sd","PWR",336],["Novovoronezh-3","sd","PWR",385],["Novovoronezh-4","op","PWR",385]]],["Novovoronezh","RU",[["Novovoronezh-5","op","PWR",950]]],["Obrigheim","DE",[["Obrigheim","sd","PWR",283]]],["Oconee","US",[["Oconee-1","op","PWR",887],["Oconee-2","op","PWR",887],["Oconee-3","op","PWR",887]]],["Ohi","JP",[["Ohi-1","sd","PWR",1120],["Ohi-2","sd","PWR",1120],["Ohi-3","op","PWR",1127],["Ohi-4","op","PWR",1127]]],["Ohma","JP",[["Ohma","uc","BWR",1328]]],["Oldbury","GB",[["Oldbury-A1","sd","GCR",300],["Oldbury-A2","sd","GCR",300]]],["Olkiluoto","FI",[["Olkiluoto-1","op","BWR",660],["Olkiluoto-2","op","BWR",660],["Olkiluoto-3","op","PWR",1600],["Olkiluoto-4","pl","",0]]],["Onagawa","JP",[["Onagawa-1","sd","BWR",498],["Onagawa-2","so","BWR",796],["Onagawa-3","so","BWR",796]]],["Oskarshamn","SE",[["Oskarshamn-1","sd","BWR",440],["Oskarshamn-2","sd","BWR",580],["Oskarshamn-3","op","BWR",1050]]],["Oyster Creek","US",[["Oyster Creek","sd","BWR",650]]],["Paks","HU",[["Paks-1","op","PWR",408],["Paks-2","op","PWR",410],["Paks-3","op","PWR",410],["Paks-4","op","PWR",410]]],["Palisades","US",[["Palisades","sd","PWR",805]]],["Palo Verde","US",[["Palo Verde-1","op","PWR",1221],["Palo Verde-2","op","PWR",1304],["Palo Verde-3","op","PWR",1304]]],["Paluel","FR",[["Paluel-1","op","PWR",1330],["Paluel-2","op","PWR",1330],["Paluel-3","op","PWR",1330],["Paluel-4","op","PWR",1330]]],["Pathfinder","US",[["Pathfinder","sd","BWR",59]]],["Peach Bottom","US",[["Peach Bottom-1","sd","HTGR",40],["Peach Bottom-2","op","BWR",1065],["Peach Bottom-3","op","BWR",1065]]],["Penly","FR",[["Penly-1","op","PWR",1330],["Penly-2","op","PWR",1330],["Penly-3","pl","PWR",0]]],["Perry","US",[["Perry-1","op","BWR",1205]]],["Philippsburg","DE",[["Philippsburg-1","sd","BWR",864],["Philippsburg-2","sd","PWR",1268]]],["Pickering","CA",[["Pickering-1","op","PHWR",508],["Pickering-2","sd","PHWR",508],["Pickering-3","sd","PHWR",508],["Pickering-4","op","PHWR",508],["Pickering-5","op","PHWR",516],["Pickering-6","op","PHWR",516],["Pickering-7","op","PHWR",516],["Pickering-8","op","PHWR",516]]],["Pilgrim","US",[["Pilgrim-1","sd","BWR",655]]],["Piqua","US",[["Piqua","sd","OCR",11]]],["Point Beach","US",[["Point Beach-1","op","PWR",497],["Point Beach-2","op","PWR",497]]],["Point Lepreau","CA",[["Point Lepreau","op","PHWR",660],["Point Lepreau 2","pl","",0]]],["Prairie Island","US",[["Prairie Island-1","op","PWR",530],["Prairie Island-2","op","PWR",530]]],["Quad Cities","US",[["Quad Cities-1","op","BWR",789],["Quad Cities-2","op","BWR",789]]],["R. E. Ginna","US",[["R. E. Ginna","op","PWR",470]]],["Rajasthan","IN",[["Rajasthan-1","so","PHWR",207],["Rajasthan-2","op","PHWR",207],["Rajasthan-3","op","PHWR",202],["Rajasthan-4","op","PHWR",202],["Rajasthan-5","op","PHWR",202],["Rajasthan-6","op","PHWR",202],["Rajasthan-7","uc","PHWR",630],["Rajasthan-8","uc","PHWR",630]]],["Rancho Seco","US",[["Rancho Seco-1","sd","PWR",918]]],["Rheinsberg","DE",[["Rheinsberg","sd","PWR",62]]],["Ringhals","SE",[["Ringhals-1","sd","BWR",881],["Ringhals-2","sd","PWR",820],["Ringhals-3","op","PWR",915],["Ringhals-4","op","PWR",1130]]],["River Bend","US",[["River Bend-1","op","BWR",966]]],["Rolphton NPD","CA",[["Rolphton NPD","sd","PHWR",17]]],["Rostov","RU",[["Rostov-1 (Volgodonsk-1)","op","PWR",950],["Rostov-2 (Volgodonsk-2)","op","PWR",950],["Rostov-3 (Volgodonsk-3)","op","PWR",950],["Rostov-4 (Volgodonsk-4)","op","PWR",950]]],["Rivne","UA",[["Rivne-1","op","PWR",361],["Rivne-2","op","PWR",384],["Rivne-3","op","PWR",950],["Rivne-4","op","PWR",950]]],["San Onofre","US",[["San Onofre-1","sd","PWR",436],["San Onofre-2","sd","PWR",1070],["San Onofre-3","sd","PWR",1070]]],["Sanmen","CN",[["Sanmen-1","op","PWR",1157],["Sanmen-2","op","PWR",1157],["Sanmen-3","uc","PWR",1163],["Sanmen-4","uc","PWR",1163]]],["Santa Maria de Garona","ES",[["Santa Maria de Garona","sd","BWR",440]]],["Saxton","US",[["Saxton","sd","PWR",3]]],["Seabrook","US",[["Seabrook-1","op","PWR",1149]]],["Sendai","JP",[["Sendai-1","op","PWR",846],["Sendai-2","op","PWR",846]]],["Sequoyah","US",[["Sequoyah-1","op","PWR",1148],["Sequoyah-2","op","PWR",1148]]],["Shearon Harris","US",[["Shearon Harris-1","op","PWR",900]]],["CAP1400","CN",[["CAP1400-1","uc","PWR",1534],["CAP1400-2","uc","PWR",1534],["Shidao Bay-1","op","HTGR",200]]],["Shika","JP",[["Shika-1","so","BWR",505],["Shika-2","so","BWR",1304]]],["Shimane","JP",[["Shimane-1","sd","BWR",439],["Shimane-2","so","BWR",789],["Shimane-3","uc","BWR",1325]]],["Wolsong","KR",[["Shin-Wolsong-1","op","PWR",950],["Shin-Wolsong-2","op","PWR",950],["Wolsong-1","sd","PHWR",629],["Wolsong-2","op","PHWR",652],["Wolsong-3","op","PHWR",665],["Wolsong-4","op","PHWR",669],["Wolsong-5","pl","PHWR",0],["Wolsong-6","pl","PHWR",0]]],["Shoreham","US",[["Shoreham","sd","BWR",809]]],["Sinop","TR",[["Sinop-1","pl","PWR",0],["Sinop-2","pl","PWR",0],["Sinop-3","pl","PWR",0],["Sinop-4","pl","PWR",0]]],["Sizewell","GB",[["Sizewell-A1","sd","GCR",290],["Sizewell-A2","sd","GCR",290],["Sizewell-B","op","PWR",1188],["Sizewell-C1","pl","PWR",0],["Sizewell-C2","pl","PWR",0]]],["Smolensk","RU",[["Smolensk-1","op","LWGR",925],["Smolensk-2","op","LWGR",925],["Smolensk-3","op","LWGR",925]]],["South Texas","US",[["South Texas-1","op","PWR",1250],["South Texas-2","op","PWR",1250]]],["South Ukraine","UA",[["South Ukraine-1","op","PWR",950],["South Ukraine-2","op","PWR",950],["South Ukraine-3","op","PWR",950]]],["St. Alban","FR",[["St. Alban-1","op","PWR",1335],["St. Alban-2","op","PWR",1335]]],["St. Laurent","FR",[["St. Laurent-A1","sd","GCR",480],["St. Laurent-A2","sd","GCR",515],["St. Laurent-B1","op","PWR",915],["St. Laurent-B2","op","PWR",880]]],["St. Lucie","US",[["St. Lucie-1","op","PWR",830],["St. Lucie-2","op","PWR",830]]],["Stade","DE",[["Stade","sd","PWR",630]]],["Super-Phenix","FR",[["Super-Phenix","sd","FBR",1200]]],["Surry","US",[["Surry-1","op","PWR",788],["Surry-2","op","PWR",788]]],["Susquehanna","US",[["Susquehanna-1","op","BWR",1065],["Susquehanna-2","op","BWR",1065]]],["Taishan","CN",[["Taishan-1","op","PWR",1660],["Taishan-2","op","PWR",1660]]],["Takahama","JP",[["Takahama-1","op","PWR",780],["Takahama-2","op","PWR",780],["Takahama-3","op","PWR",830],["Takahama-4","op","PWR",830]]],["Tarapur","IN",[["Tarapur-1","so","BWR",200],["Tarapur-2","so","BWR",200],["Tarapur-3","op","PHWR",502],["Tarapur-4","op","PHWR",502]]],["Temelin","CZ",[["Temelin-1","op","PWR",1027],["Temelin-2","op","PWR",1029]]],["Three Mile Island","US",[["Three Mile Island-1","sd","PWR",819],["Three Mile Island-2","sd","PWR",906]]],["THTR","DE",[["THTR-300","sd","HTGR",296]]],["Tianwan","CN",[["Tianwan-1","op","PWR",990],["Tianwan-2","op","PWR",990],["Tianwan-3","op","PWR",1060],["Tianwan-4","op","PWR",1060],["Tianwan-5","op","PWR",1000],["Tianwan-6","op","PWR",1000],["Tianwan-7","uc","PWR",1171],["Tianwan-8","uc","PWR",1171]]],["Tihange","BE",[["Tihange-1","op","PWR",870],["Tihange-2","sd","PWR",900],["Tihange-3","op","PWR",1020]]],["Tomari","JP",[["Tomari-1","so","PWR",550],["Tomari-2","so","PWR",550],["Tomari-3","so","PWR",866]]],["Torness","GB",[["Torness-1","op","GCR",645],["Torness-2","op","GCR",645]]],["Trawsfynydd","GB",[["Trawsfynydd-1","sd","GCR",250],["Trawsfynydd-2","sd","GCR",250]]],["Tricastin","FR",[["Tricastin-1","op","PWR",915],["Tricastin-2","op","PWR",915],["Tricastin-3","op","PWR",915],["Tricastin-4","op","PWR",915]]],["Trillo","ES",[["Trillo-1","op","PWR",990]]],["Trojan","US",[["Trojan","sd","PWR",1130]]],["Tsuruga","JP",[["Tsuruga-1","sd","BWR",341],["Tsuruga-2","so","PWR",1115]]],["Turkey Point","US",[["Turkey Point-3","op","PWR",693],["Turkey Point-4","op","PWR",693]]],["Unterweser","DE",[["Unterweser","sd","PWR",1230]]],["Vandellos","ES",[["Vandellos-1","sd","GCR",480],["Vandellos-2","op","PWR",930]]],["Vermont Yankee","US",[["Vermont Yankee","sd","BWR",514]]],["Vogtle","US",[["Vogtle-1","op","PWR",1122],["Vogtle-2","op","PWR",1101],["Vogtle-3","op","PWR",1117],["Vogtle-4","uc","PWR",1117]]],["Waterford","US",[["Waterford-3","op","PWR",1104]]],["Watts Bar","US",[["Watts Bar-1","op","PWR",1218],["Watts Bar-2","op","PWR",1165]]],["Winfrith SGHWR","GB",[["Winfrith SGHWR","sd","SGHWR",92]]],["Wolf Creek","US",[["Wolf Creek","op","PWR",1170]]],["Wuergassen","DE",[["Wuergassen","sd","BWR",640]]],["Wylfa","GB",[["Wylfa-1","sd","GCR",550],["Wylfa-2","sd","GCR",550]]],["Xianning","CN",[["Xianning-1","pl","PWR",0],["Xianning-2","pl","PWR",0]]],["Yangjiang","CN",[["Yangjiang-1","op","PWR",1021],["Yangjiang-2","op","PWR",1000],["Yangjiang-3","op","PWR",1000]]],["Yangjiang","CN",[["Yangjiang-4","op","PWR",1000],["Yangjiang-5","op","PWR",1021],["Yangjiang-6","op","PWR",1000]]],["Yankee Rowe","US",[["Yankee Rowe","sd","PWR",175]]],["Zaporozhye","UA",[["Zaporozhye-1","op","PWR",950],["Zaporozhye-2","op","PWR",950],["Zaporozhye-3","op","PWR",950],["Zaporozhye-4","op","PWR",950],["Zaporozhye-5","op","PWR",950],["Zaporozhye-6","op","PWR",950]]],["Zhangzhou","CN",[["Zhangzhou-1","uc","PWR",1126],["Zhangzhou-2","uc","PWR",1126]]],["Zion","US",[["Zion-1","sd","PWR",1040],["Zion-2","sd","PWR",1040]]],["Rooppur","BD",[["Rooppur-1","uc","PWR",1080],["Rooppur-2","uc","PWR",1080]]],["Taipingling","CN",[["Taipingling-1","uc","PWR",1116],["Taipingling-2","uc","PWR",1116]]],["Xiapu","CN",[["Xiapu-1","uc","FBR",642],["Xiapu-2","uc","FBR",600]]],["Zwentendorf","AT",[["Zwentendorf","nc","BWR",692]]],["SNR","DE",[["SNR-300 (Kalkar)","nc","FBR",295]]],["Sanaocun","CN",[["Sanaocun-1","uc","PWR",1117],["Sanaocun-2","uc","PWR",1117]]],["Xudabu","CN",[["Xudabu-1","uc","PWR",1000],["Xudabu-2","pl","PWR",1000],["Xudabu-3","uc","PWR",1200],["Xudabu-4","uc","PWR",1200]]],["BREST-OD","RU",[["BREST-OD-300","uc","FBR",300]]]];
const HIT = [[1,709.2,102.8],[24,701.8,105.8],[147,442.8,101.9],[186,421.4,110.5],[90,415.1,112],[162,430.9,115.4],[160,436.1,111.5],[0,415,121.8],[72,372.8,122.9],[139,447.8,115],[188,412.2,119.9],[210,403.4,118.4],[19,498.5,120.2],[280,544.1,126.1],[249,375.4,121.8],[176,461.9,127.6],[14,405,127.6],[128,370.5,127.7],[129,431.4,127.9],[6,450.7,128.7],[50,373.8,128.8],[12,422.8,129],[16,430.5,122.3],[120,377.7,124.3],[40,373.2,129.8],[230,444.3,122.5],[109,406.4,130.3],[122,374.4,123.2],[35,397.8,130.7],[32,398.1,130.8],[236,398.4,131.2],[256,396.4,131.5],[265,371.3,131.5],[151,400.1,131.5],[209,405.1,132],[250,372.4,132.4],[81,394.1,133.1],[180,455.8,128.6],[229,383.1,128.3],[11,472.7,124.7],[110,398.2,133.8],[103,391,134.1],[277,392.2,134.3],[30,381.7,134.3],[20,375.2,134.4],[245,395.4,134.4],[154,448.8,126.7],[185,375,134.5],[264,398.2,134.5],[28,387.2,131.3],[52,438.2,134.9],[214,430.1,127.4],[70,388.2,128.6],[179,455.8,127.6],[29,389.9,135.2],[124,373.9,135.2],[108,384.1,124.8],[76,381.9,135.7],[136,392.4,135.7],[262,375.6,136.1],[247,390.2,129.9],[172,394.5,136.6],[145,431.5,130.2],[55,389.3,129.2],[111,397.4,137.1],[106,399.7,137.3],[196,382.3,129.7],[193,381.2,126.9],[22,396.3,137.7],[89,376.4,130.4],[46,392,127.7],[181,397.5,138.3],[198,396.3,138.5],[243,407.8,131.9],[142,396.3,138.7],[75,411.2,132.6],[174,397.7,138.9],[132,403.8,139.6],[177,386.8,132.2],[112,400.1,139.7],[26,414.2,135.1],[276,410.7,140],[78,372.5,140],[169,415.7,134.8],[87,394.6,140.8],[232,440.4,133],[64,384.9,132.3],[234,383.1,134.7],[159,395.8,136.5],[213,461.9,132.2],[21,395.9,137.2],[18,385.5,133.9],[270,446.9,130.5],[104,395.4,137],[54,380.3,133.1],[171,394,142.3],[163,393.2,142.8],[190,416.4,136.9],[59,149.3,138.1],[56,381.3,135.2],[102,240.1,143.3],[212,229.8,143.6],[253,142.4,143.9],[150,410,140.1],[37,390.2,135.4],[237,390.6,144.3],[233,389.2,137.3],[23,215.3,145],[170,198.6,141.4],[79,199.1,145.1],[25,378.7,136.3],[82,396,145.3],[43,399.1,145.5],[203,251.5,141.5],[62,389.2,137.5],[204,200.9,141.3],[144,210.9,146.5],[34,222.3,135.3],[251,389.1,137.9],[48,434.2,141.3],[202,210.8,142],[98,389.1,147],[105,381.6,139.6],[165,245.3,147.4],[66,227.8,138.8],[199,227.1,139.4],[149,426,141.1],[17,428.7,147.9],[3,479.1,147.9],[194,193.2,148],[155,203.6,148],[88,232.3,140.6],[206,230.6,145.1],[248,651.6,148.9],[219,243,144],[258,239.8,149.3],[217,373.8,149.3],[269,239,149.4],[272,210.3,149.9],[191,213.1,150.1],[74,202.6,150.5],[39,207.4,143.5],[228,447.7,150.6],[71,212.7,143.8],[83,219.1,145.7],[200,243.6,150.7],[197,223.1,145.7],[205,205.4,145.1],[67,219.4,146.7],[91,194.3,151.4],[184,652.4,151.5],[114,239.9,151.5],[158,404.8,151.6],[73,209.2,145.7],[168,240.5,145.1],[131,237,151.9],[99,406.7,151.9],[31,209.4,144.9],[157,208.6,145],[9,381.1,145.7],[123,653.3,152],[239,232.8,145.3],[227,239.1,152.4],[257,381.7,147.7],[127,139.9,152.7],[252,374.9,148],[15,224.5,146.8],[116,192.9,153],[134,374.6,153.4],[61,195.1,149.1],[279,613,153.4],[92,177.3,153.6],[218,228.8,153.6],[161,233.9,146.8],[8,465.3,150.6],[57,208.3,149],[244,231.7,153.7],[201,217.2,153.8],[189,236.5,154.3],[4,369,148],[125,614.8,142.8],[195,232.6,147.5],[47,604.3,153.4],[126,234,146.5],[58,378,150.6],[41,202.6,150.9],[42,232.2,150.5],[187,653.5,156.7],[208,145.9,156.8],[263,195,151.8],[178,229.6,150.9],[100,144.5,158],[143,647.9,158.3],[94,652.6,158.3],[95,652.6,158.5],[238,231.7,152.8],[119,630.1,145.7],[224,644.3,158.9],[223,616.9,156.7],[115,614.6,152.5],[135,651.8,159.9],[2,444.8,160.4],[93,642.9,161.1],[226,630.3,152],[167,642.8,156.9],[254,643.1,161.2],[222,227.4,156.7],[261,216.1,154.1],[183,642.2,154.4],[225,637.1,161.5],[241,641.9,153.1],[166,223.5,154.4],[118,624.4,150.8],[148,629.9,149.5],[7,199.8,155.6],[221,215.5,154.9],[69,146.4,155.1],[45,223.3,155.2],[182,219.8,155.1],[33,211.6,154.5],[246,610.9,151.6],[117,647,163],[113,225,159.3],[44,222.8,159],[36,229.2,158],[101,631,157.8],[130,635.8,160.4],[192,161.8,156],[215,152.8,165.1],[259,221.9,157],[51,518.1,161.4],[60,191,159.8],[107,204,162],[121,220.8,161.6],[220,631.7,161.5],[86,215.5,162.6],[77,435.1,169],[211,203.4,164.8],[65,473.5,169.5],[85,613.8,158.7],[260,205.1,165.7],[266,601.7,171.3],[216,615.2,165.1],[63,220.1,172.5],[38,478.4,168.1],[231,194.3,165.3],[173,531.6,170.6],[235,224.9,169.1],[278,613,175.4],[175,612.5,166.3],[275,612.3,176.1],[97,610.8,168.5],[96,610.9,171.7],[255,224.7,172.8],[53,615,178.6],[153,615.2,178.8],[164,615.7,172.6],[207,526.2,174.5],[141,509.1,172.7],[273,552.1,180.7],[13,480.9,171.7],[271,607.1,181.1],[274,602.3,183],[68,601.4,172.1],[240,598.4,175.8],[268,596.5,176.3],[267,597,176.5],[84,589.4,176.7],[138,521.8,180.5],[242,520.5,182.9],[156,193.6,182],[49,590.5,183.1],[27,250,190.2],[133,521.8,193.2],[137,523.9,191.7],[140,535,197.6],[152,530.2,200.9],[5,294.1,253],[80,255.4,271.1],[146,415.6,270.9],[10,265.5,273],[-1,411.7,125],[-2,411.9,135.7],[-3,394.3,142.8],[-4,406.5,139.5],[-5,226.6,143],[-6,650,156.3],[-7,237,149.1],[-8,391.9,140],[-9,539.7,131.1]];
const IAEA = ["Штаб-квартира МАГАТЭ — Венский международный центр","Лаборатории МАГАТЭ в Зайберсдорфе","Лаборатории морской среды МАГАТЭ, Монако","Международный центр теоретической физики им. Абдуса Салама, Триест (с ЮНЕСКО)","Региональное бюро МАГАТЭ по гарантиям, Торонто","Региональное бюро МАГАТЭ по гарантиям, Токио","Бюро связи МАГАТЭ, Нью-Йорк","Бюро связи МАГАТЭ, Женева","Банк низкообогащённого урана МАГАТЭ, Усть-Каменогорск"];
const CRU = {"AE":"ОАЭ","AM":"Армения","AR":"Аргентина","AT":"Австрия","BD":"Бангладеш","BE":"Бельгия","BG":"Болгария","BR":"Бразилия","BY":"Беларусь","CA":"Канада","CH":"Швейцария","CN":"Китай","CZ":"Чехия","DE":"Германия","EG":"Египет","ES":"Испания","FI":"Финляндия","FR":"Франция","GB":"Великобритания","HU":"Венгрия","ID":"Индонезия","IN":"Индия","IR":"Иран","IT":"Италия","JP":"Япония","KR":"Республика Корея","KZ":"Казахстан","LT":"Литва","MX":"Мексика","NL":"Нидерланды","PK":"Пакистан","RO":"Румыния","RU":"Россия","SE":"Швеция","SI":"Словения","SK":"Словакия","TR":"Турция","TW":"Тайвань","UA":"Украина","US":"США","ZA":"ЮАР"};
const SRU = {"op":"работает","uc":"строится","pl":"планируется","sd":"остановлен","so":"работа приостановлена","sc":"стройка приостановлена","cc":"стройка отменена","dc":"выведен, демонтирован","nc":"не введён","un":"нет данных"};
const pins = new Map([...svg.querySelectorAll("[data-site]")].map((g) => [+g.dataset.site, g]));
const posts = [...svg.querySelectorAll("[data-iaea]")];
const cursor = svg.querySelector("[data-cursor]");
const info = root.querySelector("[data-map-info]");
let filter = "all", hot = null, pinned = null;
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const isShown = (id) => {
  if (id < 0) return filter === "all" || filter === "iaea";
  const st = pins.get(id).dataset.st;
  if (filter === "all") return true;
  if (filter === "sd") return ["sd", "so", "dc", "cc", "nc", "sc", "un"].includes(st);
  return st === filter;
};
function applyFilter() {
  pins.forEach((g, id) => (g.style.display = isShown(id) ? "" : "none"));
  posts.forEach((g) => (g.style.display = isShown(-1) ? "" : "none"));
  root.querySelectorAll("[data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
}
function show(id) {
  if (hot === id) return;
  if (hot !== null && hot >= 0) pins.get(hot).removeAttribute("data-hot");
  if (hot !== null && hot < 0) posts[-1 - hot].removeAttribute("data-hot");
  hot = id;
  if (id === null) { cursor.setAttribute("cx", -20); return; }
  const h = HIT.find((x) => x[0] === id);
  cursor.setAttribute("cx", h[1]); cursor.setAttribute("cy", h[2]);
  if (id < 0) {
    posts[-1 - id].setAttribute("data-hot", "");
    info.innerHTML = "<b>" + esc(IAEA[-1 - id]) + "</b><span>Объект МАГАТЭ</span>";
    say(IAEA[-1 - id]);
    return;
  }
  pins.get(id).setAttribute("data-hot", "");
  const [name, c, units] = SITES[id];
  const op = units.filter((u) => u[1] === "op");
  const cap = op.reduce((a, u) => a + (u[3] || 0), 0);
  say(name + " · " + (CRU[c] || c) + " · блоков " + units.length + (op.length ? " · работают " + op.length + " (" + cap + " МВт)" : ""));
  info.innerHTML = "<b>" + esc(name) + " <small>" + esc(CRU[c] || c) + "</small></b><ul>" + units.map((u) => "<li><span class='dot' data-st='" + u[1] + "'></span>" + esc(u[0]) + " — " + esc(SRU[u[1]] || u[1]) + (u[2] ? ", " + esc(u[2]) : "") + (u[3] ? ", " + u[3] + " МВт" : "") + "</li>").join("") + "</ul>";
}
function nearest(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  let best = null, bd = 64;
  for (const [id, x, y] of HIT) { if (!isShown(id)) continue; const d = (x - p.x) ** 2 + (y - p.y) ** 2; if (d < bd) { bd = d; best = id; } }
  return best;
}
stage.addEventListener("pointermove", (e) => { if (pinned === null) show(nearest(e)); });
stage.addEventListener("pointerdown", (e) => { const id = nearest(e); pinned = id; show(id); });
stage.addEventListener("pointerleave", () => { if (pinned === null) show(null); });
root.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; pinned = null; show(null); applyFilter(); }));
window.addEventListener("map:country", (e) => {
  const c = e.detail;
  pins.forEach((g) => g.toggleAttribute("data-dim", c && g.dataset.c !== c));
  root.scrollIntoView({ behavior: "smooth", block: "center" });
});
// Start on the IAEA headquarters.
show(-1);

  },
  "leubank": function (root) {

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

const P = {"origin":[335.735575861155,247.836072256176],"scale":1.7441461831629133,"azimuth":36,"elevation":34};
const SLOTS = [[-64,-22,8],[-54.4,-22,8],[-44.8,-22,8],[-35.2,-22,8],[-25.6,-22,8],[-16,-22,8],[-6.400000000000006,-22,8],[3.200000000000003,-22,8],[12.799999999999997,-22,8],[22.39999999999999,-22,8],[-64,4,8],[-54.4,4,8],[-44.8,4,8],[-35.2,4,8],[-25.6,4,8],[-16,4,8],[-6.400000000000006,4,8],[3.200000000000003,4,8],[12.799999999999997,4,8],[22.39999999999999,4,8],[-64,30,8],[-54.4,30,8],[-44.8,30,8],[-35.2,30,8],[-25.6,30,8],[-16,30,8],[-6.400000000000006,30,8],[3.200000000000003,30,8],[12.799999999999997,30,8],[22.39999999999999,30,8],[-59.2,-22,14.649999999999999],[-49.6,-22,14.649999999999999],[-40,-22,14.649999999999999],[-30.400000000000002,-22,14.649999999999999],[-20.8,-22,14.649999999999999],[-11.2,-22,14.649999999999999],[-1.6000000000000059,-22,14.649999999999999],[8.000000000000004,-22,14.649999999999999],[17.599999999999998,-22,14.649999999999999],[27.199999999999992,-22,14.649999999999999],[-59.2,4,14.649999999999999],[-49.6,4,14.649999999999999],[-40,4,14.649999999999999],[-30.400000000000002,4,14.649999999999999],[-20.8,4,14.649999999999999],[-11.2,4,14.649999999999999],[-1.6000000000000059,4,14.649999999999999],[8.000000000000004,4,14.649999999999999],[17.599999999999998,4,14.649999999999999],[27.199999999999992,4,14.649999999999999],[-59.2,30,14.649999999999999],[-49.6,30,14.649999999999999],[-40,30,14.649999999999999],[-30.400000000000002,30,14.649999999999999],[-20.8,30,14.649999999999999],[-11.2,30,14.649999999999999],[-1.6000000000000059,30,14.649999999999999],[8.000000000000004,30,14.649999999999999],[17.599999999999998,30,14.649999999999999],[27.199999999999992,30,14.649999999999999]];
const BAY = [92,30], CRANE_Z = 46;
const cyl = []; svg.querySelectorAll("[data-cyl]").forEach((g) => (cyl[+g.dataset.cyl] = g));
const host = svg.querySelector('[data-part="cylinders"]');
const bridge = svg.querySelector("[data-bridge]"), trolley = svg.querySelector("[data-trolley]"), hook = svg.querySelector("[data-hook]"), rope = svg.querySelector("[data-rope]");
let left = SLOTS.length, job = null, cx = 0, cy = 0, cz = CRANE_Z - 6, touring = true, clock = 0;
const order = [...SLOTS.keys()].sort((a, b) => SLOTS[b][2] - SLOTS[a][2] || SLOTS[b][1] - SLOTS[a][1] || SLOTS[b][0] - SLOTS[a][0]);
const gone = new Set();
const go = (v, t, dt, speed) => v + Math.max(-speed * dt, Math.min(speed * dt, t - v));
function release() {
  if (job || left === 0) return;
  const i = order.find((j) => !gone.has(j));
  const [x, y, z] = SLOTS[i];
  job = { i, phase: 0, x, y, z, steps: [[x, y, CRANE_Z - 6], [x, y, z + 3.8], "grab", [x, y, CRANE_Z - 14], [BAY[0], BAY[1], CRANE_Z - 14], [BAY[0], BAY[1], 12], "drop", [BAY[0], BAY[1], CRANE_Z - 6]] };
}
function refill() { if (job) return; gone.clear(); left = SLOTS.length; cyl.forEach((g, i) => { g.style.display = ""; g.querySelector("[data-body]").removeAttribute("transform"); g.removeAttribute("transform"); }); }
const run = loop((dt, calm) => {
  if (touring && !job) { clock += dt; if (clock > 2.5) { clock = 0; if (left > 52) release(); else refill(); } }
  if (job) {
    const step = job.steps[job.phase];
    if (step === "grab") { host.appendChild(cyl[job.i]); job.carry = true; job.phase++; }
    else if (step === "drop") { cyl[job.i].style.display = "none"; gone.add(job.i); left--; job.carry = false; job.phase++; }
    else if (!step) job = null;
    else {
      const sp = calm ? 1e9 : 30;
      cx = go(cx, step[0], dt, sp); cy = go(cy, step[1], dt, sp); cz = go(cz, step[2], dt, sp * 0.6);
      if (cx === step[0] && cy === step[1] && cz === step[2]) job.phase++;
    }
    if (job && job.carry) {
      const [x, y, z] = SLOTS[job.i];
      cyl[job.i].setAttribute("transform", translateAlong(P, [cx - x, cy - y, cz - 3.8 - z]));
    }
  }
  bridge.setAttribute("transform", translateAlong(P, [cx, 0, 0]));
  trolley.setAttribute("transform", translateAlong(P, [0, cy, 0]));
  hook.setAttribute("transform", translateAlong(P, [0, 0, cz]));
  rope.setAttribute("d", segment([0, 0, CRANE_Z + 3], [0, 0, cz + 3], P));
  say("цилиндров 30B в банке: " + left + " из " + SLOTS.length + (job ? " · кран: отгрузка по запросу государства-члена" : "") + " · НОУ 4,95 % ²³⁵U в форме UF₆");
  return true;
});
root.querySelector("[data-release]").addEventListener("click", () => { touring = false; release(); run(); });
root.querySelector("[data-refill]").addEventListener("click", () => { touring = false; refill(); run(); });

  },
  "pile": function (root) {

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

const P = {"origin":[275.9775082613837,236.8290638331109],"scale":1.4143575376369304,"azimuth":34,"elevation":28};
const ROD_Z = 60, ROD_OUT = 96, R_AT = 63.98;
const BETA = 0.0065, LAMBDA = 0.001, LAM = 0.08, SPEED = 10;
const DIAL = [136,59], BOX = {"x":120,"y":44,"w":50,"d":30,"r":3};
const rodG = svg.querySelector("[data-rod]");
const needle = svg.querySelector("[data-needle]");
const trace = svg.querySelector("[data-trace]");
const needleAt = (P, x, y, z, r, share, { span = Math.PI * 1.5, from = -Math.PI * 0.75 } = {}) => {
  const a = from + span * share;
  return lineOnTop([x - Math.sin(a) * 2.6, y + Math.cos(a) * 2.6], [x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3)], z + 0.2, P);
};
const rhoOf = (f) => 0.0006 - 0.004 * (1 - f);
const SRC = 0.0034 / LAMBDA; // n = 1 with the strip fully in
let f = 0, target = 0, n = 1, C = BETA / (LAMBDA * LAM), drawn = -1, zip = false, hist = [], tclock = 0, touring = true, clock = 0, idle = 0;
const tour = [0, 0.3, 0.55, 0.75, 0.85, 1, 1];
function drawRod() {
  if (Math.abs(f - drawn) < 0.0008) return; drawn = f;
  const x0 = R_AT - 2, x1 = R_AT + 8 + ROD_OUT * f;
  rodG.innerHTML = solidSvg(slabOf({ x: x0, y: -2.5, w: x1 - x0, d: 5, r: 0.4 }, ROD_Z - 0.8, 1.6, P, 2, 0), { tone: "hi", lit: true }) +
    solidSvg(slabOf({ x: x1, y: -4, w: 3, d: 8, r: 0.6 }, ROD_Z - 2, 4, P, 2, 0), { tone: "mid" });
}
const run = loop((dt, calm) => {
  if (touring && !zip) { clock += dt; target = tour[Math.min(tour.length - 1, Math.floor(clock / 5))]; if (clock > 60) { clock = 0; n = 1; C = BETA / (LAMBDA * LAM); } }
  const v = zip ? 2 : 0.12;
  f += clamp(target - f, -v * dt, v * dt);
  const rho = rhoOf(f);
  const sub = 40, h = dt * SPEED / sub, before = n;
  for (let i = 0; i < sub; i++) {
    n = (n + h * (LAM * C + SRC)) / (1 - h * (rho - BETA) / LAMBDA);
    C = (C + h * (BETA / LAMBDA) * n) / (1 + h * LAM);
  }
  if (n > 300 && !zip) { zip = true; target = 0; touring = false; }
  drawRod();
  const counts = 5 * n;
  const share = clamp(Math.log10(counts) / 4, 0, 1);
  needle.setAttribute("d", needleAt(P, DIAL[0], DIAL[1], 19.6, 11, share, { span: Math.PI * 1.4, from: -Math.PI * 0.7 }));
  tclock += dt; if (tclock > 0.25) { tclock = 0; hist.push(share); if (hist.length > 40) hist.shift(); }
  const pts = hist.map((s, i) => iso([BOX.x + 33 + (i / 40) * 12, BOX.y + 24 - s * 18, 24.1], P));
  trace.setAttribute("d", pts.length > 1 ? "M" + pts.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L") : "");
  const rate = (n - before) / (dt * SPEED) / n;
  const T = Math.abs(rate) < 1e-4 ? "∞" : (rate > 0 ? "+" : "−") + fmt(Math.abs(1 / rate), 0) + " с";
  const kk = 1 / (1 - rho);
  say((zip ? "сброс «Zip» · " : "") + "планка выдвинута на " + fmt(f * 100, 0) + " % · k = " + kk.toFixed(4).replace(".", ",") + " · " + fmt(counts, 0) + " имп/с · T = " + T + " · время ×10");
  return true;
});
const manual = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { if (!zip) { touring = !still.matches; clock = 0; } }, 20000); run(); };
root.querySelector("[data-step]").addEventListener("click", () => { zip = false; target = Math.min(1, Math.round((target + 0.15) * 20) / 20); manual(); });
root.querySelector("[data-zip]").addEventListener("click", () => { zip = true; target = 0; manual(); });
stage.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { zip = false; target = Math.min(1, target + 0.05); } else if (e.key === "ArrowLeft") target = Math.max(0, target - 0.05); else return; e.preventDefault(); manual(); });
if (still.matches) touring = false;
drawRod();

  },
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
  "barriers": function (root) {

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

const P = {"origin":[310,470.40331562594696],"scale":1.0037230686294538,"azimuth":40,"elevation":28};
const B = [{"id":"pellets","name":"Топливная матрица","holds":"удерживает большую часть продуктов деления в кристаллической решётке UO₂"},{"id":"cladding","name":"Оболочка твэла","holds":"герметичная трубка из циркониевого сплава удерживает газообразные и летучие продукты деления"},{"id":"vessel","name":"Граница первого контура","holds":"корпус реактора и трубопроводы держат теплоноситель под давлением 15,7 МПа"},{"id":"containment","name":"Защитная оболочка","holds":"железобетонный контаймент с металлической облицовкой удерживает выбросы даже при разрыве контура"}];
const LIFT = {"cladding":47,"vessel":118,"containment":262};
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

  },
  "dose": function (root) {

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

const P = {"origin":[258.85243376663,68.7921132365595],"scale":1.209006850207047,"azimuth":28,"elevation":34};
const G0 = 0.0927, A = 1000, PB = 0.07691148990827339, R0 = 50, R1 = 300;
const meter = svg.querySelector("[data-meter]");
const screen = svg.querySelector("[data-screen]");
const needle = svg.querySelector("[data-needle]");
const btn = root.querySelector("[data-pb]");
const min = root.querySelector("[data-min]"), minOut = root.querySelector("[data-min-out]");
const needleAt = (P, x, y, z, r, share, { span = Math.PI * 1.5, from = -Math.PI * 0.75 } = {}) => {
  const a = from + span * share;
  return lineOnTop([x - Math.sin(a) * 2.6, y + Math.cos(a) * 2.6], [x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3)], z + 0.2, P);
};
let x = 100, target = 100, pb = false, s = 1, touring = true, clock = 0, idle = 0, shownN = 0.5;
const tour = [50, 100, 200, 300, 100, 70];
const run = loop((dt, calm) => {
  if (touring) { clock += dt; target = tour[Math.floor(clock / 2.6) % tour.length]; }
  x = calm ? target : x + (target - x) * (1 - Math.exp(-dt / 0.35));
  s = calm ? (pb ? 0 : 1) : s + ((pb ? 0 : 1) - s) * (1 - Math.exp(-dt / 0.25));
  meter.setAttribute("transform", translateAlong(P, [x, 0, 0]));
  screen.setAttribute("transform", translateAlong(P, [0, 44 * s, 0]));
  const r = x / 100;
  const rate = G0 * A / (r * r) * (pb ? PB : 1);
  const share = Math.max(0, Math.min(1, (Math.log10(rate) + 1) / 4)); // 0,1 … 1000 мкЗв/ч
  shownN = calm ? share : shownN + (share - shownN) * (1 - Math.exp(-dt / 0.2));
  needle.setAttribute("d", needleAt(P, 0, 1, 30.4, 7.4, shownN, { span: Math.PI, from: -Math.PI / 2 }));
  const t = +min.value;
  const dose = rate * t / 60;
  say("r = " + fmt(r, 2) + " м · Ḣ ≈ " + (rate >= 10 ? fmt(rate, 0) : fmt(rate, 1)) + " мкЗв/ч · за " + t + " мин ≈ " + (dose >= 10 ? fmt(dose, 0) : fmt(dose, 1)) + " мкЗв" + (pb ? " · за экраном" : ""));
  return touring || Math.abs(target - x) > 0.05 || Math.abs((pb ? 0 : 1) - s) > 0.002;
});
const manual = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 6000); run(); };
stage.addEventListener("pointermove", (e) => { target = R0 + clamp((shareX(e) - 0.15) / 0.8, 0, 1) * (R1 - R0); manual(); });
stage.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") target = Math.min(R1, target + 25); else if (e.key === "ArrowLeft") target = Math.max(R0, target - 25); else return; e.preventDefault(); manual(); });
btn.addEventListener("click", () => { pb = !pb; btn.setAttribute("aria-pressed", String(pb)); manual(); });
min.addEventListener("input", () => { minOut.textContent = min.value + " мин"; run(); });
if (still.matches) touring = false;

  },
  "cask": function (root) {

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

const P = {"origin":[310,354.6625149468314],"scale":1.3483280070096324,"azimuth":40,"elevation":32};
const HEAT = [[1,10],[5,2.6],[10,1.6],[30,1],[50,0.75],[100,0.4],[300,0.15],[1000,0.07]];
const N = 13, TU = 0.43, LIFT = 70;
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

  },
  "tokamak": function (root) {

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

  },
  "isl": function (root) {

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

const P = {"origin":[330,308.5089484526214],"scale":1.3006341184530963,"azimuth":40,"elevation":32};
const INJ = [[88.66009467376819,48.86560619984019],[66.65220714787367,69.25317316227043],[37.9921124741055,60.38756696243024],[31.33990532623182,31.13439380015982],[53.34779285212631,10.746826837729582],[82.0078875258945,19.61243303756976]], PROD = [60,40], Z = 34.4;
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

  },
};
document.querySelectorAll("[data-fig]").forEach((root) => { try { FIGURES[root.dataset.fig]?.(root); } catch (e) { console.error(root.dataset.fig, e); } });
})();
