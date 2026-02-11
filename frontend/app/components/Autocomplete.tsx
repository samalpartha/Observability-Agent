"use client";

import { useState, useRef, useEffect } from "react";

type AutocompleteProps = {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  "aria-label"?: string;
};

export function Autocomplete({ value, onChange, options, placeholder, disabled, "aria-label": ariaLabel }: AutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const filtered = options.length
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase().trim())).slice(0, 10)
    : [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setFocusedIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
            setOpen(true);
            setFocusedIndex(0);
            e.preventDefault();
            return;
          }
          if (e.key === "Escape") {
            setOpen(false);
            setFocusedIndex(-1);
            return;
          }
          if (e.key === "ArrowDown") {
            setFocusedIndex((i) => (i < filtered.length - 1 ? i + 1 : i));
            e.preventDefault();
          } else if (e.key === "ArrowUp") {
            setFocusedIndex((i) => (i > 0 ? i - 1 : -1));
            e.preventDefault();
          } else if (e.key === "Enter" && focusedIndex >= 0 && filtered[focusedIndex]) {
            onChange(filtered[focusedIndex]);
            setOpen(false);
            setFocusedIndex(-1);
            e.preventDefault();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-autocomplete="list"

        className="input-focus w-full px-3 py-2 rounded-lg bg-surface border border-border text-body text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute z-10 mt-1 w-full rounded-lg bg-surface border border-border shadow-lg max-h-48 overflow-auto"
          role="listbox"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={value === opt}
              className={`px-3 py-2 text-body cursor-pointer transition-colors duration-200 ${i === focusedIndex ? "bg-primary/15 text-primary" : "text-foreground hover:bg-primary/5"
                }`}
              onMouseDown={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
