// Skin-Bilder im Counter-Strike-Stil: Waffen-Silhouetten als SVG, eingefärbt je nach Skin.
import { esc, fmt } from './ui.js';

// Silhouetten (viewBox 0 0 120 60), grob nach CS-Vorbild
const SHAPES = {
  pistol: 'M14 18h62l4-3h8v3h6v8H70l-2 3H48l-6 22H28l5-22h-5l-2-3H14z',
  smg: 'M6 20h70l3-4h14v4h14v7H86l-3 5h-8l2 12h-9l-3-12H58l-4 14H44l3-14H30l-8 9H6l6-12H6z',
  rifle: 'M2 22h20l6-3h52l3-4h10v4h25v5H90l-4 4h-8l-6 6 4 14h-9l-6-14h-5l-3 8h-8l2-8H46l-5 10H31l4-10H26L12 38H2l6-10H2z',
  sniper: 'M2 24h18l8-3h40l2-6h22l2 6h24v4H94l-4 3h-6l-8 4 2 10h-8l-5-10H52l-4 8h-8l3-8H28L14 38H2l6-10H2z',
  shotgun: 'M4 22h24l4-2h66l2 2h16v5H98l-2 3H64l-2 6H52l1-6H34l-14 8H6l6-10H4z',
  knife: 'M8 30c18-14 50-20 80-18l12-4c-4 8-10 13-18 15L46 32l-8 4H20l-6 6H6l4-8z M84 23l6 1',
  gloves: 'M30 54V28c0-4 2-6 5-6V10c0-3 5-3 5 0v10h2V7c0-3 5-3 5 0v13h2V9c0-3 5-3 5 0v13h2V13c0-3 5-3 5 0v20l7-7c3-2 6 1 4 4L60 46v8z',
};

/** SVG-Bild eines Skins: Silhouette mit Farbverlauf + Muster im Farbton des Skins */
export function skinArt(it) {
  const h = Number(it.hue) || 0;
  const id = `g${it.kind}${h}${it.i ?? ''}`;
  const shape = SHAPES[it.kind] || SHAPES.rifle;
  return `<svg class="skin-art" viewBox="0 0 120 60" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${h} 85% 66%)"/><stop offset=".55" stop-color="hsl(${(h + 40) % 360} 70% 45%)"/><stop offset="1" stop-color="hsl(${(h + 80) % 360} 75% 30%)"/>
      </linearGradient>
      <pattern id="${id}p" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(${h % 90})">
        <rect width="10" height="10" fill="url(#${id})"/><rect width="4" height="10" fill="hsl(${(h + 180) % 360} 70% 55% / .35)"/>
      </pattern>
    </defs>
    <path d="${shape}" fill="url(#${id}p)" stroke="rgba(0,0,0,.55)" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`;
}

/** Skin-Karte (Case-Inhalt, Walze, Inventar) */
export function skinCard(it, rarities, cls = '', extra = '') {
  const r = rarities[it.rarity] || { color: '#888', name: '' };
  const st = it.st ? '<span class="skin-st">StatTrak™</span>' : '';
  const wear = it.wear ? `<span class="skin-wear" title="${esc(it.wearName || '')} · Float ${Number(it.float).toFixed(4)}">${esc(it.wear)}</span>` : '';
  return `<div class="skin ${cls}" style="--rc:${r.color}" ${extra}>
    <div class="skin-top">${st}${wear}</div>
    ${skinArt(it)}
    <span class="skin-name">${esc(it.weapon)}</span><span class="skin-finish">${esc(it.finish)}</span><span class="skin-val">${fmt(it.value)}</span></div>`;
}

/** Case-Kiste im CS-Stil (SVG), eingefärbt in der Case-Farbe */
export function caseArt(color) {
  return `<svg class="case-art" viewBox="0 0 100 70" aria-hidden="true">
    <path d="M10 22 50 8l40 14v32L50 66 10 54z" fill="${color}" stroke="rgba(0,0,0,.5)" stroke-width="1.5"/>
    <path d="M10 22 50 36l40-14M50 36v30" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
    <path d="M10 22 50 8l40 14-40 14z" fill="rgba(255,255,255,.18)"/>
    <rect x="40" y="40" width="20" height="10" rx="2" fill="rgba(0,0,0,.35)"/>
    <path d="M18 30v18M82 30v18" stroke="rgba(255,255,255,.25)" stroke-width="3"/>
  </svg>`;
}
