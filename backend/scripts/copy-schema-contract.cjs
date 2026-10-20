const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = [
  ['../supabase/schema-contract.json', 'dist/schema-contract.json'],
  ['src/database/ncm/ncm.json', 'dist/database/ncm/ncm.json'],
];

for (const [source, destination] of assets) {
  const target = path.join(root, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.resolve(root, source), target);
}
