import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppShell as MantineAppShell,
  Burger,
  NavLink,
  Stack,
  Group,
  Text,
  Avatar,
  ActionIcon,
  Tooltip,
  useMantineColorScheme,
  Badge,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconLayoutDashboard,
  IconList,
  IconChartBar,
  IconCalendar,
  IconBrain,
  IconSettings,
  IconChartLine,
  IconSun,
  IconMoon,
  IconLogout,
  IconRefresh,
} from '@tabler/icons-react';
import { useAuth } from '@/contexts/AuthContext';
import { notifications } from '@mantine/notifications';
import { igService } from '@/lib/igService';
import { supabase } from '@/lib/supabase';

const navItems = [
  { label: 'Dashboard', icon: IconLayoutDashboard, path: '/' },
  { label: 'Trade Log', icon: IconList, path: '/trades' },
  { label: 'Analytics', icon: IconChartBar, path: '/analytics' },
  { label: 'Calendar', icon: IconCalendar, path: '/calendar' },
  { label: 'Psychology', icon: IconBrain, path: '/psychology' },
  { label: 'Settings', icon: IconSettings, path: '/settings' },
];

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!user || !profile) return;
    setSyncing(true);
    try {
      const accountType = profile.ig_account_type || 'DEMO';
      const result = await igService.getTransactionHistory(accountType, undefined, undefined, 100, 1);
      const transactions = result.transactions || [];

      if (transactions.length === 0) {
        notifications.show({ title: 'Sync', message: 'No new transactions found.', color: 'blue' });
        return;
      }

      // Import transactions as trades using direct REST fetch
      const { igTransactionToTrade } = await import('../../lib/igService');
      const { getAuthToken, sbInsert } = await import('../../lib/supabaseFetch');
      const token = getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const SURL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
      const SKEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      // Fetch existing transaction IDs in bulk
      const existingRes = await fetch(
        `${SURL}/rest/v1/trades?select=ig_transaction_id&user_id=eq.${user.id}`,
        { headers: { apikey: SKEY, Authorization: `Bearer ${token}` } }
      );
      const existingData: { ig_transaction_id: string | null }[] = existingRes.ok
        ? await existingRes.json() : [];
      const existingIds = new Set(existingData.map(r => r.ig_transaction_id).filter(Boolean));

      const newTrades = transactions
        .map((tx) => igTransactionToTrade(tx))
        .filter((t) => t.ig_transaction_id && !existingIds.has(t.ig_transaction_id!))
        .map((t) => ({ ...t, user_id: user.id }));

      let newCount = 0;
      if (newTrades.length > 0) {
        await sbInsert('trades', newTrades as Record<string, unknown>[]);
        newCount = newTrades.length;
      }

      notifications.show({
        title: 'Sync Complete',
        message: `${newCount} new trade(s) imported from IG.`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        title: 'Sync Failed',
        message: err instanceof Error ? err.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <MantineAppShell
      header={{ height: 60 }}
      navbar={{
        width: 220,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding={0}
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Group gap="xs">
              <IconChartLine size={24} color="var(--mantine-color-blue-5)" />
              <Text fw={700} size="lg">TradeJournal</Text>
            </Group>
          </Group>

          <Group gap="xs">
            <Badge
              color={profile?.ig_connected ? 'green' : 'gray'}
              variant="dot"
              size="sm"
            >
              {profile?.ig_account_type || 'DEMO'}
            </Badge>

            <Tooltip label="Sync from IG">
              <ActionIcon
                variant="subtle"
                loading={syncing}
                onClick={handleSync}
                disabled={!profile?.ig_connected}
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label={colorScheme === 'dark' ? 'Light mode' : 'Dark mode'}>
              <ActionIcon variant="subtle" onClick={() => toggleColorScheme()}>
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Sign out">
              <ActionIcon variant="subtle" color="red" onClick={signOut}>
                <IconLogout size={18} />
              </ActionIcon>
            </Tooltip>

            <Avatar
              size="sm"
              radius="xl"
              color="blue"
              src={profile?.avatar_url}
            >
              {profile?.full_name?.[0] || user?.email?.[0]?.toUpperCase()}
            </Avatar>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="xs">
        <Stack gap={4} mt="xs">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              styles={{
                root: { borderRadius: 'var(--mantine-radius-sm)' },
              }}
            />
          ))}
        </Stack>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        {children}
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
