// Adresse des Casino-Servers, wenn die Seite über GitHub Pages (…github.io) geöffnet wird.
// Falls dein Render-Dienst einen anderen Namen bekommen hat, hier die Adresse anpassen
// (zu finden oben auf der Render-Seite deines Dienstes, endet auf .onrender.com).
const RENDER_SERVER = 'https://seriouscasino.onrender.com';

// Auf github.io: Server bei Render benutzen. Überall sonst (PC, Heimnetz, Codespaces, Render selbst):
// derselbe Server, von dem die Seite kommt.
// Wird beim Veröffentlichen auf GitHub Pages durch die Versionsnummer ersetzt (scripts/stamp-version.js)
export const BUILD = '__CASINO_VERSION__';

export const API_BASE = location.hostname.endsWith('.github.io') ? RENDER_SERVER.replace(/\/$/, '') : '';
