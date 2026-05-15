import { useEffect, useState } from 'react';
import {
  Modal,
  TextInput,
  NumberInput,
  Select,
  Textarea,
  Button,
  Group,
  Stack,
  Grid,
  Text,
  Badge,
  MultiSelect,
  Tabs,
  Divider,
  Alert,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@/contexts/AuthContext';
import { useJournals, useTags } from '@/hooks/useJournals';
import { upsertTrade } from '@/hooks/useTrades';
import { supabase } from '@/lib/supabase';
import type { Trade } from '@/types/database';

interface TradeFormModalProps {
  opened: boolean;
  onClose: () => void;
  trade?: Partial<Trade>;
  onSaved: () => void;
}

export default function TradeFormModal({ opened, onClose, trade, onSaved }: TradeFormModalProps) {
  const { user, profile } = useAuth();
  const { journals } = useJournals();
  const { tags, createTag } = useTags();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [symbol, setSymbol] = useState('');
  const [marketName, setMarketName] = useState('');
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'CANCELLED'>('CLOSED');
  const [journalId, setJournalId] = useState<string | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | string>('');
  const [exitPrice, setExitPrice] = useState<number | string>('');
  const [stopLoss, setStopLoss] = useState<number | string>('');
  const [takeProfit, setTakeProfit] = useState<number | string>('');
  const [positionSize, setPositionSize] = useState<number | string>('');
  const [realizedPnl, setRealizedPnl] = useState<number | string>('');
  const [commission, setCommission] = useState<number | string>(0);
  const [riskAmount, setRiskAmount] = useState<number | string>('');
  const [riskPercent, setRiskPercent] = useState<number | string>('');
  const [entryDate, setEntryDate] = useState<Date | null>(null);
  const [exitDate, setExitDate] = useState<Date | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [setupDescription, setSetupDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Computed R-Multiple
  const computedR = (() => {
    const ep = Number(entryPrice);
    const sl = Number(stopLoss);
    const tp = Number(takeProfit);
    if (!ep || !sl || !tp) return null;
    const risk = Math.abs(ep - sl);
    const reward = Math.abs(tp - ep);
    return risk > 0 ? (reward / risk).toFixed(2) : null;
  })();

  // Auto-calculate risk %
  useEffect(() => {
    const ra = Number(riskAmount);
    const accountSize = profile?.default_account_size ?? 10000;
    if (ra > 0) {
      setRiskPercent(((ra / accountSize) * 100).toFixed(2));
    }
  }, [riskAmount, profile?.default_account_size]);

  // Populate form when editing
  useEffect(() => {
    if (trade) {
      setSymbol(trade.symbol || '');
      setMarketName(trade.market_name || '');
      setDirection(trade.direction || 'BUY');
      setStatus(trade.status || 'CLOSED');
      setJournalId(trade.journal_id || null);
      setEntryPrice(trade.entry_price ?? '');
      setExitPrice(trade.exit_price ?? '');
      setStopLoss(trade.stop_loss ?? '');
      setTakeProfit(trade.take_profit ?? '');
      setPositionSize(trade.position_size ?? '');
      setRealizedPnl(trade.realized_pnl ?? '');
      setCommission(trade.commission ?? 0);
      setRiskAmount(trade.risk_amount ?? '');
      setRiskPercent(trade.risk_percent ?? '');
      setEntryDate(trade.entry_date ? new Date(trade.entry_date) : null);
      setExitDate(trade.exit_date ? new Date(trade.exit_date) : null);
      setSession(trade.session || null);
      setNotes(trade.notes || '');
      setSetupDescription(trade.setup_description || '');
    } else {
      // Reset
      setSymbol(''); setMarketName(''); setDirection('BUY'); setStatus('CLOSED');
      setJournalId(null); setEntryPrice(''); setExitPrice(''); setStopLoss('');
      setTakeProfit(''); setPositionSize(''); setRealizedPnl(''); setCommission(0);
      setRiskAmount(''); setRiskPercent(''); setEntryDate(null); setExitDate(null);
      setSession(null); setNotes(''); setSetupDescription(''); setSelectedTags([]);
    }
  }, [trade, opened]);

  const handleSave = async () => {
    if (!user || !symbol) return;
    setLoading(true);
    setError(null);
    try {
      const tradeData: Partial<Trade> = {
        ...(trade?.id ? { id: trade.id } : {}),
        symbol: symbol.toUpperCase(),
        market_name: marketName || undefined,
        direction,
        status,
        journal_id: journalId || undefined,
        entry_price: entryPrice !== '' ? Number(entryPrice) : undefined,
        exit_price: exitPrice !== '' ? Number(exitPrice) : undefined,
        stop_loss: stopLoss !== '' ? Number(stopLoss) : undefined,
        take_profit: takeProfit !== '' ? Number(takeProfit) : undefined,
        position_size: positionSize !== '' ? Number(positionSize) : undefined,
        realized_pnl: realizedPnl !== '' ? Number(realizedPnl) : 0,
        commission: Number(commission) || 0,
        risk_amount: riskAmount !== '' ? Number(riskAmount) : undefined,
        risk_percent: riskPercent !== '' ? Number(riskPercent) : undefined,
        r_multiple: computedR ? Number(computedR) : undefined,
        entry_date: entryDate?.toISOString() || undefined,
        exit_date: exitDate?.toISOString() || undefined,
        session: (session as Trade['session']) || undefined,
        notes: notes || undefined,
        setup_description: setupDescription || undefined,
        imported_from: trade?.imported_from || 'MANUAL',
      };

      const saved = await upsertTrade(tradeData, user.id);

      // Handle tags
      if (saved.id && selectedTags.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('trade_tag_associations').delete().eq('trade_id', saved.id);
        const tagInserts = selectedTags.map((tagId) => ({
          trade_id: saved.id,
          tag_id: tagId,
          user_id: user.id,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('trade_tag_associations').insert(tagInserts);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const tagOptions = tags.map((t) => ({ value: t.id, label: t.name }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={trade?.id ? 'Edit Trade' : 'Add Trade'}
      size="xl"
      centered
    >
      <Tabs defaultValue="details">
        <Tabs.List mb="md">
          <Tabs.Tab value="details">Trade Details</Tabs.Tab>
          <Tabs.Tab value="risk">Risk & R-Multiple</Tabs.Tab>
          <Tabs.Tab value="notes">Notes & Tags</Tabs.Tab>
        </Tabs.List>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md">
            {error}
          </Alert>
        )}

        <Tabs.Panel value="details">
          <Stack gap="md">
            <Grid>
              <Grid.Col span={6}>
                <TextInput
                  label="Symbol / Instrument"
                  placeholder="e.g. GOLD, GBPUSD"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  required
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="Market Name"
                  placeholder="e.g. Gold (£1 per 0.1)"
                  value={marketName}
                  onChange={(e) => setMarketName(e.target.value)}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <Select
                  label="Direction"
                  data={[{ value: 'BUY', label: 'BUY (Long)' }, { value: 'SELL', label: 'SELL (Short)' }]}
                  value={direction}
                  onChange={(v) => setDirection((v || 'BUY') as 'BUY' | 'SELL')}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <Select
                  label="Status"
                  data={['OPEN', 'CLOSED', 'CANCELLED']}
                  value={status}
                  onChange={(v) => setStatus((v || 'CLOSED') as Trade['status'])}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <Select
                  label="Session"
                  data={['LONDON', 'NEW_YORK', 'ASIAN', 'OVERLAP', 'OTHER']}
                  value={session}
                  onChange={setSession}
                  clearable
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <DateTimePicker
                  label="Entry Date & Time"
                  value={entryDate}
                  onChange={(v) => setEntryDate(v as Date | null)}
                  clearable
                  valueFormat="DD MMM YYYY HH:mm"
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <DateTimePicker
                  label="Exit Date & Time"
                  value={exitDate}
                  onChange={(v) => setExitDate(v as Date | null)}
                  clearable
                  valueFormat="DD MMM YYYY HH:mm"
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <NumberInput
                  label="Entry Price"
                  value={entryPrice}
                  onChange={setEntryPrice}
                  decimalScale={8}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <NumberInput
                  label="Exit Price"
                  value={exitPrice}
                  onChange={setExitPrice}
                  decimalScale={8}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <NumberInput
                  label="Position Size"
                  value={positionSize}
                  onChange={setPositionSize}
                  decimalScale={4}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <NumberInput
                  label="Stop Loss"
                  value={stopLoss}
                  onChange={setStopLoss}
                  decimalScale={8}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <NumberInput
                  label="Take Profit"
                  value={takeProfit}
                  onChange={setTakeProfit}
                  decimalScale={8}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <NumberInput
                  label="Realized P&L"
                  value={realizedPnl}
                  onChange={setRealizedPnl}
                  decimalScale={4}
                  prefix="£"
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label="Commission / Spread"
                  value={commission}
                  onChange={setCommission}
                  decimalScale={4}
                  prefix="£"
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <Select
                  label="Journal"
                  data={journals.map((j) => ({ value: j.id, label: j.name }))}
                  value={journalId}
                  onChange={setJournalId}
                  clearable
                  placeholder="Select journal"
                />
              </Grid.Col>
            </Grid>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="risk">
          <Stack gap="md">
            <Grid>
              <Grid.Col span={6}>
                <NumberInput
                  label="Risk Amount (£)"
                  value={riskAmount}
                  onChange={setRiskAmount}
                  decimalScale={2}
                  prefix="£"
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label="Risk % of Account"
                  value={riskPercent}
                  onChange={setRiskPercent}
                  decimalScale={2}
                  suffix="%"
                />
              </Grid.Col>
            </Grid>

            <Divider label="Auto-calculated R-Multiple" labelPosition="center" />

            <Group justify="center" gap="xl">
              <Stack align="center" gap={4}>
                <Text size="xs" c="dimmed">Entry</Text>
                <Text fw={600}>{entryPrice || '—'}</Text>
              </Stack>
              <Stack align="center" gap={4}>
                <Text size="xs" c="dimmed">Stop Loss</Text>
                <Text fw={600} c="red">{stopLoss || '—'}</Text>
              </Stack>
              <Stack align="center" gap={4}>
                <Text size="xs" c="dimmed">Take Profit</Text>
                <Text fw={600} c="teal">{takeProfit || '—'}</Text>
              </Stack>
              <Stack align="center" gap={4}>
                <Text size="xs" c="dimmed">R:R Ratio</Text>
                <Badge size="xl" color={computedR && Number(computedR) >= 1 ? 'teal' : 'orange'}>
                  {computedR ? `${computedR}R` : '—'}
                </Badge>
              </Stack>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="notes">
          <Stack gap="md">
            <Textarea
              label="Setup Description"
              placeholder="Describe your trade setup (e.g. Break & Retest on H1)"
              value={setupDescription}
              onChange={(e) => setSetupDescription(e.target.value)}
              rows={3}
            />
            <Textarea
              label="Trade Notes"
              placeholder="Post-trade reflection, what worked, what didn't..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
            <MultiSelect
              label="Tags"
              data={tagOptions}
              value={selectedTags}
              onChange={setSelectedTags}
              placeholder="Select tags..."
              searchable
              clearable
            />
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Group justify="flex-end" mt="xl">
        <Button variant="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={loading}>
          {trade?.id ? 'Save Changes' : 'Add Trade'}
        </Button>
      </Group>
    </Modal>
  );
}
