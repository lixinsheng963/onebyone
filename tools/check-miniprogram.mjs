import fs from 'node:fs';
import path from 'node:path';
const root = 'apps/miniprogram';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else files.push(p);
  }
})(root);
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const allowed = new Set(['chooseAddress','chooseLocation','choosePoi','getFuzzyLocation','getLocation','onLocationChange','startLocationUpdate','startLocationUpdateBackground']);
const issues = [];
for (const x of app.requiredPrivateInfos || []) if (!allowed.has(x)) issues.push(`app.json invalid requiredPrivateInfos: ${x}`);
for (const p of app.pages) for (const ext of ['.js','.json','.wxml']) if (!fs.existsSync(path.join(root, p + ext))) issues.push(`missing page file: ${p + ext}`);
for (const t of app.tabBar.list) for (const i of [t.iconPath, t.selectedIconPath]) if (i && !fs.existsSync(path.join(root, i))) issues.push(`missing tab icon: ${i}`);
for (const f of files.filter((x) => x.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { issues.push(`invalid JSON ${f}: ${e.message}`); }
}
const handlerRe = /(?:bind|catch)(?::)?[a-zA-Z-]+\s*=\s*"([A-Za-z_$][\w$]*)"/g;
for (const wxml of files.filter((x) => x.endsWith('.wxml'))) {
  const js = wxml.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(js)) { issues.push(`no JS for ${wxml}`); continue; }
  const code = fs.readFileSync(js, 'utf8');
  const markup = fs.readFileSync(wxml, 'utf8');
  for (const m of markup.matchAll(handlerRe)) {
    const name = m[1];
    const re = new RegExp(`(?:^|[\\s,{])(?:async\\s+)?${name}\\s*(?:\\(|:)`, 'm');
    if (!re.test(code)) issues.push(`missing handler ${name} for ${wxml}`);
  }
}
for (const f of files.filter((x) => x.endsWith('.wxml'))) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/["'(](\/assets\/[^"')]+\.(?:png|jpg|jpeg|webp|svg))/g)) {
    if (!fs.existsSync(path.join(root, m[1]))) issues.push(`missing asset ${m[1]} in ${f}`);
  }
}
for (const f of files.filter((x) => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [name, comp] of Object.entries(j.usingComponents || {})) {
    if (typeof comp !== 'string') continue;
    const base = comp.startsWith('/') ? path.join(root, comp.slice(1)) : path.join(path.dirname(f), comp);
    for (const ext of ['.js','.json','.wxml']) if (!fs.existsSync(base + ext)) issues.push(`missing component ${comp} (${ext}) used by ${f}`);
  }
}
console.log(JSON.stringify({ pages: app.pages.length, wxml: files.filter((x) => x.endsWith('.wxml')).length, js: files.filter((x) => x.endsWith('.js')).length, issues }, null, 2));
if (issues.length) process.exitCode = 1;
