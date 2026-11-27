# 🎰 Spaß-Casino

Ein privates Casino **nur mit Spielgeld** für dich und deine Freunde.
Läuft ausschließlich auf deinem eigenen PC – kein echtes Geld, keine Zahlungen, kein Internet nötig, nichts wird veröffentlicht.

---

## Starten

1. Doppelklick auf **`start.bat`**
2. Ein schwarzes Fenster öffnet sich und kurz danach dein Browser mit dem Casino.
3. Beim ersten Mal einen Namen eingeben → du bekommst **10.000 Chips**.

**Wichtig:** Das schwarze Fenster offen lassen, solange du spielst.
**Beenden:** Einfach das schwarze Fenster schließen.

Falls sich der Browser nicht von selbst öffnet: Diese Adresse in den Browser eintippen:
**http://127.0.0.1:3000**

## Installation

Nichts zu tun. Alles Nötige liegt schon im Ordner (auch eine eigene Node.js-Version im Unterordner `node`).
Du kannst den ganzen Ordner an einen beliebigen Ort verschieben (z. B. auf den Desktop) – `start.bat` funktioniert überall.

> Falls der Unterordner `node` fehlt: Node.js (LTS) von https://nodejs.org installieren. `start.bat` nutzt dann automatisch diese Version.
> Falls der Ordner `node_modules` fehlt, lädt `start.bat` ihn beim ersten Start einmalig aus dem Internet nach.

### Von GitHub herunterladen (für Freunde)

Im GitHub-Repository fehlen absichtlich die große Node.js-Version, `node_modules` und die Spielstände.

1. **Node.js (LTS)** von https://nodejs.org installieren (einmalig).
2. Auf GitHub: grüner Knopf **„Code“** → **„Download ZIP“**, ZIP entpacken.
3. Im entpackten Ordner Doppelklick auf **`start.bat`**. Beim ersten Start werden die Bausteine einmalig aus dem Internet geladen, danach läuft alles offline.

Jeder, der es so herunterlädt, hat sein **eigenes** Casino mit eigenen Profilen.

## Guthaben & Boni

| Was | Wie viel | Wann |
|---|---|---|
| Startguthaben | 10.000 Chips | pro neuem Profil |
| Tagesbonus | +1.000 Chips | 1× pro Kalendertag (Knopf oben im Banner) |
| Nachfüllen | +5.000 Chips | wenn du unter 100 Chips hast, max. 1× pro Stunde |

Jedes Profil (nur ein Name, kein Passwort) hat sein eigenes Guthaben. Profil wechseln: oben rechts auf den Namen/Buchstaben klicken.

## 🟢 Live- & Multiplayer-Spiele

- **Live** (Menü): wer gerade online ist und in welchem Spiel – mit „Dazu“-Knopf – plus ein Feed mit großen Gewinnen (ab 10× Einsatz und 1.000 Chips).
- **Live-Crash**: eine gemeinsame Rakete für alle. 8 Sekunden Wettphase, dann steigt sie – alle sehen live, wer setzt und wer aussteigt.
- **Live-Roulette**: ein Rad für alle. 15 Sekunden setzen (auch mehrmals nachlegen), dann dreht sich die Kugel für alle gleichzeitig.
- **Jackpot**: Alle zahlen in einen Topf. Ab 2 Spielern läuft ein 30-Sekunden-Countdown, dann zieht das Rad den Gewinner – je mehr du eingezahlt hast, desto größer deine Chance auf den ganzen Topf.
- **Blackjack-Tisch**: bis zu 5 Spieler gegen denselben Dealer. Nach dem ersten Einsatz 15 Sekunden Wettphase, zeigt der Dealer ein Ass, kann sich jeder 10 Sekunden lang versichern. Dann ist jeder der Reihe nach dran (20 Sekunden pro Hand, sonst wird automatisch gehalten). Blackjack zahlt 3:2, Teilen bis 4 Hände, Verdoppeln.
- **Texas Hold'em**: echtes Poker gegeneinander, bis zu 6 am Tisch. Du kaufst dich mit 1.000–20.000 Chips ein, Blinds 25/50, No-Limit. Ab 2 Spielern geht's los; 25 Sekunden pro Zug. Beim Aufstehen gehen deine Tisch-Chips zurück aufs Konto. Das Casino nimmt nichts.
- **Cases** (Menü): Cases im Counter-Strike-Stil öffnen, von 100 Chips bis zu den **High-Roller-Cases** (bis 10 Mio.). Jeder Skin hat einen Zustand (Fabrikneu bis Kampfspuren) und mit etwas Glück StatTrak™, beides beeinflusst den Wert. Gezogene Skins landen im **Inventar** und können dort einzeln oder alle auf einmal verkauft werden. Oder **Case Battles** mit 2–4 Spielern. Alle öffnen dieselben Cases, der höchste Gesamtwert gewinnt alle Skins (als Chips). Leere Plätze lassen sich mit Bots füllen (gewinnt ein Bot, geht der Topf ans Haus). Die Skins sind frei erfunden; Auszahlungsquote ≈ 92 %.
- **Admin**: Im Admin-Bereich siehst du, wer online ist, und kannst Live-Crash steuern („Jetzt crashen“, „Diese/nächste Runde crasht bei …“). Die Spieler sehen davon nichts.

## ⚔️ Duelle – 1 gegen 1

Im Menü **Duelle** forderst du andere Spieler heraus – oder schreibst ein offenes Duell aus, das jeder annehmen darf.
Beide setzen gleich viel (ab 10 Chips), der Gewinner bekommt den **ganzen Topf** – das Casino nimmt nichts.

| Duell | So geht's |
|---|---|
| ⚡ Reaktionstest | 3 Runden: klicken, sobald das Feld grün wird. Kleinste Gesamtzeit gewinnt (zu früh = 1000 ms Strafe). |
| 🧮 Kopfrechnen | 30 Sekunden lang Aufgaben lösen – wer mehr richtig hat, gewinnt. |
| 🔴 Vier gewinnt | Abwechselnd Steine einwerfen, wer zuerst 4 in einer Reihe hat, gewinnt. 2 Minuten pro Zug. |
| ✌️ Schere-Stein-Papier | Best of 5 – wer zuerst 3 Runden gewinnt. 2 Minuten pro Runde. |
| 🪙 Münzwurf | Kopf oder Zahl – sofort entschieden, 50 : 50. |
| 🎲 Würfelduell | Beide würfeln mit zwei Würfeln, die höhere Summe gewinnt (bei Gleichstand nochmal). |
| 👆 Speed-Klicker | 10 Sekunden so schnell wie möglich klicken. |
| ❓ Quiz | 8 Wissensfragen, je 15 Sekunden – mehr richtige Antworten gewinnen. |

- Neue Herausforderungen erscheinen als Hinweis und als Zahl am Menüpunkt **Duelle**.
- Unbeantwortete Herausforderungen verfallen nach 15 Minuten, Ablehnen/Zurückziehen gibt den Einsatz zurück.
- Wer nicht weiterspielt, verliert nach Ablauf der Zeit. Unentschieden = Einsatz zurück.
- Reaktionstest und Kopfrechnen spielt jeder für sich (nacheinander oder gleichzeitig); der Zweite hat dafür bis zu 10 Minuten Zeit.

## ⭐ Stufen, Aufgaben, Chat & Benachrichtigungen

- **VIP & Aufgaben** (Menü): Mit jedem Einsatz sammelst du Erfahrung und steigst Stufen auf (Bronze bis Legende) – jeder Aufstieg bringt Chips. Dazu gibt es täglich neue Aufgaben und Erfolge mit Belohnungen.
- **Rangliste**: gesamt und als **Wochen-Rangliste** (die besten 3 der Woche bekommen 25.000 / 10.000 / 5.000 Chips). Über die Rangliste kannst du anderen Chips **schenken**.
- **Chat**: Sprechblase oben rechts – ein gemeinsamer Chat für alle.
- **Benachrichtigungen** (Einstellungen → 🔔): Bekomme eine Meldung aufs Handy oder den PC, wenn dich jemand zum Duell herausfordert, deine Herausforderung angenommen wird oder dir jemand Chips schenkt – auch wenn das Casino zu ist. Funktioniert im Browser am PC und unter Android direkt; auf dem **iPhone** musst du das Casino zuerst über *Teilen → Zum Home-Bildschirm* hinzufügen und von dort öffnen. Im Heimnetz-Modus (ohne https) geht es leider nicht.

## 🛠️ Admin-Bereich (Chips verteilen)

Unter **Einstellungen → Admin-Bereich öffnen** kannst du jedem Spieler Chips **geben (+)**, **abziehen (−)** oder das Guthaben **genau setzen (=)**. Außerdem: Profil zurücksetzen, vergessenes Passwort neu vergeben, Spieler löschen. Änderungen erscheinen im Verlauf des Spielers als „Admin“.

Der Bereich ist mit einem eigenen **Admin-Passwort** geschützt (mind. 6 Zeichen):
- **Am PC:** Beim ersten Öffnen des Admin-Bereichs direkt am PC legst du es fest – oder per Doppelklick auf **`admin-passwort.bat`** (auch zum Ändern).
- **Im Codespace (online):** unten im Terminal `npm run admin` eingeben. Über die Webseite geht das online absichtlich nicht.

## Guthaben zurücksetzen

**Ein Profil zurücksetzen:** Einstellungen → **„Profil zurücksetzen“** → bestätigen.
Das Profil hat dann wieder 10.000 Chips, Statistik und Verlauf sind gelöscht.

**Alles komplett löschen** (alle Profile): Casino beenden (schwarzes Fenster schließen) und die Datei `data\db.json` löschen. Beim nächsten Start ist alles wie neu.

## Spiele

| Spiel | Kurz erklärt | Auszahlungsquote* |
|---|---|---|
| 🎰 Slots | 5 Walzen, 10 Gewinnlinien, mind. 3 gleiche von links | ≈ 96 % |
| 🃏 Blackjack | 6 Decks, Dealer zieht bis 17, Blackjack zahlt 3:2, Verdoppeln, Teilen, Versicherung (bei Ass des Dealers, zahlt 2:1) | ≈ 99 % |
| 🎡 Roulette | Europäisch (eine Null): Zahlen, Farben, Gerade/Ungerade, Dutzende, Kolonnen | 97,3 % |
| ♠️ Video Poker | Jacks or Better, 9/6-Tabelle | ≈ 99,5 % |
| 🚀 Crash | Multiplikator steigt – rechtzeitig auscashen (auch automatisch) | ≈ 99 % |
| 💣 Mines | 5×5-Feld, 1–24 Minen, jederzeit auscashen | 99 % |
| 🎯 Plinko | 8/12/16 Reihen, Risiko niedrig/mittel/hoch | ≈ 99 % |
| 🎲 Würfel | Über/unter, Gewinnchance 1–95 % frei wählbar | 99 % |
| 🔢 Keno | 1–10 Zahlen aus 40 tippen, 10 werden gezogen | ≈ 97 % |
| 🎴 Baccarat | Spieler, Bank oder Unentschieden – wer kommt näher an 9 | ≈ 98,9 % (Bank) |
| ↕️ Hi-Lo | Nächste Karte höher oder niedriger, Serie aufbauen, auscashen | 99 % pro Tipp |
| 🍀 Glücksrad | 30 Felder, Risiko niedrig/mittel/hoch | 99 % |
| 🗼 Turm | 8 Stockwerke, Fallen meiden, 4 Schwierigkeitsstufen | 99 % |
| 🎟️ Rubbellos | 9 Felder freirubbeln, 3 gleiche gewinnen bis 500× | 95 % |
| 🪙 Münzwurf | Kopf oder Zahl, jeder Treffer ×1,98 | 99 % pro Wurf |
| 📈 Limbo | Ziel-Multiplikator wählen, Ergebnis muss drüber liegen | 99 % |
| 🎲 Craps | Pass Line, Don't Pass, Field, Any 7, Any Craps | 98,6 % (Pass) |
| 🀄 Sic Bo | 3 Würfel: Klein/Groß, Summen, Einzelzahlen, Zweier, Dreier | 97,2 % (Klein/Groß) |
| 🂠 Drei-Karten-Poker | Ante/Spielen gegen den Dealer + Paar-Plus | ≈ 97–98 % |
| ⚔️ Kartenkrieg | Höhere Karte gewinnt, bei Gleichstand Krieg oder Aufgeben | ≈ 97 % |
| 🐕 Red Dog | Dritte Karte muss zwischen die ersten beiden fallen | ≈ 97 % |
| 🐉 Drache & Tiger | Eine Karte je Seite, höhere gewinnt | 96,3 % |
| 🏇 Pferderennen | 6 Pferde, Quoten nach Siegchance | ≈ 95 % |
| 🔵 Schnell-Bingo | 40 von 75 Kugeln, Gewinn nach fertigen Linien | ≈ 95 % |
| 🥤 Hütchenspiel | 3–5 Becher, finde die Kugel | 99 % |
| ✌️ Schere-Stein-Papier | Gegen das Haus, Sieg 1,97× | 99 % |

\* Langfristiger Durchschnitt wie in echten Casinos – auf Dauer gewinnt also das Haus. 😉
Alle Ergebnisse werden auf dem Server mit einem kryptografischen Zufallsgenerator (`crypto.randomInt`) erzeugt.

**🔁 Autospin:** Bei allen Sofort-Spielen (Slots, Roulette, Würfel, Plinko, Limbo, Keno, Glücksrad, Rubbellos, Sic Bo, Drache & Tiger, Baccarat, Bingo, Pferderennen) gibt es unter dem Spiel-Knopf „Autospin“: Anzahl Runden wählen (oder ∞), optional „Stopp bei Gewinn ab“ / „Stopp bei Verlust ab“ – dann spielt das Casino Runde für Runde mit deinem aktuellen Einsatz, bis du stoppst oder ein Limit erreicht ist.

**Tastenkürzel:** Leertaste = Drehen/Würfeln/Start · Blackjack: H, S, D, P (Versicherung: Y/N) · Video Poker: 1–5 zum Halten · Hi-Lo: ↑ ↓ →.

## Mit Freunden spielen

**Am selben PC:** Jeder legt sein eigenes Profil an und wechselt oben rechts. Die **Rangliste** zeigt, wer vorne liegt.

**Immer online unter https://oeodl.github.io/SeriousCasino/ (GitHub Pages + Render + Neon, kostenlos):** siehe **[IMMER-ONLINE.md](IMMER-ONLINE.md)** – einmal einrichten, danach läuft es rund um die Uhr, auch wenn dein PC aus ist.

**Übers Internet, nur bei Bedarf (GitHub Codespaces):** siehe **[ONLINE-SPIELEN.md](ONLINE-SPIELEN.md)** – kostenlos, Freunde brauchen nur einen Link. Dort sind Passwörter Pflicht.

**Profil-Passwort:** In den Einstellungen kann jedes Profil ein Passwort bekommen (lokal optional). Mit „Abmelden“ meldest du dich auf dem Gerät ab.

**Mit eigenen Handys/Laptops im selben WLAN (Heimnetz-Modus):**

1. Falls das Casino schon läuft: schwarzes Fenster schließen.
2. Doppelklick auf **`start-heimnetz.bat`** (statt `start.bat`).
3. Beim **ersten Mal** fragt Windows nach der Firewall → Haken bei **„Private Netzwerke“** setzen und **Zugriff zulassen**. (Öffentliche Netzwerke nicht nötig.)
4. Im schwarzen Fenster und in der App unter **Einstellungen** bzw. **Rangliste** steht die Adresse für deine Freunde, z. B. `http://192.168.178.20:3000`.
5. Freunde tippen diese Adresse im Browser ihres Handys/Laptops ein und legen ihr Profil an. Guthaben, Statistik und Rangliste liegen alle bei dir auf dem PC.

Gut zu wissen:
- Alle müssen im **selben WLAN** sein. Wechselt dein PC das WLAN, ändert sich die Adresse – die App zeigt immer die aktuelle an.
- Profile haben **kein Passwort** – unter Freunden im Heimnetz kein Problem, aber jeder könnte jedes Profil wählen.
- Aus dem Internet ist das Casino auch im Heimnetz-Modus **nicht** erreichbar: Der Server nimmt nur Verbindungen von Geräten aus dem lokalen Netz an.
- `start.bat` funktioniert weiter wie bisher: dann nur auf diesem PC.
- Falls die Firewall-Frage versehentlich abgelehnt wurde: Windows-Suche → „Eine App durch die Windows-Firewall zulassen“ → `node.exe` aus dem Ordner `casino\node` für „Privat“ erlauben.

## Häufige Probleme

- **„Port 3000 ist schon belegt“** – Das Casino läuft wahrscheinlich schon in einem anderen schwarzen Fenster. Dieses benutzen oder schließen und neu starten.
- **Seite lädt nicht** – Prüfen, ob das schwarze Fenster noch offen ist.
- **Kein Ton** – Oben auf den Lautsprecher 🔊 klicken (manche Browser spielen Ton erst nach dem ersten Klick ab).

## Für Technik-Interessierte

```
casino/
├─ start.bat            Startskript
├─ node/                mitgelieferte Node.js-Version
├─ server/
│  ├─ index.js          Express-Server (nur 127.0.0.1:3000)
│  ├─ db.js             Speichern in data/db.json
│  ├─ profiles.js       Profile, Guthaben, Bonus, Statistik
│  ├─ util.js           Zufall, Einsatzprüfung, Kartendecks
│  └─ games/            Spiellogik (eine Datei pro Spiel)
├─ public/              Oberfläche (HTML/CSS/JavaScript, ohne Build-Schritt)
└─ data/db.json         alle Profile (wird automatisch angelegt)
```

Manuell starten: `node server/index.js` (ohne `--open` öffnet sich kein Browser).
