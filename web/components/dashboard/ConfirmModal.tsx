"use client";

import { useEffect, useRef } from "react";
import MemberIcon from "./MemberIcon";
import styles from "./ConfirmModal.module.css";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "brand";
  isBusy?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isBusy = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const busy = isBusy || isLoading;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    confirmBtnRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, busy, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div className={styles.modalCard}>
        <div className={styles.iconRow}>
          <div
            className={
              variant === "danger" ? styles.iconBoxDanger : styles.iconBoxBrand
            }
          >
            {variant === "danger" ? (
              <MemberIcon name="tickets" size={20} />
            ) : (
              <MemberIcon name="lightning" size={20} />
            )}
          </div>
        </div>

        <h3 id="confirm-modal-title" className={styles.title}>
          {title}
        </h3>

        <p id="confirm-modal-desc" className={styles.message}>
          {message}
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={
              variant === "danger"
                ? styles.confirmBtnDanger
                : styles.confirmBtnBrand
            }
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
