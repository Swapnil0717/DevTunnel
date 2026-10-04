import type { ReactNode } from "react";
import { LEGAL_LAST_UPDATED } from "@/lib/config";

/** Shared typography wrapper for the legal pages (privacy, terms, cookies, refunds, contact). */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="m-0 mb-1 text-[26px] font-medium text-text">{title}</h1>
      <p className="m-0 mb-1 text-[12.5px] text-text-dim">Last updated: {LEGAL_LAST_UPDATED}</p>
      {intro ? <p className="m-0 mb-6 mt-3 text-[14px] leading-[1.7] text-text-secondary">{intro}</p> : null}
      <div className="flex flex-col gap-3 text-[14px] leading-[1.7] text-text-secondary [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_h2]:m-0 [&_h2]:mt-5 [&_h2]:text-[17px] [&_h2]:font-medium [&_h2]:text-text [&_li]:mt-1 [&_p]:m-0 [&_strong]:font-medium [&_strong]:text-text [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-text [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
