import { useState, useRef } from 'react';
import {
  Modal,
  Button,
  Group,
  Stack,
  Text,
  Box,
  Alert,
  Table,
  Badge,
  ScrollArea,
  Progress,
  Code,
} from '@mantine/core';
import { IconUpload, IconAlertCircle, IconCheck, IconX } from '@tabler/icons-react';
import { parseIGCsv } from '@/lib/igService';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Trade } from '@/types/database';

interface CSVImportModalProps {
  opened: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ParsedRow {
  trade: Partial<Trade>;
  status: 'pending' | 'imported' | 'duplicate' | 'error';
  errorMsg?: string;
}

export default function CSVImportModal({ opened, onClose, onImported }: CSVImportModalProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const trades = parseIGCsv(text);
        setParsedRows(trades.map((t) => ({ trade: t, status: 'pending' })));
        setDone(false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Parse failed');
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file);
  };

  // Get auth token directly from localStorage — bypasses supabase-js client
  // which can hang on session refresh. Direct REST calls are proven to work.
  const getAuthToken = (): string | null => {
    try {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'));
      if (!key) return null;
      return JSON.parse(localStorage.getItem(key) || '{}')?.access_token ?? null;
    } catch {
      return null;
    }
  };

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const supabaseHeaders = (token: string) => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const handleImport = async () => {
    if (!user || parsedRows.length === 0) return;
    setImporting(true);
    setProgress(0);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) throw new Error('Not authenticated — please sign out and back in.');

      const headers = supabaseHeaders(token);

      // Fetch existing transaction IDs to skip duplicates
      const existingRes = await fetch(
        `${SUPABASE_URL}/rest/v1/trades?select=ig_transaction_id&user_id=eq.${user.id}&ig_transaction_id=not.is.null`,
        { headers }
      );
      const existingData: { ig_transaction_id: string }[] = existingRes.ok
        ? await existingRes.json()
        : [];
      const existingSet = new Set(existingData.map((r) => r.ig_transaction_id));

      const updated = [...parsedRows];
      const toInsert: Array<{ trade: Partial<Trade>; index: number }> = [];

      for (let i = 0; i < updated.length; i++) {
        const txId = updated[i].trade.ig_transaction_id;
        if (txId && existingSet.has(txId)) {
          updated[i] = { ...updated[i], status: 'duplicate' };
        } else {
          toInsert.push({ trade: updated[i].trade, index: i });
        }
      }
      setParsedRows([...updated]);
      setProgress(10);

      // Batch insert in chunks of 50
      const CHUNK = 50;
      let insertedCount = 0;
      for (let c = 0; c < toInsert.length; c += CHUNK) {
        const chunk = toInsert.slice(c, c + CHUNK);
        const rows = chunk.map(({ trade }) => ({ ...trade, user_id: user.id }));

        const res = await fetch(`${SUPABASE_URL}/rest/v1/trades`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify(rows),
        });

        const errText = res.ok ? null : await res.text();
        if (!res.ok) console.error('[CSVImport] insert failed:', errText);
        for (const { index } of chunk) {
          if (!res.ok) {
            updated[index] = { ...updated[index], status: 'error', errorMsg: errText ?? 'Insert failed' };
          } else {
            updated[index] = { ...updated[index], status: 'imported' };
            insertedCount++;
          }
        }
        setProgress(10 + Math.round(((c + chunk.length) / toInsert.length) * 90));
        setParsedRows([...updated]);
      }

      setImporting(false);
      setDone(true);
      if (insertedCount > 0) onImported();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Import failed: ${msg}`);
      setImporting(false);
    }
  };

  const handleClose = () => {
    setParsedRows([]);
    setDone(false);
    setError(null);
    setProgress(0);
    onClose();
  };

  const importedCount = parsedRows.filter((r) => r.status === 'imported').length;
  const dupCount = parsedRows.filter((r) => r.status === 'duplicate').length;
  const errCount = parsedRows.filter((r) => r.status === 'error').length;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import Trades from IG CSV"
      size="xl"
      centered
    >
      <Stack gap="md">
        <Alert color="blue" variant="light">
          Export your transaction history from IG Index as CSV and import it here.
          The format must include: <Code>TextDate, Summary, MarketName, Period, ProfitAndLoss,
          Transaction type, Reference, Open level, Close level, Size, Currency, PL Amount,
          Cash transaction, DateUtc, OpenDateUtc, CurrencyIsoCode</Code>
        </Alert>

        {parsedRows.length === 0 && (
          <Box
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            style={{
              border: '2px dashed var(--mantine-color-dark-4)',
              borderRadius: 'var(--mantine-radius-md)',
              padding: 40,
              textAlign: 'center',
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Stack align="center" gap="xs">
              <IconUpload size={40} color="var(--mantine-color-dimmed)" />
              <Text fw={500}>Drop your IG CSV here or click to browse</Text>
              <Text size="sm" c="dimmed">Supports .csv files only</Text>
            </Stack>
          </Box>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}

        {parsedRows.length > 0 && (
          <>
            <Group justify="space-between">
              <Text fw={500}>{parsedRows.length} trades parsed</Text>
              <Group gap="xs">
                <Badge color="teal">{importedCount} imported</Badge>
                <Badge color="gray">{dupCount} duplicates</Badge>
                {errCount > 0 && <Badge color="red">{errCount} errors</Badge>}
              </Group>
            </Group>

            {importing && (
              <Progress value={progress} animated />
            )}

            <ScrollArea h={300}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Symbol</Table.Th>
                    <Table.Th>Direction</Table.Th>
                    <Table.Th>Entry</Table.Th>
                    <Table.Th>Exit</Table.Th>
                    <Table.Th>P&L</Table.Th>
                    <Table.Th>Date</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {parsedRows.map((row, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>
                        {row.status === 'imported' && <IconCheck size={14} color="var(--mantine-color-teal-6)" />}
                        {row.status === 'duplicate' && <Badge size="xs" color="gray">DUP</Badge>}
                        {row.status === 'error' && (
                          <Text size="xs" c="red" title={row.errorMsg}>ERR</Text>
                        )}
                        {row.status === 'pending' && <Badge size="xs" color="blue">READY</Badge>}
                      </Table.Td>
                      <Table.Td>{row.trade.symbol}</Table.Td>
                      <Table.Td>
                        <Badge size="xs" color={row.trade.direction === 'BUY' ? 'teal' : 'red'}>
                          {row.trade.direction}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{row.trade.entry_price?.toFixed(2) ?? '—'}</Table.Td>
                      <Table.Td>{row.trade.exit_price?.toFixed(2) ?? '—'}</Table.Td>
                      <Table.Td>
                        <Text c={(row.trade.realized_pnl ?? 0) >= 0 ? 'teal' : 'red'} size="sm">
                          {(row.trade.realized_pnl ?? 0) >= 0 ? '+' : ''}
                          £{(row.trade.realized_pnl ?? 0).toFixed(2)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {row.trade.entry_date
                          ? new Date(row.trade.entry_date).toLocaleDateString('en-GB')
                          : '—'}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>Close</Button>
          {parsedRows.length > 0 && !done && (
            <Button
              onClick={handleImport}
              loading={importing}
              leftSection={<IconUpload size={16} />}
            >
              Import {parsedRows.filter((r) => r.status === 'pending').length} Trades
            </Button>
          )}
          {done && (
            <Button color="teal" onClick={handleClose}>
              Done — {importedCount} Imported
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
