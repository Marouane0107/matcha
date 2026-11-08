import { execFileSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collectJsFiles(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = ['src', 'db'].flatMap((d) => collectJsFiles(resolve(backendRoot, d)));
let failed = false;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    console.error(`Syntax error in ${file}:\n${err.stderr || err.message}`);
  }
}

if (failed) process.exit(1);
console.log(`Syntax OK — ${files.length} files checked.`);
