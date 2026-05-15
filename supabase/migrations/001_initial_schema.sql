-- ============================================================
-- Trade Journal - Initial Schema
-- Run this in your Supabase SQL editor or via supabase db push
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'Europe/London',
  default_risk_percent NUMERIC(5,2) DEFAULT 1.0,
  default_account_size NUMERIC(15,2) DEFAULT 10000.0,
  ig_account_type TEXT DEFAULT 'DEMO' CHECK (ig_account_type IN ('DEMO', 'LIVE')),
  ig_connected BOOLEAN DEFAULT FALSE,
  ig_account_id TEXT,
  currency TEXT DEFAULT 'GBP',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ACCOUNTS (IG broker accounts)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_account_id TEXT NOT NULL,
  account_name TEXT,
  account_type TEXT CHECK (account_type IN ('SPREADBET', 'CFD', 'PHYSICAL', 'DEMO')),
  currency TEXT DEFAULT 'GBP',
  balance NUMERIC(15,2) DEFAULT 0,
  available NUMERIC(15,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ig_account_id)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own accounts" ON public.accounts
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- JOURNALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.journals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#228be6',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own journals" ON public.journals
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INSTRUMENTS (reference table for tradeable instruments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.instruments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  epic TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_class TEXT CHECK (asset_class IN (
    'CURRENCIES', 'SHARES', 'INDICES', 'COMMODITIES',
    'CRYPTOCURRENCIES', 'BONDS', 'OPTIONS', 'OTHER'
  )) DEFAULT 'OTHER',
  market_name TEXT,
  currency TEXT DEFAULT 'GBP',
  lot_size NUMERIC(15,4) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, epic)
);

ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own instruments" ON public.instruments
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TRADE TAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#228be6',
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.trade_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tags" ON public.trade_tags
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TRADES (core table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,

  -- Core trade data
  symbol TEXT NOT NULL,
  market_name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),

  -- Prices
  entry_price NUMERIC(20,8),
  exit_price NUMERIC(20,8),
  stop_loss NUMERIC(20,8),
  take_profit NUMERIC(20,8),
  actual_stop_hit NUMERIC(20,8),
  actual_tp_hit NUMERIC(20,8),

  -- Size & P&L
  position_size NUMERIC(20,8),
  realized_pnl NUMERIC(15,4) DEFAULT 0,
  commission NUMERIC(15,4) DEFAULT 0,
  fees NUMERIC(15,4) DEFAULT 0,
  -- net_pnl is computed at query time: realized_pnl - commission - fees
  -- (avoids immutability constraint on generated columns)
  net_pnl NUMERIC(15,4),

  -- Risk management
  risk_amount NUMERIC(15,4),
  risk_percent NUMERIC(8,4),
  r_multiple NUMERIC(10,4),
  reward_risk_ratio NUMERIC(10,4),

  -- Timing
  entry_date TIMESTAMPTZ,
  exit_date TIMESTAMPTZ,
  -- duration_minutes and day_of_week are stored as plain columns,
  -- computed and written by the application on upsert
  duration_minutes INTEGER,
  day_of_week SMALLINT,

  -- Session context
  session TEXT CHECK (session IN ('LONDON', 'NEW_YORK', 'ASIAN', 'OVERLAP', 'OTHER')),

  -- Trade notes
  notes TEXT,
  setup_description TEXT,

  -- IG Index sync metadata
  ig_deal_id TEXT,
  ig_deal_reference TEXT,
  ig_transaction_id TEXT,
  ig_order_type TEXT,
  ig_period TEXT,
  imported_from TEXT DEFAULT 'MANUAL' CHECK (imported_from IN ('IG_API', 'CSV', 'MANUAL')),
  raw_ig_data JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_journal_id ON public.trades(journal_id);
CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON public.trades(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON public.trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status ON public.trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_ig_deal_id ON public.trades(ig_deal_id);
CREATE INDEX IF NOT EXISTS idx_trades_ig_transaction_id ON public.trades(ig_transaction_id);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own trades" ON public.trades
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TRADE TAG ASSOCIATIONS (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_tag_associations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.trade_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trade_id, tag_id)
);

ALTER TABLE public.trade_tag_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tag associations" ON public.trade_tag_associations
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TRADE SCREENSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_screenshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  caption TEXT,
  screenshot_type TEXT DEFAULT 'ENTRY' CHECK (screenshot_type IN ('ENTRY', 'EXIT', 'OVERVIEW', 'OTHER')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.trade_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own screenshots" ON public.trade_screenshots
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- DAILY NOTES (journal entries)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  note_date DATE NOT NULL,
  pre_session_plan TEXT,
  post_session_reflection TEXT,
  market_observations TEXT,
  lessons_learned TEXT,
  grade TEXT CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, note_date, journal_id)
);

ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own daily notes" ON public.daily_notes
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- PSYCH LOGS (psychology & emotional tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.psych_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Emotional state
  emotion TEXT CHECK (emotion IN (
    'CONFIDENT', 'CALM', 'FOCUSED',
    'NERVOUS', 'ANXIOUS', 'FEARFUL',
    'GREEDY', 'FOMO', 'REVENGE',
    'EUPHORIC', 'FRUSTRATED', 'BORED',
    'DISCIPLINED', 'IMPULSIVE', 'TIRED'
  )),

  -- Scores (1-10)
  discipline_score SMALLINT CHECK (discipline_score BETWEEN 1 AND 10),
  focus_score SMALLINT CHECK (focus_score BETWEEN 1 AND 10),
  confidence_score SMALLINT CHECK (confidence_score BETWEEN 1 AND 10),
  stress_level SMALLINT CHECK (stress_level BETWEEN 1 AND 10),

  -- Checklist adherence
  followed_rules BOOLEAN,
  rule_violations TEXT[],
  notes TEXT,

  -- When logged (before/during/after trade)
  log_phase TEXT DEFAULT 'PRE' CHECK (log_phase IN ('PRE', 'DURING', 'POST')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_psych_logs_user_id ON public.psych_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_psych_logs_log_date ON public.psych_logs(log_date DESC);

ALTER TABLE public.psych_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own psych logs" ON public.psych_logs
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TRADING RULES / CHECKLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trading_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_text TEXT NOT NULL,
  category TEXT DEFAULT 'GENERAL' CHECK (category IN (
    'ENTRY', 'EXIT', 'RISK_MANAGEMENT', 'PSYCHOLOGY',
    'GENERAL', 'PRE_TRADE', 'POST_TRADE'
  )),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.trading_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own rules" ON public.trading_rules
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- RULE COMPLIANCE LOG (tracks checklist adherence per trade)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rule_compliance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.trading_rules(id) ON DELETE CASCADE,
  complied BOOLEAN NOT NULL,
  note TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trade_id, rule_id)
);

ALTER TABLE public.rule_compliance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own compliance" ON public.rule_compliance
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- AUTO-COMPUTE net_pnl TRIGGER
-- (replaces the previously attempted generated column)
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_trade_derived_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Compute net P&L
  NEW.net_pnl := COALESCE(NEW.realized_pnl, 0)
               - COALESCE(NEW.commission, 0)
               - COALESCE(NEW.fees, 0);

  -- Compute duration in minutes
  IF NEW.entry_date IS NOT NULL AND NEW.exit_date IS NOT NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.exit_date - NEW.entry_date))::INTEGER / 60;
  END IF;

  -- Compute day of week (0=Sunday … 6=Saturday) using UTC to stay immutable
  IF NEW.entry_date IS NOT NULL THEN
    NEW.day_of_week := EXTRACT(DOW FROM NEW.entry_date AT TIME ZONE 'UTC')::SMALLINT;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compute_trade_fields
  BEFORE INSERT OR UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.compute_trade_derived_fields();

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_journals_updated_at BEFORE UPDATE ON public.journals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_notes_updated_at BEFORE UPDATE ON public.daily_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- VIEWS for analytics
-- ============================================================
CREATE OR REPLACE VIEW public.trade_stats_by_day AS
SELECT
  user_id,
  DATE(entry_date) AS trade_date,
  COUNT(*) FILTER (WHERE status = 'CLOSED') AS total_trades,
  COUNT(*) FILTER (WHERE status = 'CLOSED' AND net_pnl > 0) AS winning_trades,
  COUNT(*) FILTER (WHERE status = 'CLOSED' AND net_pnl < 0) AS losing_trades,
  SUM(net_pnl) FILTER (WHERE status = 'CLOSED') AS daily_pnl,
  AVG(net_pnl) FILTER (WHERE status = 'CLOSED') AS avg_pnl,
  AVG(r_multiple) FILTER (WHERE status = 'CLOSED' AND r_multiple IS NOT NULL) AS avg_r_multiple,
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'CLOSED') > 0
    THEN (COUNT(*) FILTER (WHERE status = 'CLOSED' AND net_pnl > 0)::NUMERIC /
          COUNT(*) FILTER (WHERE status = 'CLOSED')::NUMERIC * 100)
    ELSE 0
  END AS win_rate_pct
FROM public.trades
WHERE entry_date IS NOT NULL
GROUP BY user_id, DATE(entry_date);

-- Grant access to the views
GRANT SELECT ON public.trade_stats_by_day TO authenticated;

-- ============================================================
-- STORAGE BUCKET for screenshots (run in Supabase dashboard)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('trade-screenshots', 'trade-screenshots', false);

-- CREATE POLICY "Users can upload own screenshots" ON storage.objects
--   FOR INSERT WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can view own screenshots" ON storage.objects
--   FOR SELECT USING (auth.uid()::text = (storage.foldername(name))[1]);
