// Modified for the nongkode/gitstudio fork: this file is new.
// Builds the fork's .vsix with the version yy.mdd.hmm (Bangkok time, e.g.
// 26.1015.1251). The version is always above the Marketplace GitStudio, so VS
// Code never "updates" the fork to the Marketplace build. The stamp is undone
// in apps/extension/package.json afterwards (the committed version stays as
// upstream's).
// Usage, from the repo root, after
//   npm ci --ignore-scripts -w apps/extension --include-workspace-root
// run:
//   node scripts/fork-pack.js [outdir]      (default outdir: apps/extension)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ext = path.join(__dirname, '..', 'apps', 'extension');
const pkgFile = path.join(ext, 'package.json');
const outDir = path.resolve(process.argv[2] || ext);

const now = new Date(Date.now() + 7 * 3600 * 1000);   // Bangkok = UTC+7
const p2 = n => String(n).padStart(2, '0');
const version = [now.getUTCFullYear() % 100, `${now.getUTCMonth() + 1}${p2(now.getUTCDate())}`,
  `${now.getUTCHours()}${p2(now.getUTCMinutes())}`].map(Number).join('.');

const original = fs.readFileSync(pkgFile, 'utf8');
fs.writeFileSync(pkgFile, original.replace(/"version": "[^"]*"/, `"version": "${version}"`));
try {
  const run = cmd => execSync(cmd, { cwd: ext, stdio: 'inherit' });
  fs.mkdirSync(outDir, { recursive: true });
  const vsix = path.join(outDir, `gitstudio-${version}.vsix`);
  run('npm run check-types');
  run('npm run package');
  run(`npx --yes @vscode/vsce package --no-dependencies -o "${vsix}"`);
  console.log(vsix);
} finally {
  fs.writeFileSync(pkgFile, original);
}
