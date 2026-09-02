"use client";

import { useState } from "react";
import { TECH_STACK_CATALOG, TECH_STACK_CATEGORIES } from "@/lib/onboarding/tech-catalog";
import { TechIcon } from "./tech-icon";

interface TechPickerProps {
  values: string[];
  onChange: (next: string[]) => void;
}

/**
 * Quick-add companion to the freehand Technologies TagInput
 * (3_devtunnel_onboarding.html's "Add tech" affordance). Lists common
 * open-source tech stack entries, grouped by category, each with its
 * logo, as real toggle buttons a contributor can tap instead of typing —
 * typing still works for anything not listed here.
 */
export function TechPicker({ values, onChange }: TechPickerProps) {
  const [activeCategory, setActiveCategory] = useState(TECH_STACK_CATEGORIES[0]);

  function toggle(name: string) {
    if (values.includes(name)) {
      onChange(values.filter((value) => value !== name));
    } else {
      onChange([...values, name]);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-border-subtle bg-surface-raised p-2.5">
      <p className="m-0 mb-2 text-[11px] text-text-faint">Suggested technologies</p>

      <div
        role="tablist"
        aria-label="Technology categories"
        className="mb-2.5 flex flex-wrap gap-1.5"
      >
        {TECH_STACK_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={activeCategory === category}
            onClick={() => setActiveCategory(category)}
            className={`rounded-full px-2.5 py-1 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              activeCategory === category
                ? "bg-text text-bg"
                : "bg-surface text-text-dim hover:text-text-muted"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-wrap gap-1.5">
        {TECH_STACK_CATALOG.filter((tech) => tech.category === activeCategory).map((tech) => {
          const selected = values.includes(tech.name);
          return (
            <button
              key={tech.name}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(tech.name)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected
                  ? "border-tag-tech-border bg-tag-tech-bg text-tag-tech-text"
                  : "border-border bg-surface text-text-muted hover:border-border-subtle"
              }`}
            >
              <TechIcon name={tech.name} />
              {tech.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}