import { useEffect, useState } from 'react';
import { onSync, type SyncSnapshot } from '../db/pouch';

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function useSyncState(): SyncSnapshot {
  const [snap, setSnap] = useState<SyncSnapshot>({ state: 'offline', pending: 0 });
  useEffect(() => onSync(setSnap), []);
  return snap;
}
