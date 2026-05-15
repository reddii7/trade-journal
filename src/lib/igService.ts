import type { Trade, IGCsvRow } from '@/types/database';
import Papa from 'papaparse';

const FUNCTION_URL = '/.netlify/functions/ig-service';

async function callIG<T>(action: string, params?: Record<string, unknown>, accountType = 'DEMO'): Promise<T> {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, accountType, ...params }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'IG API call failed');
  return data as T;
}

export const igService = {
  testConnection: (accountType: 'DEMO' | 'LIVE') =>
    callIG<{ success: boolean; data: unknown }>('testConnection', {}, accountType),

  getAccounts: (accountType: 'DEMO' | 'LIVE') =>
    callIG<{ accounts: IGAccount[] }>('getAccounts', {}, accountType),

  getTransactionHistory: (
    accountType: 'DEMO' | 'LIVE',
    fromDate?: string,
    toDate?: string,
    pageSize = 50,
    pageNumber = 1
  ) =>
    callIG<{ transactions: IGTransaction[]; metadata: { pageData: { pageNumber: number; pageSize: number; totalCount: number } } }>(
      'getTransactionHistory',
      { fromDate, toDate, pageSize, pageNumber },
      accountType
    ),

  getMarketDetails: (epic: string, accountType: 'DEMO' | 'LIVE') =>
    callIG<IGMarketDetails>('getMarketDetails', { epic }, accountType),

  searchMarkets: (searchTerm: string, accountType: 'DEMO' | 'LIVE') =>
    callIG<{ markets: IGMarket[] }>('searchMarkets', { searchTerm }, accountType),

  getPositions: (accountType: 'DEMO' | 'LIVE') =>
    callIG<{ positions: unknown[] }>('getPositions', {}, accountType),
};

// Type definitions for IG API responses
export interface IGAccount {
  accountId: string;
  accountName: string;
  accountType: string;
  currency: string;
  balance: {
    balance: number;
    deposit: number;
    profitLoss: number;
    available: number;
  };
  preferred: boolean;
  status: string;
}

export interface IGTransaction {
  transactionType: string;
  instrumentName: string;
  period: string;
  reference: string;
  openLevel: string;
  closeLevel: string;
  size: string;
  currency: string;
  profitAndLoss: string;
  openDateUtc: string;
  closeDate: string;
  date: string;
  dateUtc: string;
  cashTransaction: boolean;
}

export interface IGMarketDetails {
  instrument: {
    epic: string;
    name: string;
    type: string;
    currencies: Array<{ code: string; symbol: string }>;
    lotSize: number;
  };
  snapshot: {
    bid: number;
    offer: number;
    high: number;
    low: number;
  };
}

export interface IGMarket {
  epic: string;
  instrumentName: string;
  instrumentType: string;
  expiry: string;
  streamingPricesAvailable: boolean;
}

// ============================
// CSV IMPORT PARSER
// ============================
export function parseIGCsv(csvText: string): Partial<Trade>[] {
  const result = Papa.parse<IGCsvRow>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  return result.data
    .filter(
      (row) =>
        row['Transaction type'] &&
        !row['Cash transaction']?.toString().toLowerCase().includes('true') &&
        row.MarketName
    )
    .map((row) => {
      const plAmount = parseFloat(row['PL Amount']?.replace(/[^0-9.-]/g, '') || '0');
      const openLevel = parseFloat(row['Open level'] || '0');
      const closeLevel = parseFloat(row['Close level'] || '0');
      const size = parseFloat(row.Size || '0');

      // Parse direction from transaction type or price movement
      const txType = row['Transaction type']?.toUpperCase() || '';
      let direction: 'BUY' | 'SELL' = 'BUY';
      if (txType.includes('SELL') || txType.includes('SHORT')) {
        direction = 'SELL';
      } else if (txType.includes('BUY') || txType.includes('LONG')) {
        direction = 'BUY';
      } else {
        // Infer from price movement
        direction = closeLevel > openLevel ? 'BUY' : 'SELL';
      }

      const openDate = row.OpenDateUtc || row.TextDate;
      const closeDate = row.DateUtc || row.TextDate;

      // Extract symbol from market name (first word usually)
      const marketName = row.MarketName || '';
      const symbol = marketName.split(' ')[0] || marketName;

      return {
        symbol,
        market_name: marketName,
        direction,
        status: 'CLOSED' as const,
        entry_price: openLevel || undefined,
        exit_price: closeLevel || undefined,
        position_size: size || undefined,
        realized_pnl: plAmount,
        commission: 0,
        fees: 0,
        entry_date: openDate ? new Date(openDate).toISOString() : undefined,
        exit_date: closeDate ? new Date(closeDate).toISOString() : undefined,
        ig_deal_reference: row.Reference,
        ig_period: row.Period,
        ig_transaction_id: row.Reference,
        imported_from: 'CSV' as const,
        raw_ig_data: row as unknown as import('@/types/database').Json,
      } as Partial<Trade>;
    });
}

// Map IG transactions to Trade objects
export function igTransactionToTrade(tx: IGTransaction): Partial<Trade> {
  const plStr = tx.profitAndLoss?.replace(/[^0-9.-]/g, '') || '0';
  const pnl = parseFloat(plStr);
  const openLevel = parseFloat(tx.openLevel || '0');
  const closeLevel = parseFloat(tx.closeLevel || '0');
  const size = parseFloat(tx.size || '0');

  const txType = tx.transactionType?.toUpperCase() || '';
  let direction: 'BUY' | 'SELL' = 'BUY';
  if (txType.includes('SELL') || txType.includes('SHORT')) {
    direction = 'SELL';
  }

  const marketName = tx.instrumentName || '';
  const symbol = marketName.split(' ')[0] || marketName;

  return {
    symbol,
    market_name: marketName,
    direction,
    status: 'CLOSED',
    entry_price: openLevel || undefined,
    exit_price: closeLevel || undefined,
    position_size: size || undefined,
    realized_pnl: pnl,
    commission: 0,
    fees: 0,
    entry_date: tx.openDateUtc ? new Date(tx.openDateUtc).toISOString() : undefined,
    exit_date: tx.dateUtc ? new Date(tx.dateUtc).toISOString() : undefined,
    ig_deal_reference: tx.reference,
    ig_period: tx.period,
    ig_transaction_id: tx.reference,
    imported_from: 'IG_API',
    raw_ig_data: tx as unknown as import('@/types/database').Json,
  };
}
