# 🌍 Immer online: https://oeodl.github.io/SeriousCasino/

So läuft das Casino rund um die Uhr unter einem github.io-Link – kostenlos:

- **GitHub Pages** zeigt die Seite (den github.io-Link).
- **Render** (kostenlos) ist der Spiel-Server im Hintergrund.
- **Neon** (kostenlos) ist die Datenbank, in der Profile und Guthaben dauerhaft gespeichert werden.

Deine Freunde brauchen **nur den Link** – kein Konto. Passwörter sind Pflicht.

> ⏳ Gratis-Server schlafen nach 15 Minuten ohne Besucher ein. Der erste Aufruf danach dauert bis zu **1 Minute**; die Seite zeigt dann „Der Server wacht auf …“ und lädt von selbst weiter.

Die Einrichtung machst du **einmal** (ca. 15 Minuten). Danach geht jede Änderung, die auf GitHub hochgeladen wird, automatisch online.

---

## Schritt 1: Repository öffentlich machen

GitHub Pages ist beim kostenlosen Konto nur für öffentliche Repositories verfügbar.
Öffentlich wird nur der **Code** – Spielstände, Passwörter und das Admin-Passwort stehen nicht darin.

1. https://github.com/oeodl/SeriousCasino → **Settings** (oben rechts im Repository)
2. Ganz unten **Danger Zone** → **Change repository visibility** → **Change to public** → bestätigen.

## Schritt 2: GitHub Pages einschalten

1. Im Repository **Settings** → links **Pages**
2. Bei **Build and deployment → Source** die Option **GitHub Actions** wählen.
3. Oben im Repository auf **Actions** → links **„Seite auf GitHub Pages veröffentlichen“** → rechts **Run workflow** → **Run workflow**.
4. Nach ca. 1 Minute ist die Seite unter **https://oeodl.github.io/SeriousCasino/** erreichbar (sie funktioniert aber erst nach Schritt 3 und 4).

## Schritt 3: Kostenlose Datenbank bei Neon

1. https://neon.com → **Sign up** (am einfachsten **„Continue with GitHub“**).
2. Neues Projekt anlegen: Name z. B. `casino`, Region **Europe (Frankfurt)**, Postgres-Version egal → **Create**.
3. Auf dem Dashboard **Connect** klicken und den **Connection string** kopieren.
   Er sieht so aus: `postgresql://…:…@ep-…eu-central-1.aws.neon.tech/neondb?sslmode=require`
   **Geheim halten** – darin steckt das Datenbank-Passwort. Gleich bei Render einfügen.

## Schritt 4: Kostenloser Server bei Render

1. https://render.com → **Get Started** → **„GitHub“** zum Anmelden wählen und Render Zugriff auf das Repository **SeriousCasino** erlauben.
2. Oben **New +** → **Blueprint** → Repository **oeodl/SeriousCasino** auswählen → **Connect**.
3. Render liest die Datei `render.yaml` und fragt zwei geheime Werte ab:
   - **DATABASE_URL**: den Connection string von Neon einfügen.
   - **CASINO_ADMIN_PASSWORD**: dein Admin-Passwort für den Admin-Bereich (mind. 6 Zeichen, nur du kennst es).
4. **Apply** klicken. Nach 2–5 Minuten steht der Dienst auf **„Live“**.
5. Oben auf der Seite des Dienstes steht seine Adresse. **Wenn sie nicht genau `https://seriouscasino.onrender.com` lautet** (Name war schon vergeben), sag Bescheid – dann muss in `public/js/config.js` die Adresse angepasst werden.

## Schritt 5: Spielen!

Öffne **https://oeodl.github.io/SeriousCasino/**, leg ein Profil mit Passwort an und schick den Link an deine Freunde.

Admin-Bereich: **Einstellungen → Admin-Bereich öffnen** → mit dem Admin-Passwort aus Schritt 4 anmelden.

---

## Gut zu wissen

- **Kosten:** Render gibt 750 Gratis-Stunden pro Monat (reicht für rund um die Uhr), Neon 1 GB Speicher (reicht für tausende Spieler). Beide verlangen für den Gratis-Tarif keine Bezahlung.
- **Admin-Passwort ändern:** Render → dein Dienst → **Environment** → `CASINO_ADMIN_PASSWORD` ändern → speichern (der Server startet kurz neu).
- **Die Spielstände online** sind getrennt von denen auf deinem PC und im Codespace.
- Die Gratis-Bedingungen der Anbieter können sich ändern; Stand November 2026.
- Dein PC muss für diese Variante **nicht** laufen.
