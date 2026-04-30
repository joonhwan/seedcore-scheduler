import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createStore, useStore } from './store';

const STORAGE_KEY = 'adminMode';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

const adminModeStore = createStore<boolean>(readInitial());

export const isAdminModeOn = (): boolean => adminModeStore.get();

export function useAdminMode(): {
  on: boolean;
  setOn: (next: boolean) => void;
  toggle: () => void;
} {
  const on = useStore(adminModeStore);
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  }, [on]);

  return {
    on,
    setOn: (next) => {
      if (adminModeStore.get() === next) return;
      adminModeStore.set(next);
      qc.invalidateQueries();
    },
    toggle: () => {
      const next = !adminModeStore.get();
      adminModeStore.set(next);
      qc.invalidateQueries();
    },
  };
}
