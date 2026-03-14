import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AgentDetail from './pages/AgentDetail';
import Alerts from './pages/Alerts';
import KnowledgeBase from './pages/KnowledgeBase';
import Settings from './pages/Settings';
import Console from './pages/Console';
import Setup from './pages/Setup';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30000,
      staleTime: 25000,
      refetchOnWindowFocus: false,
    },
  },
});

const API_BASE = import.meta.env.VITE_API_URL || '';

function App() {
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/setup/status`)
      .then((res) => res.json())
      .then((data) => setSetupNeeded(!data.configured))
      .catch(() => setSetupNeeded(false)); // If API is down, show the app (it'll show errors naturally)
  }, []);

  // Loading state
  if (setupNeeded === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-gray-500 text-sm">Connecting...</div>
      </div>
    );
  }

  // Setup wizard
  if (setupNeeded) {
    return <Setup onComplete={() => setSetupNeeded(false)} />;
  }

  // Normal app
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents/:id" element={<AgentDetail />} />
            <Route path="/agents/:id/console" element={<Console />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/knowledge-base" element={<KnowledgeBase />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
