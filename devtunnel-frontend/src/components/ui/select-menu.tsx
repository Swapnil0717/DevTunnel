"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface SelectMenuOption<T extends string = string> {
  value: T;
  label: string;
}

interface SelectMenuProps<T extends string> {
  /** Id of the trigger button — point a `<label htmlFor>` at it. */
  id: string;
  value: T;
  options: readonly SelectMenuOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  /** `field` (default) fits form inputs; `filter` is the smaller toolbar look. */
  variant?: "field" | "filter";
  /** Accessible name when there is no visible `<label htmlFor={id}>`. */
  ariaLabel?: string;
}

const TRIGGER_BASE =
  "flex w-full items-center justify-between gap-2 border text-left text-[12.5px] text-text transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TRIGGER_VARIANT = {
  field: "rounded-md border-border bg-surface-raised px-2.5 py-2 hover:border-text-faint",
  filter: "rounded-[8px] border-border-subtle bg-bg px-2.5 py-1.5 hover:border-text-faint",
} as const;

/**
 * A themed single-select dropdown for forms, standing in for a native
 * `<select>` whose OS-styled popup (white, system font) clashes with the
 * app's dark surfaces — most visibly inside dialogs such as the bug report.
 *
 * Differs from `FilterSelect` (admin filter bars) in two ways that matter in
 * a form inside a modal:
 *
 *  - **Full keyboard support** — Arrow Up/Down, Home/End, Enter/Space to
 *    choose, type-ahead by first letter, Tab to close. The trigger opens with
 *    Arrow Up/Down as well as Enter/Space.
 *  - **Escape closes only the menu.** The key is handled in React and its
 *    propagation stopped, so it never reaches `Dialog`'s document-level Esc
 *    listener — pressing Esc on an open menu doesn't also dismiss the dialog
 *    (and trigger its "Discard this report?" prompt).
 *
 * Pattern: trigger `<button aria-haspopup="listbox">` + `role="listbox"` list
 * with `aria-activedescendant`. Focus moves to the list while it is open and
 * returns to the trigger on close. Closes on an outside press. No dependency
 * added (Frontend_Development_Rules.txt rule 5).
 */
export function SelectMenu<T extends string>({
  id,
  value,
  options,
  onChange,
  className = "",
  variant = "field",
  ariaLabel,
}: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", timer: 0 as number | undefined });

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options.find((option) => option.value === value);

  function openMenu(startAt: number = selectedIndex) {
    setActiveIndex(startAt);
    setOpen(true);
  }

  function closeMenu(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    closeMenu(true);
  }

  // Focus the list when it opens so it receives the keyboard.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // Keep the highlighted row visible in a long list.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${id}-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, id]);

  // Outside press closes without stealing focus from what was pressed.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    const state = typeahead.current;
    return () => window.clearTimeout(state.timer);
  }, []);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, last));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        return;
      case "Escape":
        // Close the menu only — keep Esc away from the surrounding Dialog.
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        return;
      case "Tab":
        event.preventDefault();
        closeMenu(true);
        return;
    }

    // Type-ahead: letters jump to the next option starting with them.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const state = typeahead.current;
      window.clearTimeout(state.timer);
      state.text += event.key.toLowerCase();
      state.timer = window.setTimeout(() => {
        state.text = "";
      }, 600);

      const order = options.map((_, i) => (activeIndex + 1 + i) % options.length);
      const match =
        order.find((i) => options[i]!.label.toLowerCase().startsWith(state.text)) ??
        order.find((i) => options[i]!.label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match !== undefined) setActiveIndex(match);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={`${TRIGGER_BASE} ${TRIGGER_VARIANT[variant]}`}
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
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : id}
          aria-activedescendant={`${id}-option-${activeIndex}`}
          onKeyDown={onListKeyDown}
          className="absolute left-0 top-[calc(100%+4px)] z-30 m-0 max-h-64 w-full min-w-[170px] max-w-[calc(100vw-2rem)] list-none overflow-auto rounded-md border border-border bg-surface p-1 shadow-lg shadow-black/30 focus:outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                // Keep focus on the list while pressing an option.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2.5 py-1.5 text-[12.5px] transition-colors ${
                  isActive ? "bg-surface-raised" : ""
                } ${isSelected ? "text-accent" : "text-text"}`}
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
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
