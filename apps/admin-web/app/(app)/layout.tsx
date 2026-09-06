'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { currentSession } from '@/lib/auth';
import { useRealtime } from '@/lib/ws';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useRealtime();

  useEffect(() => {
    const s = currentSession();
    const allowed = ['PARK_MANAGER', 'ADMIN', 'FIELD_MANAGER', 'CONTROLEUR'];
    if (!s || !allowed.includes(s.role)) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    <div className="shell">
      <Sidebar />
      <main className="shell-main">{children}</main>
    </div>
  );
}
