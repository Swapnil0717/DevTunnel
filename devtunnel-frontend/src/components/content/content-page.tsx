import type { ReactNode } from "react";

/**
 * Typography wrapper for the public explainer pages (About, Guides). Same look
 * as `LegalPage` but without the "Last updated" line, which would be wrong for
 * pages that aren't legal documents.
 */
export function ContentPage({
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
      <article>
        <h1 className="m-0 mb-1 text-[28px] font-medium leading-[1.25] text-text">{title}</h1>
        {intro ? <p className="m-0 mb-6 mt-3 text-[15px] leading-[1.7] text-text-secondary">{intro}</p> : null}
        <div className="flex flex-col gap-3 text-[14.5px] leading-[1.75] text-text-secondary [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-text [&_dd]:m-0 [&_dl]:m-0 [&_dl]:flex [&_dl]:flex-col [&_dl]:gap-2 [&_dt]:font-medium [&_dt]:text-text [&_h2]:m-0 [&_h2]:mt-6 [&_h2]:text-[19px] [&_h2]:font-medium [&_h2]:text-text [&_h3]:m-0 [&_h3]:mt-3 [&_h3]:text-[15.5px] [&_h3]:font-medium [&_h3]:text-text [&_li]:mt-1.5 [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:p-3 [&_pre]:text-[13px] [&_strong]:font-medium [&_strong]:text-text [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </main>
  );
}
