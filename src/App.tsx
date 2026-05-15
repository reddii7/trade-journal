import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppShellLayout from '@/components/layout/AppShell';
import AuthPage from '@/pages/AuthPage';
import Dashboard from '@/pages/Dashboard';
import TradeLog from '@/pages/TradeLog';
import Analytics from '@/pages/Analytics';
import CalendarView from '@/pages/CalendarView';
import Psychology from '@/pages/Psychology';
import Settings from '@/pages/Settings';
import { Center, Loader } from '@mantine/core';

function ProtectedLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <AppShellLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trades" element={<TradeLog />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/psychology" element={<Psychology />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShellLayout>
  );
}

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={session ? <Navigate to="/" replace /> : <AuthPage />}
      />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}
