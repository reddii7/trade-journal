export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
      };
      accounts: {
        Row: Account;
        Insert: Partial<Account>;
        Update: Partial<Account>;
      };
      journals: {
        Row: Journal;
        Insert: Partial<Journal>;
        Update: Partial<Journal>;
      };
      instruments: {
        Row: Instrument;
        Insert: Partial<Instrument>;
        Update: Partial<Instrument>;
      };
      trades: {
        Row: Trade;
        Insert: Partial<Trade>;
        Update: Partial<Trade>;
      };
      trade_tags: {
        Row: TradeTag;
        Insert: Partial<TradeTag>;
        Update: Partial<TradeTag>;
      };
      trade_tag_associations: {
        Row: TradeTagAssociation;
        Insert: Partial<TradeTagAssociation>;
        Update: Partial<TradeTagAssociation>;
      };
      trade_screenshots: {
        Row: TradeScreenshot;
        Insert: Partial<TradeScreenshot>;
        Update: Partial<TradeScreenshot>;
      };
      daily_notes: {
        Row: DailyNote;
        Insert: Partial<DailyNote>;
        Update: Partial<DailyNote>;
      };
      psych_logs: {
        Row: PsychLog;
        Insert: Partial<PsychLog>;
        Update: Partial<PsychLog>;
      };
      trading_rules: {
        Row: TradingRule;
        Insert: Partial<TradingRule>;
        Update: Partial<TradingRule>;
      };
      rule_compliance: {
        Row: RuleCompliance;
        Insert: Partial<RuleCompliance>;
        Update: Partial<RuleCompliance>;
      };
    };
    Views: {
      trade_stats_by_day: {
        Row: TradeStatsByDay;
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
  default_risk_percent: number;
  default_account_size: number;
  ig_account_type: 'DEMO' | 'LIVE';
  ig_connected: boolean;
  ig_account_id: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  ig_account_id: string;
  account_name: string | null;
  account_type: 'SPREADBET' | 'CFD' | 'PHYSICAL' | 'DEMO' | null;
  currency: string;
  balance: number;
  available: number;
  is_default: boolean;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Journal {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Instrument {
  id: string;
  user_id: string;
  epic: string;
  name: string;
  asset_class: 'CURRENCIES' | 'SHARES' | 'INDICES' | 'COMMODITIES' | 'CRYPTOCURRENCIES' | 'BONDS' | 'OPTIONS' | 'OTHER';
  market_name: string | null;
  currency: string;
  lot_size: number;
  created_at: string;
}

export type TradeDirection = 'BUY' | 'SELL';
export type TradeStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type ImportSource = 'IG_API' | 'CSV' | 'MANUAL';
export type TradingSession = 'LONDON' | 'NEW_YORK' | 'ASIAN' | 'OVERLAP' | 'OTHER';

export interface Trade {
  id: string;
  user_id: string;
  journal_id: string | null;
  instrument_id: string | null;
  symbol: string;
  market_name: string | null;
  direction: TradeDirection;
  status: TradeStatus;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  actual_stop_hit: number | null;
  actual_tp_hit: number | null;
  position_size: number | null;
  realized_pnl: number;
  commission: number;
  fees: number;
  net_pnl: number | null;
  risk_amount: number | null;
  risk_percent: number | null;
  r_multiple: number | null;
  reward_risk_ratio: number | null;
  entry_date: string | null;
  exit_date: string | null;
  duration_minutes: number | null;
  session: TradingSession | null;
  day_of_week: number | null;
  notes: string | null;
  setup_description: string | null;
  ig_deal_id: string | null;
  ig_deal_reference: string | null;
  ig_transaction_id: string | null;
  ig_order_type: string | null;
  ig_period: string | null;
  imported_from: ImportSource;
  raw_ig_data: Json | null;
  created_at: string;
  updated_at: string;
}

export type EmotionType =
  | 'CONFIDENT' | 'CALM' | 'FOCUSED'
  | 'NERVOUS' | 'ANXIOUS' | 'FEARFUL'
  | 'GREEDY' | 'FOMO' | 'REVENGE'
  | 'EUPHORIC' | 'FRUSTRATED' | 'BORED'
  | 'DISCIPLINED' | 'IMPULSIVE' | 'TIRED';

export interface PsychLog {
  id: string;
  user_id: string;
  trade_id: string | null;
  log_date: string;
  emotion: EmotionType | null;
  discipline_score: number | null;
  focus_score: number | null;
  confidence_score: number | null;
  stress_level: number | null;
  followed_rules: boolean | null;
  rule_violations: string[] | null;
  notes: string | null;
  log_phase: 'PRE' | 'DURING' | 'POST';
  created_at: string;
}

export interface TradeTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  category: string;
  created_at: string;
}

export interface TradeTagAssociation {
  id: string;
  trade_id: string;
  tag_id: string;
  user_id: string;
  created_at: string;
}

export interface TradeScreenshot {
  id: string;
  trade_id: string;
  user_id: string;
  storage_path: string;
  url: string;
  caption: string | null;
  screenshot_type: 'ENTRY' | 'EXIT' | 'OVERVIEW' | 'OTHER';
  created_at: string;
}

export interface DailyNote {
  id: string;
  user_id: string;
  journal_id: string | null;
  note_date: string;
  pre_session_plan: string | null;
  post_session_reflection: string | null;
  market_observations: string | null;
  lessons_learned: string | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  created_at: string;
  updated_at: string;
}

export interface TradingRule {
  id: string;
  user_id: string;
  rule_text: string;
  category: 'ENTRY' | 'EXIT' | 'RISK_MANAGEMENT' | 'PSYCHOLOGY' | 'GENERAL' | 'PRE_TRADE' | 'POST_TRADE';
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface RuleCompliance {
  id: string;
  user_id: string;
  trade_id: string | null;
  rule_id: string;
  complied: boolean;
  note: string | null;
  logged_at: string;
}

export interface TradeStatsByDay {
  user_id: string;
  trade_date: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  daily_pnl: number | null;
  avg_pnl: number | null;
  avg_r_multiple: number | null;
  win_rate_pct: number;
}

// Extended trade type with joined data
export interface TradeWithTags extends Trade {
  tags?: TradeTag[];
  psych_log?: PsychLog;
  screenshots?: TradeScreenshot[];
}

// IG Index CSV import row type
export interface IGCsvRow {
  TextDate: string;
  Summary: string;
  MarketName: string;
  Period: string;
  ProfitAndLoss: string;
  'Transaction type': string;
  Reference: string;
  'Open level': string;
  'Close level': string;
  Size: string;
  Currency: string;
  'PL Amount': string;
  'Cash transaction': string;
  DateUtc: string;
  OpenDateUtc: string;
  CurrencyIsoCode: string;
}
