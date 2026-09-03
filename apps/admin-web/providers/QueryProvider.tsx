'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            retry: 1,
            refetchOnWindowFocus: true,
            refetchOnMount: 'always',
            // temps réel par polling quand l'API n'expose pas de WebSocket (Vercel)
            refetchInterval: process.env.NEXT_PUBLIC_WS_URL ? false : 15_000,
            // continue de rafraîchir même si l'onglet n'a pas le focus (console de supervision)
            refetchIntervalInBackground: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
