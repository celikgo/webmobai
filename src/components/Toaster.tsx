import { CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from "@/components/ui/toast";
import { useToastStore, type ToastVariant } from "@/stores/useToastStore";

const variantIcon: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="w-4 h-4 text-primary" />,
  success: <CheckCircle className="w-4 h-4 text-success" />,
  destructive: <AlertCircle className="w-4 h-4 text-destructive" />,
  warning: <AlertTriangle className="w-4 h-4 text-warning" />,
};

// Bridges the toast store to Radix's toast primitives. Mounted once at the app
// root; any code can fire a toast via useToastStore().toast(...) or the
// standalone toast() helper.
export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          variant={t.variant}
          duration={t.duration}
          onOpenChange={(open) => {
            if (!open) dismiss(t.id);
          }}
        >
          <div className="mt-0.5 shrink-0">{variantIcon[t.variant]}</div>
          <div className="flex-1 min-w-0">
            <ToastTitle>{t.title}</ToastTitle>
            {t.description && (
              <ToastDescription>{t.description}</ToastDescription>
            )}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
