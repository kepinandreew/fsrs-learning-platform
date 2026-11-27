/**
 * @file scripts/check-games-syntax.mjs
 * @description Pemeriksa sintaks otomatis (CI Static Validator) untuk seluruh blok skrip inline
 * pada keempat berkas HTML gim klien, Service Worker PWA, serta validitas JSON Web App Manifest.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const htmlFiles = [
  'learning-platform-dashboard/public/pet-battle.html',
  'learning-platform-dashboard/public/baking-chef.html',
  'pet-battle-game/index.html',
  'baking-chef-game/index.html',
];

const jsFiles = [
  'learning-platform-dashboard/public/sw-games.js',
  'pet-battle-game/sw-games.js',
  'baking-chef-game/sw-games.js',
];

const jsonFiles = [
  'learning-platform-dashboard/public/manifest-pet-battle.json',
  'learning-platform-dashboard/public/manifest-baking-chef.json',
  'pet-battle-game/manifest-pet-battle.json',
  'baking-chef-game/manifest-baking-chef.json',
];

for (const rel of htmlFiles) {
  const full = path.join(repoRoot, rel);
  const html = fs.readFileSync(full, 'utf8');
  const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let count = 0;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    count += 1;
    new vm.Script(match[1], { filename: `${rel}#script-${count}` });
  }
  if (count === 0) {
    throw new Error(`Tidak ditemukan inline <script> pada ${rel}`);
  }
  console.log(`✅ HTML+JS valid: ${rel} (${count} blok skrip)`);
}

for (const rel of jsFiles) {
  const full = path.join(repoRoot, rel);
  const code = fs.readFileSync(full, 'utf8');
  new vm.Script(code, { filename: rel });
  console.log(`✅ Service Worker valid: ${rel}`);
}

for (const rel of jsonFiles) {
  const full = path.join(repoRoot, rel);
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!parsed.name || !parsed.start_url || !Array.isArray(parsed.icons) || parsed.icons.length === 0) {
    throw new Error(`Manifest PWA belum lengkap: ${rel}`);
  }
  console.log(`✅ Manifest PWA valid: ${rel}`);
}
