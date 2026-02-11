"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon, XIcon } from "./Icons";

interface ToastProps {
  message: string | null;
  onClose: () => void;
  duration?: number;
  type?: "success" | "error" | "info";
}

export function Toast({ message, onClose, duration = 3000, type = "success" }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      setExiting(false);
      const exitTimer = setTimeout(() => setExiting(true), duration - 300);
      const closeTimer = setTimeout(() => {
        setVisible(false);
        onClose();
      }, duration);
      return () => {
        clearTimeout(exitTimer);
        clearTimeout(closeTimer);
      };
    } else {
      setVisible(false);
    }
  }, [message, duration, onClose]);

  if (!visible || !message) return null;

  const colorMap = {
    success: "bg-cta/90 text-white",
    error: "bg-danger/90 text-white",
    info: "bg-primary/90 text-white",
  };

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-medium ${colorMap[type]} transition-all duration-300 ${exiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`}
      role="status"
      aria-live="polite"
      data-testid="toast"
    >
      {type === "success" && <CheckCircleIcon className="w-5 h-5 shrink-0" />}
      <span>{message}</span>
      <button
        type="button"
        onClick={() => { setVisible(false); onClose(); }}
        className="ml-1 p-0.5 rounded hover:bg-white/20 cursor-pointer transition-colors"
        aria-label="Dismiss"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
