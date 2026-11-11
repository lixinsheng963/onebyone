import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'miniprogram');
const voidTags = new Set(['image', 'input', 'textarea', 'switch', 'slider', 'progress', 'icon', 'checkbox', 'radio', 'picker-view', 'import', 'include', 'wxs']);
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.wxml')) files.push(full);
  }
}
walk(root);

let failed = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const tags = [...source.matchAll(/<(\/?)([A-Za-z][\w-]*)([^>]*)>/g)];
  for (const match of tags) {
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    const rest = match[3] || '';
    if (voidTags.has(tag) || rest.trimEnd().endsWith('/')) continue;
    if (closing) {
      const top = stack.pop();
      if (top !== tag) {
        console.log(`${relative(root, file)}: expected </${top}> but got </${tag}>`);
        failed++;
        break;
      }
    } else {
      stack.push(tag);
    }
  }
  if (stack.length) {
    console.log(`${relative(root, file)}: unclosed ${stack.join(', ')}`);
    failed++;
  }
}
if (!failed) console.log(`WXML tag balance OK (${files.length} files)`);
process.exit(failed ? 1 : 0);
