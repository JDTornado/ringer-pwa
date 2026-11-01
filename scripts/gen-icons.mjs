// Generates the app icons from one horseshoe drawing.
//   node scripts/gen-icons.mjs   (npm run icons)
// Writes public/favicon.svg, public/icon.svg, and the PNGs the manifest and
// iOS need. Rendering uses Playwright's Chromium (already a dev dependency),
// so no image library is needed. Re-run after changing the drawing; commit
// the outputs.
//
// Colors mirror tokens.css (icons can't read CSS variables):
//   --team-a #053961, --color-bg #f2f2f3.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const TEAM_A = '#053961';
const BG = '#f2f2f3';
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

/**
 * The horseshoe, drawn on a 512x512 canvas, open end up. A thick U, squared
 * heels, and six nail holes cut out with a mask so it works on any background.
 */
const HORSESHOE = `
  <defs>
    <mask id="holes">
      <rect width="512" height="512" fill="#fff"/>
      <g fill="#000">
        <circle cx="156" cy="170" r="11"/><circle cx="156" cy="240" r="11"/>
        <circle cx="356" cy="170" r="11"/><circle cx="356" cy="240" r="11"/>
        <circle cx="185" cy="361" r="11"/><circle cx="327" cy="361" r="11"/>
      </g>
    </mask>
  </defs>
  <g fill="${TEAM_A}" mask="url(#holes)">
    <path d="M156 116 V290 A100 100 0 0 0 356 290 V116" fill="none"
          stroke="${TEAM_A}" stroke-width="68"/>
    <rect x="110" y="84" width="92" height="40" rx="9"/>
    <rect x="310" y="84" width="92" height="40" rx="9"/>
  </g>`;

/**
 * @param {object} o
 * @param {boolean} o.background  fill the canvas with BG
 * @param {number} o.scale         drawing scale around the center (1 = full)
 * @param {number} [o.radius]      background corner radius (0 = square)
 */
function svg({ background, scale, radius = 0 }) {
  const t = (1 - scale) * 256;
  const bg = background ? `<rect width="512" height="512" rx="${radius}" fill="${BG}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}<g transform="translate(${t} ${t}) scale(${scale})">${HORSESHOE}</g></svg>`;
}

const outputs = [
  // Plain icons: rounded light tile, horseshoe filling most of it.
  { file: 'pwa-192.png', size: 192, svg: svg({ background: true, scale: 0.86, radius: 96 }) },
  { file: 'pwa-512.png', size: 512, svg: svg({ background: true, scale: 0.86, radius: 96 }) },
  // Maskable: full-bleed background; drawing kept inside the 80% safe circle.
  { file: 'pwa-maskable-512.png', size: 512, svg: svg({ background: true, scale: 0.62 }) },
  // iOS: opaque square (iOS rounds the corners itself; transparency turns black).
  { file: 'apple-touch-icon.png', size: 180, svg: svg({ background: true, scale: 0.8 }) },
];

await writeFile(`${publicDir}favicon.svg`, svg({ background: false, scale: 1 }));
await writeFile(`${publicDir}icon.svg`, svg({ background: true, scale: 0.86, radius: 96 }));

const browser = await chromium.launch();
try {
  for (const o of outputs) {
    const page = await browser.newPage({ viewport: { width: o.size, height: o.size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${o.svg.replace('<svg ', `<svg width="${o.size}" height="${o.size}" `)}</body></html>`,
    );
    await page.screenshot({ path: `${publicDir}${o.file}`, omitBackground: true });
    await page.close();
    console.log(`wrote public/${o.file}`);
  }
} finally {
  await browser.close();
}
