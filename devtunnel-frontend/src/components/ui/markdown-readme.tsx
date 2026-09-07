import type { CSSProperties } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";

interface MarkdownReadmeProps {
  content: string;
}

/**
 * Renders a GitHub README the way GitHub itself does — headings, lists,
 * tables, code blocks, checkboxes and links laid out and styled, not the
 * raw `.md` source dumped into a `<pre>`.
 *
 * Used everywhere a repository README is shown: the Project Detail page,
 * the onboarding Description step, and the onboarding Preview step — one
 * component so all three stay visually consistent and only get fixed in
 * one place.
 *
 * Real-world READMEs (this project's included — see the centered `<h1
 * align="center">` logo, the badge `<img>`, and the all-contributors
 * `<table>`) mix literal HTML into the Markdown. `remark`/`react-markdown`
 * strips embedded HTML out by default for safety, which is why that logo,
 * those badges and the contributor avatars weren't rendering — they were
 * silently dropped, not just unstyled. `rehype-raw` parses that HTML back
 * into real elements, and `rehype-sanitize` runs immediately after to
 * strip anything unsafe (`<script>`, inline event handlers, `javascript:`
 * links, etc.) before anything reaches the page. The result still goes
 * through React's normal element rendering, not `innerHTML` —
 * `dangerouslySetInnerHTML` is never used, satisfying
 * Frontend_Development_Rules.txt rule 20 ("Never blindly inject API
 * content into HTML... use normal React rendering whenever possible;
 * if HTML must be rendered, sanitize it properly before rendering").
 *
 * `remark-gfm` adds the GitHub-flavored Markdown bits real READMEs also
 * rely on: tables, task-list checkboxes, strikethrough, and autolinked
 * URLs.
 *
 * Every element is a small explicit override rather than a `prose`
 * class from a typography plugin, because this project's Tailwind
 * config (tailwind.config.ts) only defines the app's own dark palette —
 * there is no `@tailwindcss/typography` plugin to lean on, and pulling
 * one in just for this would fight the existing `text-*`/`border-*`
 * tokens instead of using them.
 */

/**
 * `rehype-sanitize`'s `defaultSchema` is already GitHub's own README
 * sanitization schema, so it covers the common cases (tables, images,
 * links, `sub`/`sup`, etc.). It's extended with exactly two things real
 * READMEs use that the default schema doesn't: the `align` attribute
 * (`<h1 align="center">`, `<td align="center">` — used throughout the
 * all-contributors table) and `width`/`height` on `<img>` (the
 * contributor-avatar thumbnails are sized this way, not via CSS).
 */
const readmeSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "align"],
    img: [...(defaultSchema.attributes?.img ?? []), "width", "height"],
  },
};

function toPixels(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const components: Components = {
  h1: (props: any) => (
    <h1
      style={props.align ? { textAlign: props.align } : undefined}
      className="mb-3 mt-6 border-b border-border-subtle pb-2 text-[19px] font-semibold text-text first:mt-0"
    >
      {props.children}
    </h1>
  ),
  h2: (props: any) => (
    <h2
      style={props.align ? { textAlign: props.align } : undefined}
      className="mb-2.5 mt-6 border-b border-border-subtle pb-2 text-[16px] font-semibold text-text first:mt-0"
    >
      {props.children}
    </h2>
  ),
  h3: (props: any) => (
    <h3
      style={props.align ? { textAlign: props.align } : undefined}
      className="mb-2 mt-5 text-[14px] font-semibold text-text first:mt-0"
    >
      {props.children}
    </h3>
  ),
  h4: (props: any) => (
    <h4
      style={props.align ? { textAlign: props.align } : undefined}
      className="mb-1.5 mt-4 text-[13px] font-semibold text-text first:mt-0"
    >
      {props.children}
    </h4>
  ),
  p: (props: any) => (
    <p
      style={props.align ? { textAlign: props.align } : undefined}
      className="m-0 mb-3 text-[13px] leading-[1.65] text-text-secondary last:mb-0"
    >
      {props.children}
    </p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2 hover:text-accent/80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-text-faint">{children}</del>,
  // GitHub READMEs use `<sub>` under contributor avatars purely for a
  // smaller caption, not literal subscript positioning — render it as a
  // small label rather than the browser's default vertical-shifted look.
  sub: ({ children }) => <span className="block text-[12.5px] text-text">{children}</span>,
  ul: ({ children }) => (
    <ul className="m-0 mb-3 list-disc space-y-1 pl-5 text-[13px] leading-[1.65] text-text-secondary last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="m-0 mb-3 list-decimal space-y-1 pl-5 text-[13px] leading-[1.65] text-text-secondary last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children, className }) => {
    // remark-gfm marks task-list items with this class; strip the
    // default bullet so the checkbox stands in for it, GitHub-style.
    const isTaskItem = className?.includes("task-list-item");
    return <li className={isTaskItem ? "list-none" : undefined}>{children}</li>;
  },
  input: ({ checked }) => (
    <input
      type="checkbox"
      checked={!!checked}
      disabled
      readOnly
      className="mr-1.5 -translate-y-px accent-accent"
    />
  ),
  blockquote: ({ children }) => (
    <blockquote className="m-0 mb-3 border-l-[3px] border-border pl-3 text-[13px] italic text-text-muted last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-border-subtle" />,
  img: ({ src, alt, width, height }) => (
    // eslint-disable-next-line @next/next/no-img-element -- README images
    // (logos, badges, contributor avatars) are arbitrary external URLs
    // from GitHub content, not local static assets `next/image` can
    // optimize.
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      width={toPixels(width)}
      height={toPixels(height)}
      className="inline-block max-w-full rounded-sm align-middle"
    />
  ),
  code: ({ className, children }) => {
    // remark marks fenced code blocks with a `language-*` className;
    // plain `inline code` has none — style those two cases differently,
    // same distinction GitHub draws.
    const isBlock = !!className;
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded border border-border-subtle bg-bg px-1.5 py-0.5 font-mono text-[12px] text-text-secondary">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="m-0 mb-3 overflow-x-auto rounded-md border border-border-subtle bg-bg p-3 font-mono text-[12px] leading-[1.6] text-text-secondary last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  th: ({ children, align }) => (
    <th
      style={toCellStyle(align)}
      className="border border-border-subtle px-3 py-1.5 text-left font-semibold text-text"
    >
      {children}
    </th>
  ),
  td: ({ children, align }) => (
    <td
      style={toCellStyle(align)}
      className="border border-border-subtle px-3 py-1.5 text-text-secondary"
    >
      {children}
    </td>
  ),
};

/**
 * GFM table alignment includes `"char"` (align on a delimiter character,
 * e.g. a decimal point) alongside the usual `left`/`right`/`center` —
 * that's a Markdown-spec concept with no CSS equivalent, since
 * `text-align` only accepts `left | right | center | justify`. No table
 * renderer actually implements character alignment (GitHub doesn't
 * either — it falls back to left-aligned), so `"char"` is dropped here
 * rather than passed through as an invalid inline style.
 */
function toCellStyle(align: string | null | undefined): CSSProperties | undefined {
  if (align === "left" || align === "right" || align === "center" || align === "justify") {
    return { textAlign: align };
  }
  return undefined;
}

export function MarkdownReadme({ content }: MarkdownReadmeProps) {
  return (
    <div className="min-w-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, readmeSanitizeSchema]]}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
}
