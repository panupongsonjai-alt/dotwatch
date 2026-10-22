import {
  QueryClient,
  QueryClientProvider,
  focusManager
} from '@tanstack/react-query';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { AuthProvider } from './AuthProvider';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnReconnect: true
          }
        }
      })
  );

  // React Query cannot see app foreground/background on React Native by
  // itself, so polling (e.g. the backend health banner) kept running in the
  // background and nothing refreshed when the app came back. Wire AppState in.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const subscription = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        focusManager.setFocused(status === 'active');
      }
    );

    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
