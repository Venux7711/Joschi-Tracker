# 🐱 Joschi Tracker

Gesundheitstracker für Joschi – eine Langhaarkatze mit wiederkehrendem Durchfall.

Ermöglicht das einfache Erfassen von Futter und Befinden direkt vom Handy, um Muster zwischen Futtersorten und Verdauungsproblemen zu erkennen.

## Features

- **Dashboard** – Tagesüberblick mit 7-Tage-Kalender
- **Futter eintragen** – Marke, Sorte, Menge, Uhrzeit mit Autovervollständigung
- **Befinden eintragen** – Stuhlgang, Erbrochen, Appetit, Aktivität, Fell-Problem
- **Verlauf** – 30-Tage-Tabelle mit farblicher Markierung bei Durchfall
- **Nur Eingeladene** – kein öffentlicher Signup, Auth via Supabase

## Tech Stack

- **Next.js 14** (App Router)
- **Supabase** (Auth + PostgreSQL)
- **Tailwind CSS**
- **TypeScript**

---

## Setup

### 1. Repository klonen

```bash
git clone <repo-url>
cd joschi-tracker
```

### 2. Dependencies installieren

```bash
npm install
```

### 3. Umgebungsvariablen setzen

```bash
cp .env.local.example .env.local
```

Dann `.env.local` ausfüllen:

```
NEXT_PUBLIC_SUPABASE_URL=https://ixxmxzwkuassekwumyth.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dein-anon-key
```

Den Anon-Key findest du im Supabase Dashboard unter **Project Settings → API**.

### 4. Datenbank einrichten

Im [Supabase SQL Editor](https://supabase.com/dashboard/project/ixxmxzwkuassekwumyth/sql) den Inhalt von `supabase/migrations/001_initial.sql` ausführen.

Das legt folgende Tabellen an:
- `cats` – Joschi und zukünftige Katzen
- `feeding_logs` – Futtereinträge
- `health_logs` – Befinden-Einträge

### 5. Supabase Auth konfigurieren

Im Supabase Dashboard unter **Authentication → Settings**:
- **Sign Up** deaktivieren (nur eingeladene User)
- Oder unter **Authentication → Users** direkt User einladen

User anlegen: Supabase Dashboard → Authentication → Users → **Invite user**

### 6. Entwicklungsserver starten

```bash
npm run dev
```

App läuft unter [http://localhost:3000](http://localhost:3000)

---

## Deployment (Vercel)

```bash
npm run build
```

Oder direkt auf Vercel deployen und die Umgebungsvariablen im Vercel-Dashboard setzen.

---

## Projektstruktur

```
joschi-tracker/
├── app/
│   ├── dashboard/page.tsx     # Hauptseite nach Login
│   ├── feeding/new/page.tsx   # Futter eintragen
│   ├── health/new/page.tsx    # Befinden eintragen
│   ├── history/page.tsx       # 30-Tage-Verlauf
│   ├── login/page.tsx         # Login
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── Header.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # Browser-Client
│   │   └── server.ts          # Server-Client
│   ├── types.ts               # TypeScript-Typen
│   └── utils.ts               # Hilfsfunktionen
├── middleware.ts               # Auth-Schutz aller Routen
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
└── .env.local                  # Nicht ins Git!
```

---

## Joschi wird automatisch angelegt

Beim ersten Dashboard-Besuch nach dem Login legt die App automatisch einen Eintrag für Joschi in der `cats`-Tabelle an. Kein manueller Schritt nötig.
