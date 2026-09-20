import type { JsonLdObject } from "@/lib/structured-data";

/**
 * Renders one JSON-LD `<script>` (Frontend_Development_Rules.txt rules 14,
 * 52, 53). Server component — no client JS.
 *
 * This is the only place in the app that uses `dangerouslySetInnerHTML`
 * (rule 20), and it has to: React HTML-escapes text children of a
 * `<script>`, which corrupts the JSON. The input is a plain object built by
 * `lib/structured-data.ts` and serialized with `JSON.stringify`; every `<`
 * is then escaped to `\u003c`, so no string value coming from the API (a
 * project name, say) can close the script tag or inject markup.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
