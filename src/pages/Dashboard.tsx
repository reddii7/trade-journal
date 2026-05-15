import {
  Box,
  Grid,
  Paper,
  Text,
  Title,
  Group,
  Stack,
  Badge,
  RingProgress,
  Skeleton,
  ThemeIcon,
  SimpleGrid,
  Divider,
} from '@mantine/core';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconScale,
  IconCurrencyPound,
  IconFlame,
  IconTarget,
  IconArrowUpRight,
  IconArrowDownRight,
} from '@tabler/icons-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from 'recharts';
import { useTrades, useTradeStats } from '@/hooks/useTrades';
import { useAuth } from '@/contexts/AuthContext';
import { format, subDays, startOfDay } from 'date-fns';
import type { TradeWithTags } from '@/types/database';

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  positive,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  positive?: boolean;
}) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {title}
        </Text>
        <ThemeIcon size="sm" variant="light" color={color} radius="sm">
          <Icon size={14} />
        </ThemeIcon>
      </Group>
      <Group gap="xs" align="baseline">
        <Text size="xl" fw={700} c={positive === undefined ? undefined : positive ? 'teal' : 'red'}>
          {value}
        </Text>
        {positive !== undefined && (
          positive
            ? <IconArrowUpRight size={16} color="var(--mantine-color-teal-6)" />
            : <IconArrowDownRight size={16} color="var(--mantine-color-red-6)" />
        )}
      </Group>
      {subtitle && (
        <Text size="xs" c="dimmed" mt={4}>
          {subtitle}
        </Text>
      )}
    </Paper>
  );
}

function buildEquityCurve(trades: TradeWithTags[]) {
  const closed = trades
    .filter((t) => t.status === 'CLOSED' && t.entry_date)
    .sort((a, b) => new Date(a.entry_date!).getTime() - new Date(b.entry_date!).getTime());

  let cumPnl = 0;
  return closed.map((t) => {
    cumPnl += t.net_pnl ?? 0;
    return {
      date: format(new Date(t.entry_date!), 'dd MMM'),
      pnl: parseFloat(cumPnl.toFixed(2)),
      trade: t.net_pnl ?? 0,
    };
  });
}

function buildDailyBars(trades: TradeWithTags[]) {
  const last30 = subDays(new Date(), 30);
  const dayMap: Record<string, number> = {};

  trades
    .filter((t) => t.status === 'CLOSED' && t.entry_date && new Date(t.entry_date) > last30)
    .forEach((t) => {
      const day = format(startOfDay(new Date(t.entry_date!)), 'MMM dd');
      dayMap[day] = (dayMap[day] || 0) + (t.net_pnl ?? 0);
    });

  return Object.entries(dayMap)
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }));
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { trades, loading } = useTrades({ status: undefined });
  const { stats, loading: statsLoading } = useTradeStats();

  const equityCurve = buildEquityCurve(trades);
  const dailyBars = buildDailyBars(trades);
  const currency = profile?.currency || 'GBP';
  const fmt = (v: number) => `${currency === 'GBP' ? '£' : '$'}${Math.abs(v).toFixed(2)}`;

  const recentTrades = trades.slice(0, 8);

  if (loading || statsLoading) {
    return (
      <Box p="xl">
        <SimpleGrid cols={{ base: 2, sm: 4 }} mb="xl">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} h={100} radius="md" />)}
        </SimpleGrid>
        <Skeleton h={280} radius="md" mb="xl" />
      </Box>
    );
  }

  return (
    <Box p="xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={2}>Dashboard</Title>
          <Text c="dimmed" size="sm">
            {format(new Date(), 'EEEE, d MMMM yyyy')}
          </Text>
        </div>
        <Badge color={profile?.ig_connected ? 'green' : 'gray'} size="lg" variant="light">
          {profile?.ig_account_type || 'DEMO'} Account
        </Badge>
      </Group>

      {/* Key Metric Cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="xl">
        <StatCard
          title="Total P&L"
          value={`${(stats?.totalPnl ?? 0) >= 0 ? '+' : ''}${fmt(stats?.totalPnl ?? 0)}`}
          subtitle={`${stats?.totalTrades ?? 0} closed trades`}
          icon={IconCurrencyPound}
          color="blue"
          positive={(stats?.totalPnl ?? 0) >= 0}
        />
        <StatCard
          title="Win Rate"
          value={`${(stats?.winRate ?? 0).toFixed(1)}%`}
          subtitle={`${Math.round(((stats?.winRate ?? 0) / 100) * (stats?.totalTrades ?? 0))} wins`}
          icon={IconTarget}
          color="teal"
        />
        <StatCard
          title="Profit Factor"
          value={
            stats?.profitFactor === Infinity
              ? '∞'
              : (stats?.profitFactor ?? 0).toFixed(2)
          }
          subtitle="Gross profit / gross loss"
          icon={IconScale}
          color="violet"
          positive={(stats?.profitFactor ?? 0) >= 1}
        />
        <StatCard
          title="Avg R-Multiple"
          value={`${(stats?.avgRMultiple ?? 0) >= 0 ? '+' : ''}${(stats?.avgRMultiple ?? 0).toFixed(2)}R`}
          subtitle="Average reward/risk"
          icon={IconFlame}
          color="orange"
          positive={(stats?.avgRMultiple ?? 0) >= 0}
        />
      </SimpleGrid>

      <Grid gap="xl">
        {/* Equity Curve */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper p="md" radius="md" withBorder>
            <Text fw={600} mb="md">Equity Curve</Text>
            {equityCurve.length > 1 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--mantine-color-blue-6)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--mantine-color-blue-6)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    stroke="var(--mantine-color-dimmed)"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="var(--mantine-color-dimmed)"
                    tickFormatter={(v) => `${currency === 'GBP' ? '£' : '$'}${v}`}
                  />
                  <Tooltip
                    formatter={(v) => [`${currency === 'GBP' ? '£' : '$'}${Number(v).toFixed(2)}`, 'Cumulative P&L'] as [string, string]}
                    contentStyle={{
                      background: 'var(--mantine-color-dark-7)',
                      border: '1px solid var(--mantine-color-dark-4)',
                      borderRadius: 8,
                    }}
                  />
                  <ReferenceLine y={0} stroke="var(--mantine-color-dark-3)" />
                  <Area
                    type="monotone"
                    dataKey="pnl"
                    stroke="var(--mantine-color-blue-6)"
                    fill="url(#pnlGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Box h={260} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text c="dimmed" size="sm">No closed trades yet. Import or add trades to see your equity curve.</Text>
              </Box>
            )}
          </Paper>
        </Grid.Col>

        {/* Win/Loss Ring + Streak */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            <Paper p="md" radius="md" withBorder>
              <Text fw={600} mb="md">Win / Loss Split</Text>
              <Group justify="center">
                <RingProgress
                  size={140}
                  thickness={14}
                  sections={[
                    { value: stats?.winRate ?? 0, color: 'teal' },
                    { value: 100 - (stats?.winRate ?? 0), color: 'red' },
                  ]}
                  label={
                    <Text ta="center" fw={700} size="lg">
                      {(stats?.winRate ?? 0).toFixed(0)}%
                    </Text>
                  }
                />
              </Group>
              <Group justify="center" gap="xl" mt="sm">
                <Stack gap={2} align="center">
                  <ThemeIcon color="teal" variant="light" size="sm">
                    <IconTrendingUp size={12} />
                  </ThemeIcon>
                  <Text size="xs" c="dimmed">Avg Win</Text>
                  <Text size="sm" fw={600} c="teal">+{fmt(stats?.avgWin ?? 0)}</Text>
                </Stack>
                <Stack gap={2} align="center">
                  <ThemeIcon color="red" variant="light" size="sm">
                    <IconTrendingDown size={12} />
                  </ThemeIcon>
                  <Text size="xs" c="dimmed">Avg Loss</Text>
                  <Text size="sm" fw={600} c="red">-{fmt(stats?.avgLoss ?? 0)}</Text>
                </Stack>
              </Group>
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Text fw={600} mb="md">Streaks</Text>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Current</Text>
                  <Badge
                    color={(stats?.currentStreak ?? 0) >= 0 ? 'teal' : 'red'}
                    variant="light"
                  >
                    {(stats?.currentStreak ?? 0) >= 0 ? '+' : ''}{stats?.currentStreak ?? 0}
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Best Win Streak</Text>
                  <Badge color="teal" variant="light">{stats?.longestWinStreak ?? 0}</Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Worst Loss Streak</Text>
                  <Badge color="red" variant="light">{stats?.longestLossStreak ?? 0}</Badge>
                </Group>
                <Divider />
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Best Trade</Text>
                  <Text size="sm" c="teal" fw={600}>+{fmt(stats?.bestTrade ?? 0)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Worst Trade</Text>
                  <Text size="sm" c="red" fw={600}>-{fmt(Math.abs(stats?.worstTrade ?? 0))}</Text>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Daily P&L Bars */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper p="md" radius="md" withBorder>
            <Text fw={600} mb="md">Daily P&L — Last 30 Days</Text>
            {dailyBars.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--mantine-color-dimmed)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="var(--mantine-color-dimmed)" />
                  <Tooltip
                    formatter={(v) => [`${currency === 'GBP' ? '£' : '$'}${Number(v).toFixed(2)}`, 'P&L'] as [string, string]}
                    contentStyle={{
                      background: 'var(--mantine-color-dark-7)',
                      border: '1px solid var(--mantine-color-dark-4)',
                      borderRadius: 8,
                    }}
                  />
                  <ReferenceLine y={0} stroke="var(--mantine-color-dark-3)" />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {dailyBars.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.pnl >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box h={200} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text c="dimmed" size="sm">No trades in the last 30 days.</Text>
              </Box>
            )}
          </Paper>
        </Grid.Col>

        {/* Recent Trades */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" radius="md" withBorder h="100%">
            <Text fw={600} mb="md">Recent Trades</Text>
            <Stack gap="xs">
              {recentTrades.length === 0 && (
                <Text c="dimmed" size="sm">No trades yet.</Text>
              )}
              {recentTrades.map((trade) => (
                <Group key={trade.id} justify="space-between" py={4}>
                  <Stack gap={0}>
                    <Text size="sm" fw={500}>{trade.symbol}</Text>
                    <Text size="xs" c="dimmed">
                      {trade.direction}{' '}
                      {trade.entry_date ? format(new Date(trade.entry_date), 'dd MMM HH:mm') : ''}
                    </Text>
                  </Stack>
                  <Badge
                    color={(trade.net_pnl ?? 0) >= 0 ? 'teal' : 'red'}
                    variant="light"
                    size="sm"
                  >
                    {(trade.net_pnl ?? 0) >= 0 ? '+' : ''}
                    {fmt(trade.net_pnl ?? 0)}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
