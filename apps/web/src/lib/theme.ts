import { useEffect } from 'react';
import { createStore, useStore } from './store';

export type Theme = 'light' | 'dark';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const themeStore = createStore<Theme>(readInitial());

export function useTheme(): {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
} {
  const theme = useStore(themeStore);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  return {
    theme,
    setTheme: (t) => themeStore.set(t),
    toggle: () => themeStore.set(themeStore.get() === 'dark' ? 'light' : 'dark'),
  };
}
