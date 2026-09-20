/**
 * Maps a project's primary language/framework to one of the existing tag
 * color tokens (tailwind.config.ts), matching how
 * 4_devtunnel_home_page.html color-codes tags differently per stack
 * (TypeScript/React → purple "skill" tokens, Go → green "tech" tokens).
 * Falls back to the green "tech" tokens for anything unrecognized. This
 * only recolors data the API already returned — it doesn't invent any
 * new fact about the project (Frontend_Development_Rules.txt rule 58).
 */
 const SKILL_STYLE_TECH = new Set([
    "typescript",
    "javascript",
    "react",
    "vue",
    "next.js",
    "nextjs",
  ]);
  
  export function getTechTagClasses(primaryTech: string): string {
    const isSkillStyle = SKILL_STYLE_TECH.has(primaryTech.trim().toLowerCase());
    return isSkillStyle
      ? "bg-tag-skill-bg border-tag-skill-border text-tag-skill-text"
      : "bg-tag-tech-bg border-tag-tech-border text-tag-tech-text";
  }