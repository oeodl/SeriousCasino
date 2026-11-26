// Wird beim Veröffentlichen auf GitHub Pages ausgeführt (nicht lokal):
// hängt an alle eigenen JS/CSS-Adressen "?v=<Version>" an, damit Browser nach einem Update
// garantiert die neuen Dateien laden, und schreibt version.json für die Update-Erkennung.
//   node scripts/stamp-version.js public <version>
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const version = String(process.argv[3] || Date.now()).slice(0, 12);
if (!dir || !fs.existsSync(dir)) { console.error('Ordner fehlt'); process.exit(1); }

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(dir);

let changed = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  if (f.endsWith('.js')) {
    // import … from './x.js' · import('./x.js') · import(`./games/${id}.js`)
    s = s.replace(/(['"`])(\.{1,2}\/[^'"`\n]+?\.js)\1/g, (m, q, p) => `${q}${p}?v=${version}${q}`);
    s = s.replace(/__CASINO_VERSION__/g, version);
  } else if (f.endsWith('index.html')) {
    s = s.replace(/(href|src)="((?:css|js)\/[^"?]+\.(?:css|js))"/g, (m, a, p) => `${a}="${p}?v=${version}"`);
  }
  if (s !== before) { fs.writeFileSync(f, s); changed++; }
}
fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ version }));
console.log(`Version ${version}: ${changed} Dateien gestempelt`);
