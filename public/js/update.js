// Erkennt, wenn eine neue Version des Casinos veröffentlicht wurde (nur auf github.io),
// und bietet das Neuladen an – sonst spielen Leute mit offenem Fenster ewig mit der alten Version.
import { BUILD } from './config.js';

const CHECK_MS = 90 * 1000;
let shown = false;

async function latest() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).version || null;
  } catch { return null; }
}

// In der Lobby oder auf Übersichtsseiten kann man gefahrlos sofort neu laden
const safeToReload = () => /^#?\/?(|cat.*|search.*|favorites|recent|stats|leaderboard.*|vip|settings.*)$/.test(location.hash.replace(/^#/, '').replace(/^\//, '')) || location.hash === '' || location.hash === '#/';

function banner() {
  if (shown) return;
  shown = true;
  const el = document.createElement('div');
  el.className = 'update-banner';
  el.innerHTML = '<span>🔄 Es gibt eine neue Version des Casinos.</span><button class="btn btn-gold btn-sm">Jetzt neu laden</button>';
  el.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(el);
}

async function check() {
  const v = await latest();
  if (!v || v === BUILD) return;
  if (document.visibilityState === 'hidden' || safeToReload()) location.reload();
  else banner();
}

export function initUpdateCheck() {
  if (BUILD.startsWith('__')) return; // lokal/Render-Server: kein Versions-Stempel, nichts zu tun
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
