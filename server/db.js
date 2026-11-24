// Speichert alle Daten.
// - Standard: lokale JSON-Datei (data/db.json)
// - Cloud (Umgebungsvariable DATABASE_URL gesetzt, z. B. kostenlose Neon-Datenbank): als ein JSON-Dokument in PostgreSQL.
//   Kostenlose Server (Render) verlieren ihre Dateien bei jedem Neustart – deshalb dort die Datenbank.
const fs = require('fs');
const path = require('path');

// optional eigener Datenordner (z. B. für Tests, damit echte Spielstände unberührt bleiben)
const DATA_DIR = process.env.CASINO_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';

let data = null;

function fresh() {
  return { version: 1, profiles: {} };
}

function normalize(d) {
  if (!d || typeof d !== 'object') d = fresh();
  if (!d.profiles || typeof d.profiles !== 'object') d.profiles = {};
  repairBalances(d);
  return d;
}

/** Kaputte Guthaben (NaN/Infinity, z. B. nach einem Fehler) auf 0 setzen, statt dass sie sich weiter ausbreiten */
function repairBalances(d = data) {
  let fixed = 0;
  for (const p of Object.values(d?.profiles || {})) {
    if (p && typeof p === 'object' && !Number.isFinite(p.balance)) {
      console.warn(`Guthaben von ${p.name} war ungültig (${p.balance}) – auf 0 gesetzt.`);
      p.balance = 0;
      fixed++;
    }
  }
  return fixed;
}

// ---------- Datei ----------
const fileStore = {
  name: 'Datei',
  async read() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) return null;
    try {
      return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
      // Kaputte Datei nicht löschen, sondern beiseitelegen
      const backup = FILE.replace(/\.json$/, `.kaputt-${Date.now()}.json`);
      fs.copyFileSync(FILE, backup);
      console.warn(`db.json war beschädigt – Sicherung unter ${backup} angelegt, starte neu.`);
      return null;
    }
  },
  writeSync(json) {
    const tmp = FILE + '.tmp';
    try {
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, FILE);
    } catch (e) {
      // Fallback (z. B. wenn ein Virenscanner die Datei kurz sperrt)
      fs.writeFileSync(FILE, json);
    }
  },
};

// ---------- PostgreSQL ----------
function makePgStore(Pool, connectionString) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  // Zeitlimits: eine hängende Verbindung darf das Speichern nie dauerhaft blockieren
  const pool = new Pool({
    connectionString, ssl: local ? false : { rejectUnauthorized: true }, max: 3, idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000, query_timeout: 30000, statement_timeout: 30000,
  });
  pool.on('error', (e) => console.warn('Datenbank-Verbindung unterbrochen (wird neu aufgebaut):', e.message));
  return {
    name: 'Datenbank',
    pool,
    async read() {
      try {
        const r = await pool.query('SELECT data FROM casino_state WHERE id = 1');
        return r.rows[0]?.data ?? null;
      } catch (e) {
        if (e.code !== '42P01' && !/does not exist|not found/i.test(e.message)) throw e;
        // Erster Start: Tabelle anlegen
        await pool.query(`CREATE TABLE casino_state (
          id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        return null;
      }
    },
    async write(json) {
      await pool.query(
        `INSERT INTO casino_state (id, data, updated_at) VALUES (1, $1::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [json],
      );
    },
  };
}

let store = fileStore;
if (DATABASE_URL) {
  const { Pool } = require('pg');
  store = makePgStore(Pool, DATABASE_URL);
}

// Schreiben in die Datenbank: nie zwei gleichzeitig, immer der neueste Stand zuletzt
let writing = null;
let pendingJson = null;
function scheduleDbWrite(json) {
  pendingJson = json;
  if (writing) return;
  writing = (async () => {
    while (pendingJson !== null) {
      const next = pendingJson;
      pendingJson = null;
      for (let attempt = 1; ; attempt++) {
        try {
          await store.write(next);
          break;
        } catch (e) {
          console.warn(`Speichern fehlgeschlagen (Versuch ${attempt}):`, e.message);
          // Datenbank nicht erreichbar: nach kurzer Pause weiter versuchen (Stand geht nicht verloren, er liegt im Speicher)
          await new Promise((r) => setTimeout(r, Math.min(10000, 1000 * attempt)));
          if (pendingJson !== null) break; // inzwischen gibt es einen neueren Stand – den speichern
        }
      }
    }
  })().finally(() => { writing = null; });
}

async function load() {
  // Die Datenbank kann beim Start kurz nicht erreichbar sein (z. B. Gratis-Datenbank wacht gerade auf) → mehrmals versuchen
  let raw;
  for (let attempt = 1; ; attempt++) {
    try { raw = await store.read(); break; } catch (e) {
      if (attempt >= 8) throw e;
      console.warn(`Laden fehlgeschlagen (Versuch ${attempt}/8), neuer Versuch gleich:`, e.message);
      await new Promise((r) => setTimeout(r, Math.min(15000, 2000 * attempt)));
    }
  }
  data = normalize(raw);
  saveNow();
  await flush();
  return data;
}

// Gespeichert wird gebündelt: höchstens alle paar hundert Millisekunden und nur, wenn sich wirklich etwas geändert hat.
// (Früher wurde bei JEDER Anfrage der komplette Stand verglichen – das hat den kleinen Gratis-Server ausgebremst.)
const SAVE_DELAY = store === fileStore ? 300 : 1000;
let lastSaved = null;
let lastSize = 0;
let saveTimer = null;
function save() {
  if (!saveTimer) saveTimer = setTimeout(saveNow, SAVE_DELAY);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  let json;
  try { json = JSON.stringify(data); } catch (e) { console.error('Spielstand konnte nicht umgewandelt werden:', e.message); return; }
  if (json === lastSaved) return;
  lastSize = json.length;
  if (store === fileStore) {
    try { fileStore.writeSync(json); } catch (e) {
      // z. B. Festplatte voll: Stand bleibt im Speicher, beim nächsten Mal erneut versuchen
      console.error('Speichern in Datei fehlgeschlagen:', e.message);
      saveTimer = setTimeout(saveNow, 5000);
      return;
    }
  } else scheduleDbWrite(json);
  lastSaved = json;
}

/** Speichert sofort und wartet, bis alles geschrieben ist (z. B. vor dem Herunterfahren) */
async function flush() {
  if (saveTimer) saveNow();
  while (writing) await writing;
}

function get() {
  return data;
}

module.exports = { savedSize: () => lastSize, load, save, flush, get, repairBalances, FILE, storeName: () => store.name, _makePgStore: makePgStore };
