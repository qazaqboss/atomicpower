// Builds one figure into a standalone test page: node scripts/figtest.mjs binding [light]
import { writeFileSync } from "node:fs";
import * as k from "../kit/iso-kit.mjs";
import { readFileSync } from "node:fs";
const name = process.argv[2];
const theme = process.argv[3] || "dark";
const mod = await import(`../figures/${name}.mjs`);
const f = mod.build();
const kit = readFileSync(new URL("../kit/iso-kit.mjs", import.meta.url), "utf8").replace(/^export /gm, "");
const script = kit + `\n(function(root){${f.live}})(document.querySelector('[data-fig="${f.name}"]'));`;
const out = process.argv[4] || `/tmp/claude-0/-home-user-atomicpower/de75e2ce-a076-5bcf-b942-65fee72af5ef/scratchpad/${name}-${theme}.html`;
writeFileSync(out, k.pageHtml({ title: name, theme, body: f.html, script, width: 760 }));
console.log("wrote", out);
