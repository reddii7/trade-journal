import { useState } from 'react';
import {
  Box,
  Button,
  Center,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  Anchor,
  Alert,
} from '@mantine/core';
import { IconChartLine, IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName);
        setSuccessMsg('Account created! Check your email to verify, then sign in.');
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        background: 'var(--mantine-color-dark-8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Center>
        <Paper
          shadow="md"
          p={40}
          radius="md"
          w={420}
          style={{ background: 'var(--mantine-color-dark-7)' }}
        >
          <Stack gap="xl">
            <Stack gap="xs" align="center">
              <Group gap="xs">
                <IconChartLine size={32} color="var(--mantine-color-blue-5)" />
                <Title order={2} c="white">TradeJournal</Title>
              </Group>
              <Text c="dimmed" size="sm" ta="center">
                {mode === 'signin'
                  ? 'Welcome back. Sign in to your journal.'
                  : 'Create your account to start tracking.'}
              </Text>
            </Stack>

            {error && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                variant="light"
              >
                {error}
              </Alert>
            )}

            {successMsg && (
              <Alert color="green" variant="light">
                {successMsg}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                {mode === 'signup' && (
                  <TextInput
                    label="Full Name"
                    placeholder="Your name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                )}
                <TextInput
                  label="Email"
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <PasswordInput
                  label="Password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <Button type="submit" loading={loading} fullWidth mt="sm">
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Button>
              </Stack>
            </form>

            <Divider />

            <Text ta="center" size="sm" c="dimmed">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Anchor
                component="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError(null);
                }}
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Anchor>
            </Text>
          </Stack>
        </Paper>
      </Center>
    </Box>
  );
}
