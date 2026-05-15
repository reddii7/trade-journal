import { useMemo, useState } from 'react';
import {
  Box,
  Title,
  Grid,
  Paper,
  Text,
  Select,
  Group,
  Stack,
  Badge,
  Table,
  Tabs,
  SimpleGrid,
  ThemeIcon,
  Divider,
  MultiSelect,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
  LineChart,
  Line,
  Legend,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { format, getDay, getHours } from 'date-fns';
import { useTrades } from '@/hooks/useTrades';
import { useTags } from '@/hooks/useJournals';
import type { TradeWithTags } from '@/types/database';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconClock,
  IconCalendar,
} from '@tabler/icons-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function groupBy<T>(arr: T[], key: (item: T) => string) {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function computeGroupStats(trades: TradeWithTags[]) {
  const wins = trades.filter((t) => (t.net_pnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.net_pnl ?? 0) < 0);
  const totalPnl = trades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const grossWin = wins.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.net_pnl ?? 0), 0));
  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    totalPnl,
    avgPnl: trades.length ? totalPnl / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgR: trades.filter((t) => t.r_multiple != null).length
      ? trades.filter((t) => t.r_multiple != null).reduce((s, t) => s + (t.r_multiple ?? 0), 0) /
        trades.filter((t) => t.r_multiple != null).length
      : 0,
  };
}

export default function Analytics() {
  const [dateRange, setDateRange] = useState<[Date | null, Date | null] | [null, null]>([null, null]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterSymbol, setFilterSymbol] = useState<string | null>(null);
  const [filterDirection, setFilterDirection] = useState<string | null>(null);
  const { tags } = useTags();

  const { trades } = useTrades({
    status: 'CLOSED',
    dateFrom: dateRange[0]?.toISOString(),
    dateTo: dateRange[1]?.toISOString(),
    tags: filterTags.length > 0 ? filterTags : undefined,
    symbol: filterSymbol || undefined,
    direction: (filterDirection as 'BUY' | 'SELL') || undefined,
  });

  const symbols = useMemo(() => {
    const s = new Set(trades.map((t) => t.symbol));
    return Array.from(s).map((v) => ({ value: v, label: v }));
  }, [trades]);

  // ---- By Symbol ----
  const bySymbol = useMemo(() => {
    const g = groupBy(trades, (t) => t.symbol);
    return Object.entries(g)
      .map(([symbol, ts]) => ({ symbol, ...computeGroupStats(ts) }))
      .sort((a, b) => b.totalPnl - a.totalPnl);
  }, [trades]);

  // ---- By Day of Week ----
  const byDow = useMemo(() => {
    const g = groupBy(
      trades.filter((t) => t.entry_date),
      (t) => String(getDay(new Date(t.entry_date!)))
    );
    return DAYS.map((day, i) => {
      const ts = g[String(i)] || [];
      const stats = computeGroupStats(ts);
      return { day, ...stats };
    });
  }, [trades]);

  // ---- By Hour of Day ----
  const byHour = useMemo(() => {
    const g = groupBy(
      trades.filter((t) => t.entry_date),
      (t) => String(getHours(new Date(t.entry_date!)))
    );
    return Array.from({ length: 24 }, (_, i) => {
      const ts = g[String(i)] || [];
      return { hour: `${String(i).padStart(2, '0')}:00`, ...computeGroupStats(ts) };
    }).filter((h) => h.count > 0);
  }, [trades]);

  // ---- By Direction ----
  const byDirection = useMemo(() => {
    const g = groupBy(trades, (t) => t.direction);
    return Object.entries(g).map(([dir, ts]) => ({
      direction: dir,
      ...computeGroupStats(ts),
    }));
  }, [trades]);

  // ---- By Month ----
  const byMonth = useMemo(() => {
    const g = groupBy(
      trades.filter((t) => t.entry_date),
      (t) => format(new Date(t.entry_date!), 'yyyy-MM')
    );
    return Object.entries(g)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, ts]) => ({
        month: format(new Date(month + '-01'), 'MMM yy'),
        ...computeGroupStats(ts),
      }));
  }, [trades]);

  // ---- Stop Loss Analysis ----
  const slAnalysis = useMemo(() => {
    return trades
      .filter((t) => t.stop_loss && t.entry_price && t.exit_price)
      .map((t) => {
        const slDistance = Math.abs((t.entry_price! - t.stop_loss!) / t.entry_price!) * 100;
        const actualMove = Math.abs((t.exit_price! - t.entry_price!) / t.entry_price!) * 100;
        const signed = (t.direction === 'BUY'
          ? t.exit_price! - t.entry_price!
          : t.entry_price! - t.exit_price!) / t.entry_price! * 100;
        return {
          id: t.id,
          symbol: t.symbol,
          slDistance: parseFloat(slDistance.toFixed(3)),
          actualMove: parseFloat(signed.toFixed(3)),
          pnl: t.net_pnl ?? 0,
        };
      });
  }, [trades]);

  const fmt = (v: number) => `£${Math.abs(v).toFixed(2)}`;

  return (
    <Box p="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>Analytics</Title>
      </Group>

      {/* Global Filters */}
      <Paper p="md" radius="md" withBorder mb="xl">
        <Group gap="md" wrap="wrap">
          <DatePickerInput
            type="range"
            placeholder="Date range"
            value={dateRange}
            onChange={(v) => setDateRange(v as [Date | null, Date | null])}
            clearable
            w={220}
            label="Period"
          />
          <Select
            label="Symbol"
            data={[{ value: '', label: 'All Symbols' }, ...symbols]}
            value={filterSymbol}
            onChange={setFilterSymbol}
            clearable
            searchable
            w={150}
          />
          <Select
            label="Direction"
            data={[
              { value: '', label: 'All' },
              { value: 'BUY', label: 'BUY' },
              { value: 'SELL', label: 'SELL' },
            ]}
            value={filterDirection}
            onChange={setFilterDirection}
            clearable
            w={120}
          />
          <MultiSelect
            label="Tags"
            data={tags.map((t) => ({ value: t.id, label: t.name }))}
            value={filterTags}
            onChange={setFilterTags}
            clearable
            w={200}
          />
          <Stack gap={0} align="flex-end">
            <Text size="xs" c="dimmed">Total trades</Text>
            <Text fw={700} size="lg">{trades.length}</Text>
          </Stack>
        </Group>
      </Paper>

      <Tabs defaultValue="performance">
        <Tabs.List mb="xl">
          <Tabs.Tab value="performance">Performance by Setup</Tabs.Tab>
          <Tabs.Tab value="time">Time Analysis</Tabs.Tab>
          <Tabs.Tab value="risk">Risk Management</Tabs.Tab>
          <Tabs.Tab value="monthly">Monthly Report</Tabs.Tab>
        </Tabs.List>

        {/* ─── Performance by Setup ─── */}
        <Tabs.Panel value="performance">
          <Stack gap="xl">
            <Grid>
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Paper p="md" radius="md" withBorder>
                  <Text fw={600} mb="md">P&L by Symbol</Text>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={bySymbol.slice(0, 15)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `£${v}`}
                      />
                      <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11 }} width={60} />
                      <Tooltip formatter={(v) => [`£${(v as number).toFixed(2)}`, 'P&L'] as [string, string]} />
                      <Bar dataKey="totalPnl" radius={[0, 3, 3, 0]}>
                        {bySymbol.slice(0, 15).map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.totalPnl >= 0
                              ? 'var(--mantine-color-teal-6)'
                              : 'var(--mantine-color-red-6)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 5 }}>
                <Paper p="md" radius="md" withBorder>
                  <Text fw={600} mb="md">Win Rate by Symbol</Text>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={bySymbol.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                      <XAxis dataKey="symbol" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [`${(v as number).toFixed(1)}%`, 'Win Rate'] as [string, string]} />
                      <ReferenceLine y={50} stroke="var(--mantine-color-yellow-6)" strokeDasharray="4 4" />
                      <Bar dataKey="winRate" fill="var(--mantine-color-blue-6)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid.Col>
            </Grid>

            {/* Symbol breakdown table */}
            <Paper radius="md" withBorder>
              <Text fw={600} p="md" pb={0}>Detailed Symbol Breakdown</Text>
              <Table striped highlightOnHover mt="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Symbol</Table.Th>
                    <Table.Th>Trades</Table.Th>
                    <Table.Th>Win Rate</Table.Th>
                    <Table.Th>Total P&L</Table.Th>
                    <Table.Th>Avg P&L</Table.Th>
                    <Table.Th>Profit Factor</Table.Th>
                    <Table.Th>Avg R</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {bySymbol.map((row) => (
                    <Table.Tr key={row.symbol}>
                      <Table.Td><Text fw={600}>{row.symbol}</Text></Table.Td>
                      <Table.Td>{row.count}</Table.Td>
                      <Table.Td>
                        <Badge color={row.winRate >= 50 ? 'teal' : 'orange'} variant="light">
                          {row.winRate.toFixed(1)}%
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text c={row.totalPnl >= 0 ? 'teal' : 'red'} fw={600}>
                          {row.totalPnl >= 0 ? '+' : ''}{fmt(row.totalPnl)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c={row.avgPnl >= 0 ? 'teal' : 'red'}>
                          {row.avgPnl >= 0 ? '+' : ''}{fmt(row.avgPnl)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={row.profitFactor >= 1 ? 'teal' : 'red'} variant="light">
                          {row.profitFactor === Infinity ? '∞' : row.profitFactor.toFixed(2)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text c={row.avgR >= 0 ? 'teal' : 'red'}>
                          {row.avgR >= 0 ? '+' : ''}{row.avgR.toFixed(2)}R
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          </Stack>
        </Tabs.Panel>

        {/* ─── Time Analysis ─── */}
        <Tabs.Panel value="time">
          <Grid gap="xl">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper p="md" radius="md" withBorder>
                <Text fw={600} mb="md">P&L by Day of Week</Text>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={byDow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `£${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [`£${(v as number).toFixed(2)}`, 'Total P&L'] as [string, string]} />
                    <ReferenceLine y={0} stroke="var(--mantine-color-dark-3)" />
                    <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]}>
                      {byDow.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.totalPnl >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper p="md" radius="md" withBorder>
                <Text fw={600} mb="md">Win Rate by Day</Text>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={byDow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [`${(v as number).toFixed(1)}%`, 'Win Rate'] as [string, string]} />
                    <ReferenceLine y={50} stroke="var(--mantine-color-yellow-6)" strokeDasharray="4 4" />
                    <Bar dataKey="winRate" fill="var(--mantine-color-blue-6)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid.Col>

            <Grid.Col span={12}>
              <Paper p="md" radius="md" withBorder>
                <Text fw={600} mb="md">P&L by Hour of Day (Entry Time)</Text>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={byHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `£${v}`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [`£${(v as number).toFixed(2)}`, 'Avg P&L'] as [string, string]} />
                    <ReferenceLine y={0} stroke="var(--mantine-color-dark-3)" />
                    <Bar dataKey="avgPnl" radius={[3, 3, 0, 0]}>
                      {byHour.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.avgPnl >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* ─── Risk Management ─── */}
        <Tabs.Panel value="risk">
          <Grid gap="xl">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper p="md" radius="md" withBorder>
                <Group mb="md">
                  <ThemeIcon variant="light" color="orange">
                    <IconTrendingDown size={16} />
                  </ThemeIcon>
                  <Text fw={600}>Stop Loss vs Actual Move (%)</Text>
                </Group>
                <Text size="xs" c="dimmed" mb="md">
                  Each dot = one trade. X = SL distance from entry. Y = actual price move.
                  Dots below X-axis = stopped out.
                </Text>
                {slAnalysis.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                      <XAxis
                        dataKey="slDistance"
                        name="SL Distance"
                        tick={{ fontSize: 10 }}
                        label={{ value: 'SL Distance %', position: 'insideBottom', offset: -4, fontSize: 11 }}
                      />
                      <YAxis
                        dataKey="actualMove"
                        name="Actual Move"
                        tick={{ fontSize: 10 }}
                        label={{ value: 'Actual Move %', angle: -90, position: 'insideLeft', fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <Paper p="xs" withBorder>
                              <Text size="xs" fw={600}>{d.symbol}</Text>
                              <Text size="xs">SL: {d.slDistance}%</Text>
                              <Text size="xs">Move: {d.actualMove}%</Text>
                              <Text size="xs" c={d.pnl >= 0 ? 'teal' : 'red'}>
                                P&L: £{d.pnl.toFixed(2)}
                              </Text>
                            </Paper>
                          );
                        }}
                      />
                      <ReferenceLine y={0} stroke="var(--mantine-color-red-6)" strokeDasharray="4 4" />
                      <Scatter name="Trades" data={slAnalysis}>
                        {slAnalysis.map((d, i) => (
                          <Cell
                            key={i}
                            fill={d.pnl >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)'}
                            fillOpacity={0.7}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <Text c="dimmed" size="sm" ta="center" py="xl">
                    Add stop loss levels to your trades to see this analysis.
                  </Text>
                )}
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper p="md" radius="md" withBorder>
                <Text fw={600} mb="md">BUY vs SELL Performance</Text>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Direction</Table.Th>
                      <Table.Th>Trades</Table.Th>
                      <Table.Th>Win Rate</Table.Th>
                      <Table.Th>Total P&L</Table.Th>
                      <Table.Th>Avg R</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {byDirection.map((row) => (
                      <Table.Tr key={row.direction}>
                        <Table.Td>
                          <Badge color={row.direction === 'BUY' ? 'teal' : 'red'} variant="light">
                            {row.direction}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{row.count}</Table.Td>
                        <Table.Td>{row.winRate.toFixed(1)}%</Table.Td>
                        <Table.Td>
                          <Text c={row.totalPnl >= 0 ? 'teal' : 'red'}>
                            {row.totalPnl >= 0 ? '+' : ''}{fmt(row.totalPnl)}
                          </Text>
                        </Table.Td>
                        <Table.Td>{row.avgR.toFixed(2)}R</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>

                <Divider my="md" />

                <Text fw={600} mb="md">R-Multiple Distribution</Text>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={[
                      { range: '<-2R', count: trades.filter((t) => (t.r_multiple ?? 0) < -2).length },
                      { range: '-2R to -1R', count: trades.filter((t) => (t.r_multiple ?? 0) >= -2 && (t.r_multiple ?? 0) < -1).length },
                      { range: '-1R to 0', count: trades.filter((t) => (t.r_multiple ?? 0) >= -1 && (t.r_multiple ?? 0) < 0).length },
                      { range: '0 to 1R', count: trades.filter((t) => (t.r_multiple ?? 0) >= 0 && (t.r_multiple ?? 0) < 1).length },
                      { range: '1R to 2R', count: trades.filter((t) => (t.r_multiple ?? 0) >= 1 && (t.r_multiple ?? 0) < 2).length },
                      { range: '>2R', count: trades.filter((t) => (t.r_multiple ?? 0) >= 2).length },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                    <XAxis dataKey="range" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="var(--mantine-color-blue-6)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* ─── Monthly Report ─── */}
        <Tabs.Panel value="monthly">
          <Stack gap="xl">
            <Paper p="md" radius="md" withBorder>
              <Text fw={600} mb="md">Monthly P&L</Text>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `£${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`£${(v as number).toFixed(2)}`, 'P&L'] as [string, string]} />
                  <Legend />
                  <ReferenceLine y={0} stroke="var(--mantine-color-dark-3)" />
                  <Line
                    type="monotone"
                    dataKey="totalPnl"
                    name="Total P&L"
                    stroke="var(--mantine-color-blue-6)"
                    strokeWidth={2}
                    dot
                  />
                  <Line
                    type="monotone"
                    dataKey="avgPnl"
                    name="Avg Trade P&L"
                    stroke="var(--mantine-color-teal-6)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>

            <Paper radius="md" withBorder>
              <Text fw={600} p="md" pb={0}>Monthly Summary</Text>
              <Table striped highlightOnHover mt="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Month</Table.Th>
                    <Table.Th>Trades</Table.Th>
                    <Table.Th>W / L</Table.Th>
                    <Table.Th>Win Rate</Table.Th>
                    <Table.Th>Total P&L</Table.Th>
                    <Table.Th>Avg P&L</Table.Th>
                    <Table.Th>Profit Factor</Table.Th>
                    <Table.Th>Avg R</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {byMonth.map((row) => (
                    <Table.Tr key={row.month}>
                      <Table.Td><Text fw={600}>{row.month}</Text></Table.Td>
                      <Table.Td>{row.count}</Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          <Text component="span" c="teal">{row.wins}W</Text>
                          {' / '}
                          <Text component="span" c="red">{row.losses}L</Text>
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={row.winRate >= 50 ? 'teal' : 'orange'} variant="light">
                          {row.winRate.toFixed(1)}%
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text c={row.totalPnl >= 0 ? 'teal' : 'red'} fw={700}>
                          {row.totalPnl >= 0 ? '+' : ''}{fmt(row.totalPnl)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c={row.avgPnl >= 0 ? 'teal' : 'red'}>
                          {row.avgPnl >= 0 ? '+' : ''}{fmt(row.avgPnl)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {row.profitFactor === Infinity ? '∞' : row.profitFactor.toFixed(2)}
                      </Table.Td>
                      <Table.Td>
                        <Text c={row.avgR >= 0 ? 'teal' : 'red'}>
                          {row.avgR >= 0 ? '+' : ''}{row.avgR.toFixed(2)}R
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
