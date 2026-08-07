import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FinanceSuccessDashboard from './FinanceSuccessDashboard';
import { AuthProvider } from '@/context/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import * as accessFollowupReturn from '@/lib/accessFollowupReturn';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
    },
  },
}));

// Mock Audit Log
vi.mock('@/lib/auditLog', () => ({
  logActivity: vi.fn().mockResolvedValue({}),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const mockAuth = {
  isAdmin: true,
  hasModule: () => true,
  user: { id: 'test-user' },
  loading: false,
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={mockAuth as any}>
          {ui}
        </AuthContext.Provider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe('FinanceSuccessDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<FinanceSuccessDashboard />);
    expect(screen.getByText(/Finance Success Dashboard/i)).toBeInTheDocument();
  });

  it('shows summary tab by default (Baseline check for refactor)', () => {
    renderWithProviders(<FinanceSuccessDashboard />);
    // Check for "Webinar Summary" tab trigger
    expect(screen.getByRole('tab', { name: /Webinar Summary/i })).toBeInTheDocument();
  });
});
