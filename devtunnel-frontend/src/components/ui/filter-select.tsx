"use client";

import { useEffect, useRef, useState } from "react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  id: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A themed dropdown that stands in for a plain `<select>` wherever a
 * filter needs to match the app's own dark surface/border palette
 * instead of the browser's native, OS-styled listbox — built for the
 * `/admin/opensource-tools` Language and Label filters, which previously
 * rendered as a stock light-mode `<select>` popup that clashed with the
 * rest of the dark Admin Portal.
 *
 * A manual button + listbox pair (`role="listbox"`/`role="option"`)
 * rather than a headless-UI dependency this project doesn't already
 * have (Frontend_Development_Rules.txt rule 5: don't add a dependency a
 * feature doesn't need). Closes on an outside click or Escape; the
 * trigger shows the selected option's label plus a chevron that rotates
 * open, and the currently-selected row is highlighted with a check —
 * the same information a native `<select>` conveys, just styled to fit.
 *
 * Generic over `options` so it isn't tied to this one filter bar — any
 * future single-select filter can reuse it instead of reaching for
 * another native `<select>`.
 */
export function FilterSelect({ id, value, options, onChange, className = "" }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full min-w-[150px] items-center justify-between gap-2 rounded-[8px] border border-border bg-surface px-2.5 py-2 text-left text-[12.5px] text-text transition-colors hover:border-border-subtle focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <span className="truncate">{selected?.label ?? "Select"}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`h-3 w-3 shrink-0 text-text-faint transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-64 w-full min-w-[180px] overflow-auto rounded-[8px] border border-border bg-surface p-1 shadow-lg shadow-black/20"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                    isSelected ? "bg-accent/15 text-accent" : "text-text hover:bg-surface-raised"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? (
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
