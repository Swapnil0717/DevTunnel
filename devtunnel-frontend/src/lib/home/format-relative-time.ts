const UNITS: {
    limit: number;
    divisor: number;
    unit: Intl.RelativeTimeFormatUnit;
  }[] = [
    { limit: 60, divisor: 1, unit: "second" },
    { limit: 3600, divisor: 60, unit: "minute" },
    { limit: 86400, divisor: 3600, unit: "hour" },
    { limit: 604800, divisor: 86400, unit: "day" },
    { limit: 2629800, divisor: 604800, unit: "week" },
  ];
  
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  
  // Real elapsed time only — never fabricate "fresh" timestamps (Rule 47).
  export function formatRelativeTime(isoDate: string): string {
    const diffSeconds = (Date.now() - new Date(isoDate).getTime()) / 1000;
  
    for (const { limit, divisor, unit } of UNITS) {
      if (diffSeconds < limit) {
        return rtf.format(-Math.round(diffSeconds / divisor), unit);
      }
    }
  
    return rtf.format(-Math.round(diffSeconds / 2629800), "month");
  }