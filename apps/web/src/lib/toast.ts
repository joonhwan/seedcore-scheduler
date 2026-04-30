import { createStore, useStore } from './store';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

const toastStore = createStore<Toast[]>([]);
let nextId = 1;

export function pushToast(message: string, variant: ToastVariant = 'info', durationMs = 4000): void {
  const id = nextId++;
  toastStore.set([...toastStore.get(), { id, variant, message }]);
  if (durationMs > 0) {
    setTimeout(() => dismissToast(id), durationMs);
  }
}

export function dismissToast(id: number): void {
  toastStore.set(toastStore.get().filter((t) => t.id !== id));
}

export function useToasts(): Toast[] {
  return useStore(toastStore);
}

export const toast = {
  info: (m: string) => pushToast(m, 'info'),
  success: (m: string) => pushToast(m, 'success'),
  error: (m: string) => pushToast(m, 'error'),
  warning: (m: string) => pushToast(m, 'warning'),
};
