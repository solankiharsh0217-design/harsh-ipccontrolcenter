import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FinanceSuccessDashboard from './FinanceSuccessDashboard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Mock the Auth hook specifically
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isAdmin: true,
    hasModule: () => true,
    user: { id: 'test-user' },
    loading: false,
  })),
  AuthProvider: ({ children }: any) => <div>{children}</div>
}));

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

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {ui}
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

  it('shows Today\'s Work tab by default after refactor', () => {
    renderWithProviders(<FinanceSuccessDashboard />);
    // After refactor, the default tab is "work" with label "Today's Work"
    expect(screen.getByRole('tab', { name: /Today's Work/i })).toBeInTheDocument();
  });
});
