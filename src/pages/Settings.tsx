import { useState, useEffect } from 'react';
import {
  Box,
  Title,
  Paper,
  Text,
  TextInput,
  NumberInput,
  Select,
  Button,
  Group,
  Stack,
  Badge,
  Alert,
  Divider,
  Switch,
  Tabs,
  ThemeIcon,
  SimpleGrid,
  Anchor,
  Code,
} from '@mantine/core';
import {
  IconSettings,
  IconApi,
  IconCheck,
  IconAlertCircle,
  IconExternalLink,
  IconRefresh,
  IconUser,
  IconNotebook,
  IconTrash,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { igService } from '@/lib/igService';
import { useJournals } from '@/hooks/useJournals';
import type { Profile, Journal } from '@/types/database';

export default function Settings() {
  const { profile, user, refreshProfile } = useAuth();
  const { journals, createJournal } = useJournals();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [connectionDetail, setConnectionDetail] = useState('');

  // Profile form
  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState('Europe/London');
  const [currency, setCurrency] = useState('GBP');
  const [defaultRiskPercent, setDefaultRiskPercent] = useState<number | string>(1);
  const [defaultAccountSize, setDefaultAccountSize] = useState<number | string>(10000);
  const [igAccountType, setIgAccountType] = useState<'DEMO' | 'LIVE'>('DEMO');

  // Journal form
  const [newJournalName, setNewJournalName] = useState('');
  const [newJournalDesc, setNewJournalDesc] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setTimezone(profile.timezone || 'Europe/London');
      setCurrency(profile.currency || 'GBP');
      setDefaultRiskPercent(profile.default_risk_percent ?? 1);
      setDefaultAccountSize(profile.default_account_size ?? 10000);
      setIgAccountType(profile.ig_account_type || 'DEMO');
    }
  }, [profile]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('profiles')
        .update({
          full_name: fullName,
          timezone,
          currency,
          default_risk_percent: Number(defaultRiskPercent),
          default_account_size: Number(defaultAccountSize),
          ig_account_type: igAccountType,
        })
        .eq('id', user.id);

      if (error) throw error;
      await refreshProfile();
      notifications.show({ message: 'Profile saved', color: 'green', icon: <IconCheck size={14} /> });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : 'Save failed',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setConnectionStatus('idle');
    try {
      const result = await igService.testConnection(igAccountType);
      if (result.success) {
        setConnectionStatus('ok');
        setConnectionDetail(`Connected to IG ${igAccountType} environment`);

        // Sync accounts
        const accountsResult = await igService.getAccounts(igAccountType);
        if (accountsResult.accounts?.length && user) {
          for (const acc of accountsResult.accounts) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any).from('accounts').upsert({
                user_id: user.id,
                ig_account_id: acc.accountId,
                account_name: acc.accountName,
                account_type: acc.accountType,
                currency: acc.currency,
                balance: acc.balance?.balance ?? 0,
                available: acc.balance?.available ?? 0,
                synced_at: new Date().toISOString(),
              }, { onConflict: 'user_id,ig_account_id' });
            }

          // Mark as connected
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('profiles')
            .update({
              ig_connected: true,
              ig_account_id: accountsResult.accounts[0]?.accountId,
              ig_account_type: igAccountType,
            })
            .eq('id', user.id);
          await refreshProfile();
        }
        notifications.show({ message: 'IG connection verified!', color: 'green' });
      }
    } catch (err) {
      setConnectionStatus('error');
      setConnectionDetail(err instanceof Error ? err.message : 'Connection failed');
      notifications.show({
        message: 'Connection failed. Check your IG credentials in Netlify.',
        color: 'red',
      });
    } finally {
      setTesting(false);
    }
  };

  const addJournal = async () => {
    if (!newJournalName) return;
    try {
      await createJournal(newJournalName, newJournalDesc);
      setNewJournalName('');
      setNewJournalDesc('');
      notifications.show({ message: 'Journal created', color: 'green' });
    } catch (err) {
      notifications.show({ message: 'Failed to create journal', color: 'red' });
    }
  };

  const TIMEZONES = [
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Australia/Sydney',
  ];

  return (
    <Box p="xl">
      <Group mb="xl">
        <ThemeIcon size="lg" variant="light" color="gray">
          <IconSettings size={20} />
        </ThemeIcon>
        <Title order={2}>Settings</Title>
      </Group>

      <Tabs defaultValue="profile">
        <Tabs.List mb="xl">
          <Tabs.Tab value="profile" leftSection={<IconUser size={14} />}>Profile</Tabs.Tab>
          <Tabs.Tab value="ig" leftSection={<IconApi size={14} />}>IG Index API</Tabs.Tab>
          <Tabs.Tab value="journals" leftSection={<IconNotebook size={14} />}>Journals</Tabs.Tab>
        </Tabs.List>

        {/* ─── Profile ─── */}
        <Tabs.Panel value="profile">
          <Paper p="xl" radius="md" withBorder maw={600}>
            <Stack gap="md">
              <TextInput
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <TextInput
                label="Email"
                value={profile?.email || user?.email || ''}
                disabled
                description="Email is managed through authentication"
              />
              <Select
                label="Timezone"
                data={TIMEZONES}
                value={timezone}
                onChange={(v) => setTimezone(v || 'Europe/London')}
                searchable
              />
              <Select
                label="Base Currency"
                data={[
                  { value: 'GBP', label: 'GBP (£)' },
                  { value: 'USD', label: 'USD ($)' },
                  { value: 'EUR', label: 'EUR (€)' },
                ]}
                value={currency}
                onChange={(v) => setCurrency(v || 'GBP')}
              />

              <Divider label="Risk Defaults" />

              <SimpleGrid cols={2}>
                <NumberInput
                  label="Default Risk %"
                  description="Per-trade risk as % of account"
                  value={defaultRiskPercent}
                  onChange={setDefaultRiskPercent}
                  min={0.1}
                  max={100}
                  decimalScale={2}
                  suffix="%"
                />
                <NumberInput
                  label="Account Size"
                  description="Used for risk calculations"
                  value={defaultAccountSize}
                  onChange={setDefaultAccountSize}
                  min={0}
                  decimalScale={2}
                  prefix="£"
                />
              </SimpleGrid>

              <Button onClick={saveProfile} loading={saving}>
                Save Profile
              </Button>
            </Stack>
          </Paper>
        </Tabs.Panel>

        {/* ─── IG Index API ─── */}
        <Tabs.Panel value="ig">
          <Stack gap="xl" maw={700}>
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Security Notice"
              color="blue"
              variant="light"
            >
              Your IG API credentials are stored as Netlify environment variables and are
              never exposed to the browser. Set them in the Netlify dashboard:
              {' '}<strong>Site settings → Environment variables</strong>
            </Alert>

            <Paper p="xl" radius="md" withBorder>
              <Stack gap="md">
                <Text fw={600} size="lg">Connection Status</Text>
                <Group>
                  <Badge
                    size="lg"
                    color={
                      profile?.ig_connected ? 'green' :
                      connectionStatus === 'error' ? 'red' : 'gray'
                    }
                    variant="dot"
                  >
                    {profile?.ig_connected ? 'Connected' : 'Not connected'}
                  </Badge>
                  {profile?.ig_account_type && (
                    <Badge variant="outline">{profile.ig_account_type}</Badge>
                  )}
                  {connectionDetail && (
                    <Text size="sm" c={connectionStatus === 'ok' ? 'teal' : 'red'}>
                      {connectionDetail}
                    </Text>
                  )}
                </Group>

                <Select
                  label="Account Environment"
                  description="Switch between IG DEMO and LIVE accounts"
                  data={[
                    { value: 'DEMO', label: 'DEMO (Paper trading account)' },
                    { value: 'LIVE', label: 'LIVE (Real money account)' },
                  ]}
                  value={igAccountType}
                  onChange={(v) => setIgAccountType((v || 'DEMO') as 'DEMO' | 'LIVE')}
                />

                <Button
                  leftSection={<IconRefresh size={16} />}
                  onClick={testConnection}
                  loading={testing}
                  variant="light"
                >
                  Test Connection
                </Button>
              </Stack>
            </Paper>

            <Paper p="xl" radius="md" withBorder>
              <Stack gap="md">
                <Text fw={600} size="lg">Required Environment Variables</Text>
                <Text size="sm" c="dimmed">
                  Set these in your Netlify dashboard under Site settings → Environment variables.
                  Do NOT put real credentials in any file that gets committed to git.
                </Text>

                <Stack gap="xs">
                  {[
                    { key: 'IG_API_KEY', desc: 'Your IG Labs API key (from MyIG → IG Labs API)' },
                    { key: 'IG_USERNAME', desc: 'Your IG account username (email)' },
                    { key: 'IG_PASSWORD', desc: 'Your IG account password' },
                  ].map((env) => (
                    <Group key={env.key} gap="md" align="flex-start">
                      <Code>{env.key}</Code>
                      <Text size="sm" c="dimmed">{env.desc}</Text>
                    </Group>
                  ))}
                </Stack>

                <Anchor
                  href="https://labs.ig.com/gettingstarted"
                  target="_blank"
                  rel="noopener noreferrer"
                  size="sm"
                >
                  Get your IG API key at labs.ig.com <IconExternalLink size={12} style={{ display: 'inline' }} />
                </Anchor>
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>

        {/* ─── Journals ─── */}
        <Tabs.Panel value="journals">
          <Stack gap="xl" maw={600}>
            <Paper p="xl" radius="md" withBorder>
              <Text fw={600} mb="md">Create Journal</Text>
              <Stack gap="md">
                <TextInput
                  label="Name"
                  placeholder="e.g. Main Account, Indices Strategy"
                  value={newJournalName}
                  onChange={(e) => setNewJournalName(e.target.value)}
                />
                <TextInput
                  label="Description"
                  placeholder="Optional description"
                  value={newJournalDesc}
                  onChange={(e) => setNewJournalDesc(e.target.value)}
                />
                <Button
                  onClick={addJournal}
                  disabled={!newJournalName}
                >
                  Create Journal
                </Button>
              </Stack>
            </Paper>

            <Paper p="xl" radius="md" withBorder>
              <Text fw={600} mb="md">Your Journals</Text>
              <Stack gap="xs">
                {journals.length === 0 && (
                  <Text c="dimmed" size="sm">No journals yet. Create one above.</Text>
                )}
                {journals.map((journal) => (
                  <Group key={journal.id} justify="space-between" py="xs" style={{
                    borderBottom: '1px solid var(--mantine-color-dark-5)',
                  }}>
                    <Group gap="sm">
                      <Box
                        w={12}
                        h={12}
                        style={{
                          borderRadius: '50%',
                          background: journal.color || '#228be6',
                        }}
                      />
                      <Stack gap={0}>
                        <Text fw={500}>{journal.name}</Text>
                        {journal.description && (
                          <Text size="xs" c="dimmed">{journal.description}</Text>
                        )}
                      </Stack>
                    </Group>
                    {journal.is_default && (
                      <Badge size="xs" color="blue">Default</Badge>
                    )}
                  </Group>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
