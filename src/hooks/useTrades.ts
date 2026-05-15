import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { sbSelect, sbInsert, getAuthToken } from '@/lib/supabaseFetch';
import type { Trade, TradeTag, TradeWithTags } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface TradeFilters {
  journalId?: string;
  symbol?: string;
  direction?: 'BUY' | 'SELL';
  status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  minPnl?: number;
  maxPnl?: number;
}

export function useTrades(filters?: TradeFilters) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) { setLoading(false); return; }

      // Build query params
      const params = new URLSearchParams({ select: '*', 'user_id': `eq.${user.id}` });
      params.append('order', 'exit_date.desc.nullslast');

      if (filters?.symbol) params.append('symbol', `ilike.%${filters.symbol}%`);
      if (filters?.direction) params.append('direction', `eq.${filters.direction}`);
      if (filters?.status) params.append('status', `eq.${filters.status}`);
      if (filters?.dateFrom) params.append('entry_date', `gte.${filters.dateFrom}`);
      if (filters?.dateTo) params.append('entry_date', `lte.${filters.dateTo}`);
      if (filters?.minPnl !== undefined) params.append('net_pnl', `gte.${filters.minPnl}`);
      if (filters?.maxPnl !== undefined) params.append('net_pnl', `lte.${filters.maxPnl}`);

      const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?${params}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Trades fetch failed: ${res.status}`);
      const rawTrades: Trade[] = await res.json();

      setTrades(rawTrades.map((t) => ({ ...t, tags: [] })));
    } catch (err) {
      console.error('[useTrades]', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trades');
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, [user, JSON.stringify(filters)]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  return { trades, loading, error, refetch: fetchTrades };
}

export function useTradeStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    totalPnl: number;
    avgRMultiple: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
    currentStreak: number;
    longestWinStreak: number;
    longestLossStreak: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const compute = async () => {
      try {
        const token = getAuthToken();
        if (!token) { setLoading(false); return; }

        const params = new URLSearchParams({
          select: 'net_pnl,r_multiple,status',
          user_id: `eq.${user.id}`,
          status: 'eq.CLOSED',
          order: 'entry_date.asc',
        });

        const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?${params}`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        });

        if (!res.ok) { setLoading(false); return; }
        const data: { net_pnl?: number; r_multiple?: number }[] = await res.json();

        if (!data || data.length === 0) {
          setLoading(false);
          return;
        }

        type RawTrade = { net_pnl?: number; r_multiple?: number };
        const closed = data as RawTrade[];
        const wins = closed.filter((t) => (t.net_pnl ?? 0) > 0);
        const losses = closed.filter((t) => (t.net_pnl ?? 0) < 0);
        const totalWins = wins.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
        const totalLosses = Math.abs(losses.reduce((s, t) => s + (t.net_pnl ?? 0), 0));

        let currentStreak = 0, longestWin = 0, longestLoss = 0, winRun = 0, lossRun = 0;
        for (const t of closed) {
          if ((t.net_pnl ?? 0) > 0) { winRun++; lossRun = 0; if (winRun > longestWin) longestWin = winRun; }
          else { lossRun++; winRun = 0; if (lossRun > longestLoss) longestLoss = lossRun; }
        }
        const last = closed[closed.length - 1];
        if (last) currentStreak = (last.net_pnl ?? 0) > 0 ? winRun : -lossRun;

        setStats({
          totalTrades: closed.length,
          winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
          profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
          totalPnl: closed.reduce((s, t) => s + (t.net_pnl ?? 0), 0),
          avgRMultiple: closed.filter((t) => t.r_multiple != null).length > 0
            ? closed.filter((t) => t.r_multiple != null).reduce((s, t) => s + (t.r_multiple ?? 0), 0) /
              closed.filter((t) => t.r_multiple != null).length
            : 0,
          avgWin: wins.length ? totalWins / wins.length : 0,
          avgLoss: losses.length ? totalLosses / losses.length : 0,
          bestTrade: closed.length ? Math.max(...closed.map((t) => t.net_pnl ?? 0)) : 0,
          worstTrade: closed.length ? Math.min(...closed.map((t) => t.net_pnl ?? 0)) : 0,
          currentStreak,
          longestWinStreak: longestWin,
          longestLossStreak: longestLoss,
        });
        setLoading(false);
      } catch (e) {
        console.error('[useTradeStats] unexpected:', e);
        setLoading(false);
      }
    };

    compute();
  }, [user]);

  return { stats, loading };
}

export async function upsertTrade(trade: Partial<Trade>, userId: string): Promise<Trade> {
  // Compute fields that were previously generated columns
  const realized = trade.realized_pnl ?? 0;
  const commission = trade.commission ?? 0;
  const fees = trade.fees ?? 0;
  const net_pnl = realized - commission - fees;

  let duration_minutes: number | null = null;
  let day_of_week: number | null = null;
  if (trade.entry_date && trade.exit_date) {
    const entryMs = new Date(trade.entry_date).getTime();
    const exitMs = new Date(trade.exit_date).getTime();
    duration_minutes = Math.round((exitMs - entryMs) / 60000);
  }
  if (trade.entry_date) {
    day_of_week = new Date(trade.entry_date).getDay();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trades')
    .upsert({ ...trade, user_id: userId, net_pnl, duration_minutes, day_of_week })
    .select()
    .single();
  if (error) throw error;
  return data as Trade;
}

export async function deleteTrade(tradeId: string): Promise<void> {
  const { error } = await supabase.from('trades').delete().eq('id', tradeId);
  if (error) throw error;
}
