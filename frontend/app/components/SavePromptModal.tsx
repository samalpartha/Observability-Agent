"use client";

import { useEffect, useRef } from "react";

interface SavePromptModalProps {
  open: boolean;
  name: string;
  questionPreview: string;
  onNameChange: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SavePromptModal({ open, name, questionPreview, onNameChange, onConfirm, onCancel }: SavePromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus trap + auto-focus
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="save-prompt-modal-overlay">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md p-6"
        role="dialog"
        aria-label="Save prompt"
        aria-modal="true"
        data-testid="save-prompt-modal"
        onKeyDown={(e) => {
          // Trap focus inside modal
          if (e.key === "Tab") {
            const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
              'input, button, [tabindex]:not([tabindex="-1"])'
            );
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h3 className="text-lg font-semibold text-foreground mb-4">Save Prompt</h3>
        <label className="block text-sm text-muted mb-1" htmlFor="save-prompt-name">Prompt name</label>
        <input
          ref={inputRef}
          id="save-prompt-name"
          type="text"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none mb-1"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onConfirm(); }}
          maxLength={100}
          data-testid="save-prompt-name-input"
        />
        {!name.trim() && <p className="text-xs text-red-400 mb-2">Name is required</p>}
        <p className="text-xs text-muted mb-4 truncate">Query: {questionPreview.slice(0, 80)}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-foreground cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40 cursor-pointer transition-colors"
            data-testid="save-prompt-confirm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
