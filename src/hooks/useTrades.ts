import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Trade, TradeWithTags } from '@/types/database';
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
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('trades')
        .select(`
          *,
          trade_tag_associations(
            tag_id,
            trade_tags(id, name, color, category)
          ),
          psych_logs(*)
        `)
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

      // Flatten tags
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tradesWithTags = ((data as any[]) || []).map((t: any) => ({
        ...t,
        tags: (t.trade_tag_associations || []).map(
          (tta: { trade_tags: unknown }) => tta.trade_tags
        ),
        psych_log: Array.isArray(t.psych_logs)
          ? t.psych_logs[0]
          : t.psych_logs,
      })) as TradeWithTags[];

      // Filter by tags if needed
      if (filters?.tags && filters.tags.length > 0) {
        const filtered = tradesWithTags.filter((trade) =>
          filters.tags!.some((tagId) =>
            trade.tags?.some((t) => t.id === tagId)
          )
        );
        setTrades(filtered);
      } else {
        setTrades(tradesWithTags);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trades');
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
    if (!user) return;
    const compute = async () => {
      const { data } = await supabase
        .from('trades')
        .select('net_pnl, r_multiple, status, realized_pnl')
        .eq('user_id', user.id)
        .eq('status', 'CLOSED')
        .order('entry_date', { ascending: true });

      if (!data) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const closed = (data as any[]).filter((t) => t.status === 'CLOSED');
      const wins = closed.filter((t: { net_pnl?: number }) => (t.net_pnl ?? 0) > 0);
      const losses = closed.filter((t: { net_pnl?: number }) => (t.net_pnl ?? 0) < 0);
      const totalWins = wins.reduce((s: number, t: { net_pnl?: number }) => s + (t.net_pnl ?? 0), 0);
      const totalLosses = Math.abs(losses.reduce((s: number, t: { net_pnl?: number }) => s + (t.net_pnl ?? 0), 0));

      // Streak calculation
      type RawTrade = { net_pnl?: number; r_multiple?: number };
      let currentStreak = 0;
      let longestWin = 0;
      let longestLoss = 0;
      let winRun = 0;
      let lossRun = 0;
      for (const t of closed as RawTrade[]) {
        if ((t.net_pnl ?? 0) > 0) {
          winRun++;
          lossRun = 0;
          if (winRun > longestWin) longestWin = winRun;
        } else {
          lossRun++;
          winRun = 0;
          if (lossRun > longestLoss) longestLoss = lossRun;
        }
      }
      const last = (closed as RawTrade[])[closed.length - 1];
      if (last) {
        currentStreak = (last.net_pnl ?? 0) > 0 ? winRun : -lossRun;
      }

      setStats({
        totalTrades: closed.length,
        winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
        profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
        totalPnl: (closed as RawTrade[]).reduce((s, t) => s + (t.net_pnl ?? 0), 0),
        avgRMultiple:
          (closed as RawTrade[]).filter((t) => t.r_multiple != null).length > 0
            ? (closed as RawTrade[])
                .filter((t) => t.r_multiple != null)
                .reduce((s, t) => s + (t.r_multiple ?? 0), 0) /
              (closed as RawTrade[]).filter((t) => t.r_multiple != null).length
            : 0,
        avgWin: wins.length ? totalWins / wins.length : 0,
        avgLoss: losses.length ? totalLosses / losses.length : 0,
        bestTrade: closed.length
          ? Math.max(...(closed as RawTrade[]).map((t) => t.net_pnl ?? 0))
          : 0,
        worstTrade: closed.length
          ? Math.min(...(closed as RawTrade[]).map((t) => t.net_pnl ?? 0))
          : 0,
        currentStreak,
        longestWinStreak: longestWin,
        longestLossStreak: longestLoss,
      });
      setLoading(false);
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
