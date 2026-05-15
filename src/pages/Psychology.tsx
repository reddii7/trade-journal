import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Title,
  Grid,
  Paper,
  Text,
  Stack,
  Badge,
  Button,
  Group,
  Slider,
  Select,
  Textarea,
  Switch,
  Progress,
  Tabs,
  ActionIcon,
  Modal,
  Table,
  ThemeIcon,
  SimpleGrid,
  Divider,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { format } from 'date-fns';
import { IconBrain, IconPlus, IconTrash, IconCheck } from '@tabler/icons-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { PsychLog, TradingRule, EmotionType } from '@/types/database';

const EMOTIONS: { value: EmotionType; label: string; color: string; group: string }[] = [
  { value: 'CONFIDENT', label: 'Confident', color: 'teal', group: 'Positive' },
  { value: 'CALM', label: 'Calm', color: 'teal', group: 'Positive' },
  { value: 'FOCUSED', label: 'Focused', color: 'blue', group: 'Positive' },
  { value: 'DISCIPLINED', label: 'Disciplined', color: 'blue', group: 'Positive' },
  { value: 'NERVOUS', label: 'Nervous', color: 'orange', group: 'Cautious' },
  { value: 'ANXIOUS', label: 'Anxious', color: 'orange', group: 'Cautious' },
  { value: 'FEARFUL', label: 'Fearful', color: 'red', group: 'Negative' },
  { value: 'GREEDY', label: 'Greedy', color: 'red', group: 'Negative' },
  { value: 'FOMO', label: 'FOMO', color: 'red', group: 'Negative' },
  { value: 'REVENGE', label: 'Revenge Trading', color: 'red', group: 'Negative' },
  { value: 'IMPULSIVE', label: 'Impulsive', color: 'orange', group: 'Negative' },
  { value: 'EUPHORIC', label: 'Euphoric', color: 'yellow', group: 'Cautious' },
  { value: 'FRUSTRATED', label: 'Frustrated', color: 'orange', group: 'Negative' },
  { value: 'BORED', label: 'Bored', color: 'gray', group: 'Negative' },
  { value: 'TIRED', label: 'Tired', color: 'gray', group: 'Negative' },
];

export default function Psychology() {
  const { user } = useAuth();
  const [logOpened, { open: openLog, close: closeLog }] = useDisclosure(false);
  const [ruleOpened, { open: openRule, close: closeRule }] = useDisclosure(false);

  const [logs, setLogs] = useState<PsychLog[]>([]);
  const [rules, setRules] = useState<TradingRule[]>([]);

  // New log form
  const [emotion, setEmotion] = useState<EmotionType | null>(null);
  const [disciplineScore, setDisciplineScore] = useState(7);
  const [focusScore, setFocusScore] = useState(7);
  const [confidenceScore, setConfidenceScore] = useState(7);
  const [stressLevel, setStressLevel] = useState(3);
  const [followedRules, setFollowedRules] = useState(true);
  const [logNotes, setLogNotes] = useState('');
  const [logPhase, setLogPhase] = useState<'PRE' | 'DURING' | 'POST'>('PRE');
  const [saving, setSaving] = useState(false);

  // New rule form
  const [ruleText, setRuleText] = useState('');
  const [ruleCategory, setRuleCategory] = useState('GENERAL');

  // Trades joined with logs for emotion vs pnl analysis
  const [emotionPnlData, setEmotionPnlData] = useState<
    { emotion: string; avgPnl: number; count: number; winRate: number }[]
  >([]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [{ data: logsData }, { data: rulesData }] = await Promise.all([
      sb
        .from('psych_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      sb
        .from('trading_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order'),
    ]);
    setLogs((logsData as PsychLog[]) || []);
    setRules((rulesData as TradingRule[]) || []);

    // Compute emotion vs P&L
    const tradesWithLogs = await sb
      .from('psych_logs')
      .select('emotion, trades(net_pnl)')
      .eq('user_id', user.id)
      .not('trade_id', 'is', null);

    if (tradesWithLogs.data) {
      const byEmotion: Record<string, number[]> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of tradesWithLogs.data as any[]) {
        if (!row.emotion || !row.trades) continue;
        if (!byEmotion[row.emotion]) byEmotion[row.emotion] = [];
        byEmotion[row.emotion].push(row.trades.net_pnl ?? 0);
      }
      setEmotionPnlData(
        Object.entries(byEmotion).map(([emotion, pnls]) => ({
          emotion,
          avgPnl: pnls.reduce((s, v) => s + v, 0) / pnls.length,
          count: pnls.length,
          winRate: (pnls.filter((p) => p > 0).length / pnls.length) * 100,
        }))
      );
    }
  };

  const saveLog = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('psych_logs').insert({
        user_id: user.id,
        emotion,
        discipline_score: disciplineScore,
        focus_score: focusScore,
        confidence_score: confidenceScore,
        stress_level: stressLevel,
        followed_rules: followedRules,
        notes: logNotes || null,
        log_phase: logPhase,
        log_date: format(new Date(), 'yyyy-MM-dd'),
      });
      await loadData();
      closeLog();
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async () => {
    if (!user || !ruleText) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('trading_rules').insert({
      user_id: user.id,
      rule_text: ruleText,
      category: ruleCategory,
      sort_order: rules.length,
    });
    setRuleText('');
    await loadData();
    closeRule();
  };

  const deleteRule = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('trading_rules').delete().eq('id', id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  // Trend data: last 30 logs
  const trendData = useMemo(() => {
    return [...logs].reverse().slice(-30).map((log) => ({
      date: format(new Date(log.created_at), 'dd MMM'),
      discipline: log.discipline_score,
      focus: log.focus_score,
      confidence: log.confidence_score,
      stress: log.stress_level,
    }));
  }, [logs]);

  // Compliance rate
  const complianceRate = useMemo(() => {
    if (logs.length === 0) return 0;
    return (logs.filter((l) => l.followed_rules).length / logs.length) * 100;
  }, [logs]);

  // Radar data for last 10 logs average
  const radarData = useMemo(() => {
    const recent = logs.slice(0, 10);
    if (!recent.length) return [];
    const avg = (key: keyof PsychLog) =>
      recent.reduce((s, l) => s + ((l[key] as number) || 0), 0) / recent.length;
    return [
      { subject: 'Discipline', value: avg('discipline_score'), fullMark: 10 },
      { subject: 'Focus', value: avg('focus_score'), fullMark: 10 },
      { subject: 'Confidence', value: avg('confidence_score'), fullMark: 10 },
      { subject: 'Calm (inv.)', value: 10 - avg('stress_level'), fullMark: 10 },
    ];
  }, [logs]);

  const RULE_CATEGORIES = ['ENTRY', 'EXIT', 'RISK_MANAGEMENT', 'PSYCHOLOGY', 'GENERAL', 'PRE_TRADE', 'POST_TRADE'];

  return (
    <Box p="xl">
      <Group justify="space-between" mb="xl">
        <Group>
          <ThemeIcon size="lg" variant="light" color="violet">
            <IconBrain size={20} />
          </ThemeIcon>
          <Title order={2}>Psychology & Discipline</Title>
        </Group>
        <Group>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={openRule}>
            Add Rule
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={openLog}>
            Log State
          </Button>
        </Group>
      </Group>

      <Tabs defaultValue="overview">
        <Tabs.List mb="xl">
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="emotions">Emotion Analysis</Tabs.Tab>
          <Tabs.Tab value="rules">Trading Rules</Tabs.Tab>
          <Tabs.Tab value="history">Log History</Tabs.Tab>
        </Tabs.List>

        {/* ─── Overview ─── */}
        <Tabs.Panel value="overview">
          <Grid gap="xl">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper p="md" radius="md" withBorder>
                <Text fw={600} mb="md">Psychological Profile (Last 10)</Text>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 10]} tick={false} />
                    <Radar
                      name="Scores"
                      dataKey="value"
                      stroke="var(--mantine-color-blue-6)"
                      fill="var(--mantine-color-blue-6)"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 8 }}>
              <Stack gap="md">
                <SimpleGrid cols={2}>
                  <Paper p="md" radius="md" withBorder>
                    <Text size="xs" c="dimmed" mb="xs">Rule Compliance</Text>
                    <Text fw={700} size="xl" mb="xs">
                      {complianceRate.toFixed(1)}%
                    </Text>
                    <Progress
                      value={complianceRate}
                      color={complianceRate >= 80 ? 'teal' : complianceRate >= 60 ? 'yellow' : 'red'}
                      size="sm"
                    />
                    <Text size="xs" c="dimmed" mt="xs">
                      {logs.filter((l) => l.followed_rules).length} / {logs.length} sessions followed rules
                    </Text>
                  </Paper>
                  <Paper p="md" radius="md" withBorder>
                    <Text size="xs" c="dimmed" mb="xs">Total Log Entries</Text>
                    <Text fw={700} size="xl">{logs.length}</Text>
                    <Text size="xs" c="dimmed">
                      Recent: {logs[0] ? format(new Date(logs[0].created_at), 'dd MMM HH:mm') : '—'}
                    </Text>
                  </Paper>
                </SimpleGrid>

                <Paper p="md" radius="md" withBorder>
                  <Text fw={600} mb="md">Score Trend (Last 30 Logs)</Text>
                  {trendData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 9 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="discipline" stroke="var(--mantine-color-blue-6)" strokeWidth={2} dot={false} name="Discipline" />
                        <Line type="monotone" dataKey="focus" stroke="var(--mantine-color-teal-6)" strokeWidth={2} dot={false} name="Focus" />
                        <Line type="monotone" dataKey="confidence" stroke="var(--mantine-color-violet-6)" strokeWidth={2} dot={false} name="Confidence" />
                        <Line type="monotone" dataKey="stress" stroke="var(--mantine-color-red-6)" strokeWidth={1} dot={false} strokeDasharray="4 4" name="Stress" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Text c="dimmed" size="sm" ta="center" py="lg">
                      Log your emotional state to see trends here.
                    </Text>
                  )}
                </Paper>
              </Stack>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* ─── Emotion Analysis ─── */}
        <Tabs.Panel value="emotions">
          <Grid gap="xl">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper p="md" radius="md" withBorder>
                <Text fw={600} mb="md">Avg P&L by Emotional State</Text>
                {emotionPnlData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={emotionPnlData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                      <XAxis type="number" tickFormatter={(v) => `£${v.toFixed(0)}`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="emotion" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip formatter={(v) => [`£${(v as number).toFixed(2)}`, 'Avg P&L'] as [string, string]} />
                      <Bar dataKey="avgPnl" radius={[0, 3, 3, 0]}>
                        {emotionPnlData.map((d, i) => (
                          <Cell
                            key={i}
                            fill={d.avgPnl >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Text c="dimmed" size="sm" ta="center" py="xl">
                    Link psych logs to trades to see emotion vs P&L data.
                  </Text>
                )}
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper p="md" radius="md" withBorder>
                <Text fw={600} mb="md">Win Rate by Emotional State</Text>
                {emotionPnlData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={emotionPnlData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="emotion" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip formatter={(v) => [`${(v as number).toFixed(1)}%`, 'Win Rate'] as [string, string]} />
                      <Bar dataKey="winRate" fill="var(--mantine-color-blue-6)" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Text c="dimmed" size="sm" ta="center" py="xl">
                    No linked data yet.
                  </Text>
                )}
              </Paper>
            </Grid.Col>

            {/* Emotion frequency */}
            <Grid.Col span={12}>
              <Paper p="md" radius="md" withBorder>
                <Text fw={600} mb="md">Emotion Frequency</Text>
                <Group gap="md" wrap="wrap">
                  {EMOTIONS.map((em) => {
                    const count = logs.filter((l) => l.emotion === em.value).length;
                    if (count === 0) return null;
                    return (
                      <Badge
                        key={em.value}
                        color={em.color}
                        size="lg"
                        variant="light"
                      >
                        {em.label}: {count}
                      </Badge>
                    );
                  })}
                </Group>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* ─── Trading Rules Checklist ─── */}
        <Tabs.Panel value="rules">
          <Stack gap="md">
            {RULE_CATEGORIES.map((cat) => {
              const catRules = rules.filter((r) => r.category === cat && r.is_active);
              if (catRules.length === 0) return null;
              return (
                <Paper key={cat} p="md" radius="md" withBorder>
                  <Text fw={600} size="sm" c="dimmed" mb="sm" tt="uppercase">
                    {cat.replace('_', ' ')}
                  </Text>
                  <Stack gap="xs">
                    {catRules.map((rule) => (
                      <Group key={rule.id} justify="space-between">
                        <Group gap="sm">
                          <ThemeIcon size="sm" color="blue" variant="light" radius="sm">
                            <IconCheck size={12} />
                          </ThemeIcon>
                          <Text size="sm">{rule.rule_text}</Text>
                        </Group>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => deleteRule(rule.id)}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Group>
                    ))}
                  </Stack>
                </Paper>
              );
            })}
            {rules.length === 0 && (
              <Text c="dimmed" ta="center" py="xl">
                No trading rules yet. Add rules to track your compliance.
              </Text>
            )}
          </Stack>
        </Tabs.Panel>

        {/* ─── Log History ─── */}
        <Tabs.Panel value="history">
          <Paper radius="md" withBorder>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Phase</Table.Th>
                  <Table.Th>Emotion</Table.Th>
                  <Table.Th>Discipline</Table.Th>
                  <Table.Th>Focus</Table.Th>
                  <Table.Th>Confidence</Table.Th>
                  <Table.Th>Stress</Table.Th>
                  <Table.Th>Rules</Table.Th>
                  <Table.Th>Notes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Text ta="center" c="dimmed" py="xl">No logs yet.</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {logs.map((log) => {
                  const em = EMOTIONS.find((e) => e.value === log.emotion);
                  return (
                    <Table.Tr key={log.id}>
                      <Table.Td>
                        <Text size="sm">{format(new Date(log.created_at), 'dd MMM HH:mm')}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="outline">{log.log_phase}</Badge>
                      </Table.Td>
                      <Table.Td>
                        {em && (
                          <Badge size="sm" color={em.color} variant="light">{em.label}</Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600} c={
                          (log.discipline_score ?? 0) >= 7 ? 'teal' :
                          (log.discipline_score ?? 0) >= 5 ? 'yellow' : 'red'
                        }>
                          {log.discipline_score ?? '—'}/10
                        </Text>
                      </Table.Td>
                      <Table.Td>{log.focus_score ?? '—'}/10</Table.Td>
                      <Table.Td>{log.confidence_score ?? '—'}/10</Table.Td>
                      <Table.Td>
                        <Text size="sm" c={(log.stress_level ?? 0) >= 7 ? 'red' : undefined}>
                          {log.stress_level ?? '—'}/10
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" color={log.followed_rules ? 'teal' : 'red'}>
                          {log.followed_rules ? 'Yes' : 'No'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed" lineClamp={1}>{log.notes || '—'}</Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {/* Log State Modal */}
      <Modal
        opened={logOpened}
        onClose={closeLog}
        title="Log Psychological State"
        size="lg"
        centered
      >
        <Stack gap="md">
          <Group grow>
            <Select
              label="Phase"
              data={[
                { value: 'PRE', label: 'Pre-Trade' },
                { value: 'DURING', label: 'During Trade' },
                { value: 'POST', label: 'Post-Trade' },
              ]}
              value={logPhase}
              onChange={(v) => setLogPhase((v || 'PRE') as typeof logPhase)}
            />
            <Select
              label="Dominant Emotion"
              data={EMOTIONS.map((e) => ({ value: e.value, label: e.label, group: e.group }))}
              value={emotion}
              onChange={(v) => setEmotion(v as EmotionType)}
              searchable
            />
          </Group>

          <Box>
            <Text size="sm" mb="xs">Discipline Score: <strong>{disciplineScore}/10</strong></Text>
            <Slider
              value={disciplineScore}
              onChange={setDisciplineScore}
              min={1} max={10} step={1}
              color={disciplineScore >= 7 ? 'teal' : disciplineScore >= 5 ? 'yellow' : 'red'}
              marks={[{value: 1, label:'1'},{value:5,label:'5'},{value:10,label:'10'}]}
            />
          </Box>
          <Box>
            <Text size="sm" mb="xs">Focus Score: <strong>{focusScore}/10</strong></Text>
            <Slider value={focusScore} onChange={setFocusScore} min={1} max={10} step={1}
              color="blue"
              marks={[{value: 1, label:'1'},{value:5,label:'5'},{value:10,label:'10'}]}
            />
          </Box>
          <Box>
            <Text size="sm" mb="xs">Confidence Score: <strong>{confidenceScore}/10</strong></Text>
            <Slider value={confidenceScore} onChange={setConfidenceScore} min={1} max={10} step={1}
              color="violet"
              marks={[{value: 1, label:'1'},{value:5,label:'5'},{value:10,label:'10'}]}
            />
          </Box>
          <Box>
            <Text size="sm" mb="xs">Stress Level: <strong>{stressLevel}/10</strong></Text>
            <Slider value={stressLevel} onChange={setStressLevel} min={1} max={10} step={1}
              color={stressLevel >= 7 ? 'red' : stressLevel >= 5 ? 'orange' : 'teal'}
              marks={[{value: 1, label:'1'},{value:5,label:'5'},{value:10,label:'10'}]}
            />
          </Box>

          <Switch
            label="Followed my trading rules today"
            checked={followedRules}
            onChange={(e) => setFollowedRules(e.currentTarget.checked)}
          />

          <Textarea
            label="Notes"
            placeholder="Any additional thoughts on your mental state..."
            value={logNotes}
            onChange={(e) => setLogNotes(e.target.value)}
            rows={3}
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeLog}>Cancel</Button>
            <Button onClick={saveLog} loading={saving}>Save Log</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Add Rule Modal */}
      <Modal
        opened={ruleOpened}
        onClose={closeRule}
        title="Add Trading Rule"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Rule"
            placeholder="e.g. Never risk more than 1% per trade"
            value={ruleText}
            onChange={(e) => setRuleText(e.target.value)}
            required
          />
          <Select
            label="Category"
            data={RULE_CATEGORIES.map((c) => ({ value: c, label: c.replace('_', ' ') }))}
            value={ruleCategory}
            onChange={(v) => setRuleCategory(v || 'GENERAL')}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeRule}>Cancel</Button>
            <Button onClick={saveRule} disabled={!ruleText}>Add Rule</Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
