import { create } from "zustand";
import { generateId } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "destructive" | "warning";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** Auto-dismiss delay in ms. */
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  toast: (input: {
    title: string;
    description?: string;
    variant?: ToastVariant;
    duration?: number;
  }) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  toast: ({ title, description, variant = "default", duration = 4000 }) => {
    const id = generateId();
    set((state) => ({
      toasts: [...state.toasts, { id, title, description, variant, duration }],
    }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// Convenience helper so non-component code can fire a toast without the hook.
export const toast = (input: Parameters<ToastState["toast"]>[0]) =>
  useToastStore.getState().toast(input);
