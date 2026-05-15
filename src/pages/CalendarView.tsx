import { useState, useMemo } from 'react';
import {
  Box,
  Title,
  Group,
  Paper,
  Text,
  Stack,
  Badge,
  ActionIcon,
  Modal,
  Textarea,
  Select,
  Button,
  Divider,
  SimpleGrid,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronLeft,
  IconChevronRight,
  IconNotebook,
} from '@tabler/icons-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  getMonth,
  getYear,
  addMonths,
  subMonths,
} from 'date-fns';
import { useTrades } from '@/hooks/useTrades';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { TradeWithTags, DailyNote } from '@/types/database';

interface DayData {
  date: Date;
  trades: TradeWithTags[];
  pnl: number;
  tradeCount: number;
  isWinDay: boolean;
  isLossDay: boolean;
}

function buildCalendarGrid(year: number, month: number, trades: TradeWithTags[]): DayData[][] {
  const start = startOfWeek(startOfMonth(new Date(year, month)), { weekStartsOn: 1 });
  const end = endOfMonth(new Date(year, month));

  const weeks: DayData[][] = [];
  let day = start;

  while (day <= end || weeks[weeks.length - 1]?.length < 7) {
    const week: DayData[] = [];
    for (let i = 0; i < 7; i++) {
      const currentDay = addDays(day, i === 0 ? 0 : 0);
      const dayTrades = trades.filter(
        (t) => t.entry_date && isSameDay(new Date(t.entry_date), currentDay)
      );
      const pnl = dayTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
      week.push({
        date: currentDay,
        trades: dayTrades,
        pnl,
        tradeCount: dayTrades.length,
        isWinDay: pnl > 0 && dayTrades.length > 0,
        isLossDay: pnl < 0 && dayTrades.length > 0,
      });
    }
    weeks.push(week);
    day = addDays(day, 7);
    if (weeks.length > 6) break;
  }
  return weeks;
}

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [noteOpened, { open: openNote, close: closeNote }] = useDisclosure(false);
  const [dailyNote, setDailyNote] = useState<Partial<DailyNote>>({});
  const [savingNote, setSavingNote] = useState(false);
  const { user } = useAuth();

  const year = getYear(currentDate);
  const month = getMonth(currentDate);

  const { trades } = useTrades({
    status: 'CLOSED',
    dateFrom: startOfMonth(currentDate).toISOString(),
    dateTo: endOfMonth(currentDate).toISOString(),
  });

  const weeks = useMemo(() => buildCalendarGrid(year, month, trades), [year, month, trades]);

  const monthStats = useMemo(() => {
    const monthTrades = trades.filter((t) =>
      t.entry_date &&
      getMonth(new Date(t.entry_date)) === month &&
      getYear(new Date(t.entry_date)) === year
    );
    const pnl = monthTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
    const wins = monthTrades.filter((t) => (t.net_pnl ?? 0) > 0);
    const winDays = new Set(
      monthTrades
        .filter((t) => (t.net_pnl ?? 0) > 0 && t.entry_date)
        .map((t) => format(new Date(t.entry_date!), 'yyyy-MM-dd'))
    ).size;
    return {
      totalTrades: monthTrades.length,
      pnl,
      winRate: monthTrades.length ? (wins.length / monthTrades.length) * 100 : 0,
      winDays,
    };
  }, [trades, month, year]);

  const handleDayClick = async (day: DayData) => {
    if (!isSameMonth(day.date, currentDate)) return;
    setSelectedDay(day);

    if (user) {
      const dateStr = format(day.date, 'yyyy-MM-dd');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('daily_notes')
        .select('*')
        .eq('user_id', user.id)
        .eq('note_date', dateStr)
        .single();
      setDailyNote(data || { note_date: dateStr });
    }
  };

  const saveNote = async () => {
    if (!user || !dailyNote.note_date) return;
    setSavingNote(true);
    try {
      if (dailyNote.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('daily_notes').update(dailyNote).eq('id', dailyNote.id);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('daily_notes')
          .insert({ ...dailyNote, user_id: user.id })
          .select()
          .single();
        setDailyNote(data || dailyNote);
      }
    } finally {
      setSavingNote(false);
    }
  };

  const fmt = (v: number) => `£${Math.abs(v).toFixed(2)}`;

  return (
    <Box p="xl">
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <Title order={2}>Calendar</Title>
        <Group gap="xl">
          <SimpleGrid cols={4}>
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">Trades</Text>
              <Text fw={700}>{monthStats.totalTrades}</Text>
            </Stack>
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">Month P&L</Text>
              <Text fw={700} c={monthStats.pnl >= 0 ? 'teal' : 'red'}>
                {monthStats.pnl >= 0 ? '+' : ''}{fmt(monthStats.pnl)}
              </Text>
            </Stack>
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">Win Rate</Text>
              <Text fw={700}>{monthStats.winRate.toFixed(1)}%</Text>
            </Stack>
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">Win Days</Text>
              <Text fw={700} c="teal">{monthStats.winDays}</Text>
            </Stack>
          </SimpleGrid>
        </Group>
      </Group>

      {/* Month Navigation */}
      <Group justify="center" mb="md">
        <ActionIcon
          variant="subtle"
          onClick={() => setCurrentDate(subMonths(currentDate, 1))}
        >
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Text fw={700} size="xl" w={180} ta="center">
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        <ActionIcon
          variant="subtle"
          onClick={() => setCurrentDate(addMonths(currentDate, 1))}
        >
          <IconChevronRight size={18} />
        </ActionIcon>
      </Group>

      {/* Calendar Grid */}
      <Paper radius="md" withBorder p="sm">
        {/* Day headers */}
        <SimpleGrid cols={7} mb="xs">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <Text key={d} ta="center" size="xs" fw={600} c="dimmed" py="xs">
              {d}
            </Text>
          ))}
        </SimpleGrid>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <SimpleGrid cols={7} key={wi} mb="xs">
            {week.map((day, di) => {
              const isCurrentMonth = isSameMonth(day.date, currentDate);
              const isToday = isSameDay(day.date, new Date());
              const isSelected = selectedDay && isSameDay(day.date, selectedDay.date);

              let bg = 'transparent';
              if (day.isWinDay) bg = 'var(--mantine-color-teal-9)';
              if (day.isLossDay) bg = 'var(--mantine-color-red-9)';
              if (isSelected) bg = 'var(--mantine-color-blue-8)';

              return (
                <Box
                  key={di}
                  onClick={() => handleDayClick(day)}
                  style={{
                    minHeight: 80,
                    padding: 6,
                    borderRadius: 8,
                    background: bg,
                    border: isToday
                      ? '2px solid var(--mantine-color-blue-5)'
                      : '1px solid var(--mantine-color-dark-5)',
                    opacity: isCurrentMonth ? 1 : 0.3,
                    cursor: isCurrentMonth ? 'pointer' : 'default',
                    transition: 'all 0.15s',
                  }}
                >
                  <Text
                    size="xs"
                    fw={isToday ? 700 : 400}
                    c={isToday ? 'blue' : undefined}
                    mb={4}
                  >
                    {format(day.date, 'd')}
                  </Text>
                  {day.tradeCount > 0 && (
                    <Stack gap={2}>
                      <Text
                        size="xs"
                        fw={700}
                        c={day.pnl >= 0 ? 'teal' : 'red'}
                        style={{ lineHeight: 1 }}
                      >
                        {day.pnl >= 0 ? '+' : ''}{fmt(day.pnl)}
                      </Text>
                      <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>
                        {day.tradeCount}T
                      </Text>
                    </Stack>
                  )}
                </Box>
              );
            })}
          </SimpleGrid>
        ))}
      </Paper>

      {/* Legend */}
      <Group mt="sm" gap="md">
        <Group gap="xs">
          <Box w={12} h={12} style={{ borderRadius: 3, background: 'var(--mantine-color-teal-9)' }} />
          <Text size="xs" c="dimmed">Winning day</Text>
        </Group>
        <Group gap="xs">
          <Box w={12} h={12} style={{ borderRadius: 3, background: 'var(--mantine-color-red-9)' }} />
          <Text size="xs" c="dimmed">Losing day</Text>
        </Group>
        <Text size="xs" c="dimmed">Click a day to view trades & add notes</Text>
      </Group>

      {/* Day Detail Panel */}
      {selectedDay && (
        <Paper p="md" radius="md" withBorder mt="xl">
          <Group justify="space-between" mb="md">
            <Title order={4}>
              {format(selectedDay.date, 'EEEE, d MMMM yyyy')}
            </Title>
            <Group>
              <Badge
                color={selectedDay.pnl >= 0 ? 'teal' : selectedDay.pnl < 0 ? 'red' : 'gray'}
                size="lg"
                variant="light"
              >
                {selectedDay.pnl >= 0 ? '+' : ''}{fmt(selectedDay.pnl)}
              </Badge>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconNotebook size={14} />}
                onClick={openNote}
              >
                {dailyNote.id ? 'Edit Note' : 'Add Note'}
              </Button>
            </Group>
          </Group>

          {selectedDay.trades.length === 0 ? (
            <Text c="dimmed" size="sm">No trades on this day.</Text>
          ) : (
            <Stack gap="xs">
              {selectedDay.trades.map((trade) => (
                <Group key={trade.id} justify="space-between" py="xs" style={{
                  borderBottom: '1px solid var(--mantine-color-dark-5)',
                }}>
                  <Group gap="md">
                    <Badge color={trade.direction === 'BUY' ? 'teal' : 'red'} size="sm">
                      {trade.direction}
                    </Badge>
                    <Text fw={600}>{trade.symbol}</Text>
                    <Text size="sm" c="dimmed">
                      {trade.entry_date ? format(new Date(trade.entry_date), 'HH:mm') : ''}
                      {trade.exit_date ? ` → ${format(new Date(trade.exit_date), 'HH:mm')}` : ''}
                    </Text>
                    {trade.r_multiple != null && (
                      <Badge size="xs" color={trade.r_multiple >= 0 ? 'blue' : 'orange'} variant="outline">
                        {trade.r_multiple >= 0 ? '+' : ''}{trade.r_multiple.toFixed(1)}R
                      </Badge>
                    )}
                  </Group>
                  <Text fw={700} c={(trade.net_pnl ?? 0) >= 0 ? 'teal' : 'red'}>
                    {(trade.net_pnl ?? 0) >= 0 ? '+' : ''}{fmt(trade.net_pnl ?? 0)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}

          {dailyNote.pre_session_plan && (
            <>
              <Divider my="md" label="Pre-Session Plan" />
              <Text size="sm">{dailyNote.pre_session_plan}</Text>
            </>
          )}
          {dailyNote.post_session_reflection && (
            <>
              <Divider my="md" label="Post-Session Reflection" />
              <Text size="sm">{dailyNote.post_session_reflection}</Text>
            </>
          )}
        </Paper>
      )}

      {/* Daily Note Modal */}
      <Modal
        opened={noteOpened}
        onClose={closeNote}
        title={`Journal — ${selectedDay ? format(selectedDay.date, 'EEEE, d MMMM yyyy') : ''}`}
        size="lg"
        centered
      >
        <Stack gap="md">
          <Textarea
            label="Pre-Session Plan"
            placeholder="What's the plan for today? Key levels, market bias, setups to watch..."
            value={dailyNote.pre_session_plan || ''}
            onChange={(e) => setDailyNote({ ...dailyNote, pre_session_plan: e.target.value })}
            rows={3}
          />
          <Textarea
            label="Market Observations"
            placeholder="What is the market doing? Macro context, news events..."
            value={dailyNote.market_observations || ''}
            onChange={(e) => setDailyNote({ ...dailyNote, market_observations: e.target.value })}
            rows={3}
          />
          <Textarea
            label="Post-Session Reflection"
            placeholder="How did it go? Did I follow my plan? What worked / didn't work?"
            value={dailyNote.post_session_reflection || ''}
            onChange={(e) => setDailyNote({ ...dailyNote, post_session_reflection: e.target.value })}
            rows={3}
          />
          <Textarea
            label="Lessons Learned"
            placeholder="Key takeaways for tomorrow..."
            value={dailyNote.lessons_learned || ''}
            onChange={(e) => setDailyNote({ ...dailyNote, lessons_learned: e.target.value })}
            rows={2}
          />
          <Select
            label="Session Grade"
            data={['A', 'B', 'C', 'D', 'F']}
            value={dailyNote.grade || null}
            onChange={(v) => setDailyNote({ ...dailyNote, grade: (v as DailyNote['grade']) || undefined })}
            placeholder="Grade your session"
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeNote}>Cancel</Button>
            <Button onClick={async () => { await saveNote(); closeNote(); }} loading={savingNote}>
              Save Note
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
