"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";
import ConfirmModal from "./ConfirmModal";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "brand" | "info";
};

export type AlertOptions = {
  title?: string;
  message: string;
  buttonLabel?: string;
  variant?: "danger" | "brand" | "info";
};

export function useConfirmDialog(): {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
  DialogComponent: ReactNode;
} {
  const [config, setConfig] = useState<{
    isOpen: boolean;
    isAlert: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    variant: "danger" | "brand" | "info";
  } | null>(null);

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      const opts = typeof options === "string" ? { message: options } : options;
      setConfig({
        isOpen: true,
        isAlert: false,
        title: opts.title || "Confirm Action",
        message: opts.message,
        confirmLabel: opts.confirmLabel || "Confirm",
        cancelLabel: opts.cancelLabel || "Cancel",
        variant: opts.variant || "danger",
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      resolverRef.current = () => resolve();
      const opts = typeof options === "string" ? { message: options } : options;
      setConfig({
        isOpen: true,
        isAlert: true,
        title: opts.title || "Notice",
        message: opts.message,
        confirmLabel: opts.buttonLabel || "Got it",
        variant: opts.variant || "brand",
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setConfig((prev) => (prev ? { ...prev, isOpen: false } : null));
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setConfig((prev) => (prev ? { ...prev, isOpen: false } : null));
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  const DialogComponent = config?.isOpen ? (
    <ConfirmModal
      isOpen={config.isOpen}
      isAlert={config.isAlert}
      title={config.title}
      message={config.message}
      confirmLabel={config.confirmLabel}
      cancelLabel={config.cancelLabel}
      variant={config.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return {
    confirm,
    alert,
    DialogComponent,
  };
}
