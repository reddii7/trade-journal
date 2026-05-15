import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Trade, TradeTag, TradeWithTags } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';

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

    // Hard timeout — never stay in loading state more than 6 seconds
    const timer = setTimeout(() => {
      console.warn('[useTrades] query timed out');
      setLoading(false);
    }, 6000);

    try {
      // Simple flat query — avoids PostgREST nested join issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });

      if (filters?.journalId) query = query.eq('journal_id', filters.journalId);
      if (filters?.symbol) query = query.ilike('symbol', `%${filters.symbol}%`);
      if (filters?.direction) query = query.eq('direction', filters.direction);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.dateFrom) query = query.gte('entry_date', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('entry_date', filters.dateTo);
      if (filters?.minPnl !== undefined) query = query.gte('net_pnl', filters.minPnl);
      if (filters?.maxPnl !== undefined) query = query.lte('net_pnl', filters.maxPnl);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTrades = (data as any[]) || [];

      // Fetch tag associations separately if there are trades
      let tagMap: Record<string, TradeTag[]> = {};
      if (rawTrades.length > 0) {
        const tradeIds = rawTrades.map((t: { id: string }) => t.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: assocData } = await (supabase as any)
          .from('trade_tag_associations')
          .select('trade_id, trade_tags(id, name, color, category)')
          .in('trade_id', tradeIds);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of (assocData || []) as any[]) {
          if (!tagMap[row.trade_id]) tagMap[row.trade_id] = [];
          if (row.trade_tags) tagMap[row.trade_id].push(row.trade_tags as TradeTag);
        }
      }

      const tradesWithTags: TradeWithTags[] = rawTrades.map((t: Trade) => ({
        ...t,
        tags: tagMap[t.id] || [],
      }));

      // Filter by tags if needed
      if (filters?.tags && filters.tags.length > 0) {
        setTrades(
          tradesWithTags.filter((trade) =>
            filters.tags!.some((tagId) => trade.tags?.some((tg) => tg.id === tagId))
          )
        );
      } else {
        setTrades(tradesWithTags);
      }
    } catch (err) {
      console.error('[useTrades]', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch trades');
      setTrades([]);
    } finally {
      clearTimeout(timer);
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
      const timer = setTimeout(() => {
        console.warn('[useTradeStats] timed out after 6s');
        setLoading(false);
      }, 6000);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('trades')
          .select('net_pnl, r_multiple, status')
          .eq('user_id', user.id)
          .eq('status', 'CLOSED')
          .order('entry_date', { ascending: true });

        clearTimeout(timer);

        if (error) {
          console.error('[useTradeStats]', error);
          setLoading(false);
          return;
        }

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
        clearTimeout(timer);
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
