/** Splits a "- bullet\n- bullet" setup guide string into a plain string array. */
export function splitSetupGuideBullets(setupGuide: string): string[] {
    return setupGuide
      .split("\n")
      .map((line) => line.trim().replace(/^[-*]\s*/, ""))
      .filter(Boolean);
  }