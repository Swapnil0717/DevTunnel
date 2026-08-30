"use client";

import { useId, useState, type KeyboardEvent } from "react";

type TagVariant = "skill" | "tech" | "interest";

const VARIANT_CLASSES: Record<TagVariant, string> = {
  skill: "bg-tag-skill-bg border-tag-skill-border text-tag-skill-text",
  tech: "bg-tag-tech-bg border-tag-tech-border text-tag-tech-text",
  interest: "bg-tag-interest-bg border-tag-interest-border text-tag-interest-text",
};

interface TagInputProps {
  label: string;
  variant: TagVariant;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/**
 * Chip-style multi-value input used for Skills / Technologies / Interests
 * on the onboarding profile step (3_devtunnel_onboarding.html).
 *
 * A real, labeled `<input>` drives entry — pressing Enter or "," commits a
 * chip, Backspace on an empty field removes the last one — so the chips
 * are a visual enhancement on top of ordinary text entry rather than the
 * only way to add a value (Frontend_Development_Rules.txt rule 36: forms
 * need proper labels; rule 37: don't replace real controls with bare
 * `<div onClick>`s).
 */
export function TagInput({ label, variant, values, onChange, placeholder }: TagInputProps) {
  const inputId = useId();
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const next = draft.trim();
    if (next && !values.includes(next)) {
      onChange([...values, next]);
    }
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function removeValue(value: string) {
    onChange(values.filter((existing) => existing !== value));
  }

  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-[11.5px] text-text-muted">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface p-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        {values.map((value) => (
          <span
            key={value}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] ${VARIANT_CLASSES[variant]}`}
          >
            {value}
            <button
              type="button"
              onClick={() => removeValue(value)}
              aria-label={`Remove ${value}`}
              className="opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={placeholder ?? "Type and press Enter"}
          className="min-w-[140px] flex-1 bg-transparent px-1.5 py-1 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none"
        />
      </div>
    </div>
  );
}
