// Autospin für Sofort-Spiele: drückt den Spiel-Knopf automatisch Runde für Runde –
// mit Rundenzahl sowie Stopp bei Gewinn/Verlust. Funktioniert für jedes Spiel mit einem
// Haupt-Knopf (.btn-big), der während einer Runde gesperrt ist.
import { h, fmt } from './ui.js';

export const AUTO_GAMES = new Set(['slots', 'roulette', 'dice', 'plinko', 'keno', 'limbo', 'wheel', 'scratch', 'sicbo', 'dragontiger', 'baccarat', 'bingo', 'horses']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };

/**
 * Wickelt ctx.post ein, damit Autospin mitbekommt, wann eine Runde beim Server angekommen ist.
 * Gibt { ctx, attach } zurück: ctx an das Spiel geben, attach(root) nach dem Aufbau aufrufen.
 */
export function withAutoplay(gameId, baseCtx) {
  let lastResponse = null, lastError = null, seq = 0;
  const ctx = {
    ...baseCtx,
    async post(url, body) {
      try {
        const r = await baseCtx.post(url, body);
        if (url.startsWith(`/api/games/${gameId}/`) && r && typeof r.balance === 'number') { lastResponse = r; seq++; }
        return r;
      } catch (e) {
        if (url.startsWith(`/api/games/${gameId}/`)) { lastError = e; seq++; }
        throw e;
      }
    },
  };

  function attach(root) {
    const controls = root.querySelector('.game-controls');
    const mainBtn = controls?.querySelector('.btn-big');
    if (!controls || !mainBtn) return () => {};
    const key = `casino.auto.${gameId}`;
    const box = h(`<details class="auto-box">
      <summary>🔁 Autospin</summary>
      <div class="auto-grid">
        <label class="lbl">Runden
          <select class="input auto-n">${[10, 25, 50, 100, 250, 0].map((n) => `<option value="${n}">${n || '∞ (bis Stopp)'}</option>`).join('')}</select></label>
        <label class="lbl">Stopp bei Gewinn ab
          <input class="input auto-win" type="number" min="0" step="1" placeholder="aus"></label>
        <label class="lbl">Stopp bei Verlust ab
          <input class="input auto-loss" type="number" min="0" step="1" placeholder="aus"></label>
      </div>
      <button class="btn btn-green auto-btn" type="button">▶ Autospin starten</button>
      <div class="auto-status muted"></div>
    </details>`);
    mainBtn.insertAdjacentElement('afterend', box);
    const nEl = box.querySelector('.auto-n'), winEl = box.querySelector('.auto-win'), lossEl = box.querySelector('.auto-loss');
    const btn = box.querySelector('.auto-btn'), status = box.querySelector('.auto-status');
    try { const s = JSON.parse(load(key, '{}')); if (s.n !== undefined) nEl.value = s.n; winEl.value = s.win || ''; lossEl.value = s.loss || ''; } catch { /* egal */ }
    if (load(`${key}.open`, '') === '1') box.open = true;
    box.addEventListener('toggle', () => save(`${key}.open`, box.open ? '1' : ''));
    const remember = () => save(key, JSON.stringify({ n: nEl.value, win: winEl.value, loss: lossEl.value }));
    [nEl, winEl, lossEl].forEach((x) => x.addEventListener('change', remember));

    let running = false, alive = true;
    const paint = (text) => {
      btn.textContent = running ? '■ Autospin stoppen' : '▶ Autospin starten';
      btn.className = `btn auto-btn ${running ? 'btn-red' : 'btn-green'}`;
      box.classList.toggle('running', running);
      if (text !== undefined) status.innerHTML = text;
    };

    async function waitRound(startSeq) {
      // 1) Antwort vom Server abwarten (startet die Runde gar nicht, z. B. keine Einsätze → abbrechen)
      for (let t = 0; seq === startSeq; t += 50) {
        if (!alive || !running) return 'stopped';
        if (t > 4000) return 'nostart';
        await sleep(50);
      }
      if (lastError && seq === startSeq + 1 && !lastResponse) return 'error';
      // 2) Animation abwarten: bis der Knopf wieder frei ist
      for (let t = 0; mainBtn.disabled; t += 50) {
        if (!alive) return 'stopped';
        if (t > 60000) return 'stuck';
        await sleep(50);
      }
      return 'ok';
    }

    async function run() {
      running = true;
      remember();
      const total = Number(nEl.value) || 0;
      const stopWin = Number(winEl.value) || 0, stopLoss = Number(lossEl.value) || 0;
      const startBal = baseCtx.getBalance();
      let done = 0, reason = '';
      paint('Läuft …');
      while (running && alive) {
        // Knopf gesperrt? Kurz warten (z. B. Animation von vorher) – bleibt er gesperrt, fehlt etwas (Einsatz/Auswahl)
        for (let t = 0; mainBtn.disabled && t < 8000 && running && alive; t += 100) await sleep(100);
        if (!running || !alive) break;
        if (mainBtn.disabled) { reason = 'Runde kann nicht starten – Einsatz bzw. Auswahl fehlt?'; break; }
        const before = seq;
        lastError = null; lastResponse = null;
        mainBtn.click();
        const r = await waitRound(before);
        if (r === 'stopped') break;
        if (r === 'nostart') { reason = 'Runde konnte nicht starten (Einsatz gewählt?)'; break; }
        if (r === 'error') { reason = lastError?.message || 'Fehler'; break; }
        if (r === 'stuck') { reason = 'Spiel reagiert nicht'; break; }
        done++;
        const bal = lastResponse?.balance ?? baseCtx.getBalance();
        const net = bal - startBal;
        paint(`Runde <b>${done}</b>${total ? ` von ${total}` : ''} · Ergebnis <b class="${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}</b>`);
        if (total && done >= total) { reason = 'Alle Runden gespielt'; break; }
        if (stopWin && net >= stopWin) { reason = `Gewinnziel erreicht (+${fmt(net)})`; break; }
        if (stopLoss && -net >= stopLoss) { reason = `Verlustgrenze erreicht (−${fmt(-net)})`; break; }
        await sleep(gameId === 'plinko' ? 350 : 500);
      }
      running = false;
      if (alive) paint(`${done ? `${status.innerHTML}<br>` : ''}⏹ ${reason || 'Gestoppt'}`);
    }

    btn.addEventListener('click', () => { if (running) { running = false; paint(); } else run(); });
    // Leertaste/Klick auf den Spiel-Knopf stoppt Autospin nicht – nur der Stopp-Knopf
    paint('');
    return () => { alive = false; running = false; };
  }

  return { ctx, attach };
}
