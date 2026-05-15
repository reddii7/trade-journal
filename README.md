# TradeJournal — IG Index Trading Journal

A professional, self-hosted trading journal application for IG Index traders. Built with React, TypeScript, Mantine UI, Supabase, and Netlify Functions.

---

## Features

- **Dashboard** — Equity curve, daily P&L heatmap, win rate, profit factor, R-multiple, streaks
- **Trade Log** — Sortable/filterable data grid, manual entry, CSV import from IG, API sync
- **Analytics** — Performance by symbol, day-of-week analysis, hourly analysis, stop-loss vs actual move, monthly reports
- **Calendar** — Interactive calendar with daily P&L heatmap, click-to-view trades, daily journal notes
- **Psychology Center** — Log emotional state, discipline/focus/confidence scoring, rule compliance tracking, emotion vs P&L analysis
- **Settings** — IG API connection management, journal management, profile & risk defaults

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| UI | Mantine UI v7 |
| Charts | Recharts |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| API Functions | Netlify Functions |
| Hosting | Netlify |

---

## Setup Guide

### Step 1 — Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL editor, run the entire contents of `supabase/migrations/001_initial_schema.sql`
3. Under **Project Settings → API**, copy:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon` public key → `VITE_SUPABASE_ANON_KEY`
4. Under **Authentication → URL Configuration**, add your Netlify URL to "Site URL" and "Redirect URLs"
5. Optional: Create a storage bucket called `trade-screenshots` (uncomment the storage section in the migration)

### Step 2 — IG Index API Key

1. Log in to your IG account
2. Go to **MyIG → Settings → IG Labs API** (or visit [labs.ig.com](https://labs.ig.com))
3. Create an API application and note your API key
4. You'll need: `IG_API_KEY`, `IG_USERNAME` (email), `IG_PASSWORD`

### Step 3 — Local Development

```bash
# Clone and install
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your Supabase credentials
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# For local Netlify functions (requires Netlify CLI)
# Install: npm install -g netlify-cli
# Add IG credentials to .env:
# IG_API_KEY=xxx
# IG_USERNAME=xxx
# IG_PASSWORD=xxx

# Start development server
npm run dev
# OR with Netlify functions:
netlify dev
```

### Step 4 — Deploy to Netlify

1. Push your code to GitHub
2. Connect the repo to [Netlify](https://netlify.com)
3. Configure build settings (auto-detected from `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Under **Site settings → Environment variables**, add:

   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
   | `IG_API_KEY` | Your IG API key |
   | `IG_USERNAME` | Your IG account email |
   | `IG_PASSWORD` | Your IG account password |

5. Deploy!

> **Security:** IG credentials are only used inside Netlify Functions (server-side). They are never exposed to the browser.

---

## Importing Trades from IG Index

### Method 1: CSV Import (Recommended for history)

1. Log in to IG Index
2. Go to **History → Transaction History**
3. Export as CSV
4. In the app, go to **Trade Log → Import CSV**
5. Drop the file and click Import

The CSV format expected:
```
TextDate, Summary, MarketName, Period, ProfitAndLoss, Transaction type, Reference,
Open level, Close level, Size, Currency, PL Amount, Cash transaction,
DateUtc, OpenDateUtc, CurrencyIsoCode
```

### Method 2: API Sync

1. Configure your IG credentials in **Settings → IG Index API**
2. Click **Test Connection**
3. Once connected, use the **Sync** button in the header to import recent transactions

---

## Database Schema

| Table | Purpose |
|---|---|
| `profiles` | User settings, IG connection status, risk defaults |
| `accounts` | IG broker accounts (synced from API) |
| `journals` | Multiple journal groupings per user |
| `instruments` | Reference table for IG instruments/EPICs |
| `trades` | Core trade data with full P&L tracking |
| `trade_tags` | Custom tags (FOMO, Breakout, etc.) |
| `trade_tag_associations` | Many-to-many: trades ↔ tags |
| `trade_screenshots` | Chart screenshot URLs per trade |
| `daily_notes` | Pre/post session journal entries |
| `psych_logs` | Emotional state & discipline tracking |
| `trading_rules` | Configurable pre-trade checklist |
| `rule_compliance` | Per-trade rule adherence tracking |

All tables use **Row Level Security (RLS)** — users can only access their own data.

---

## Project Structure

```
trade_journal/
├── netlify/
│   └── functions/
│       └── ig-service.ts       # IG Index API proxy (Netlify Function)
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   └── AppShell.tsx    # Navigation, sync button
│   │   └── trades/
│   │       ├── TradeFormModal.tsx  # Manual trade entry form
│   │       └── CSVImportModal.tsx  # IG CSV import
│   ├── contexts/
│   │   └── AuthContext.tsx     # Supabase auth state
│   ├── hooks/
│   │   ├── useTrades.ts        # Trade data fetching + stats
│   │   └── useJournals.ts      # Journal + tag management
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   └── igService.ts        # IG API + CSV parser
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── TradeLog.tsx
│   │   ├── Analytics.tsx
│   │   ├── CalendarView.tsx
│   │   ├── Psychology.tsx
│   │   ├── Settings.tsx
│   │   └── AuthPage.tsx
│   └── types/
│       └── database.ts         # TypeScript types for all tables
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.example
├── netlify.toml
└── vite.config.ts
```
