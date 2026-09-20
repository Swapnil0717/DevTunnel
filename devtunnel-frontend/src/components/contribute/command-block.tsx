import { CopyButton } from "@/components/github-projects/copy-button";

/**
 * A short block of shell commands with one copy button for the whole
 * block, used by every step on the "How to submit" tab.
 *
 * One button per block rather than per line: the lines in a step are run
 * together (clone, cd, add remote), so copying them one at a time is
 * busywork. `CopyButton` is reused from the GitHub project sidebar rather
 * than reimplemented — same affordance, same copied-then-reverts
 * feedback, one implementation (rule 51).
 *
 * Long commands wrap instead of scrolling sideways. A `<pre>` that
 * scrolls horizontally hides the end of the line on a phone, which is
 * exactly where someone is most likely to miss that a command has a
 * placeholder in it.
 */
export function CommandBlock({ commands, label }: { commands: string[]; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[8px] border border-border-subtle bg-bg px-3 py-2.5">
      <pre className="m-0 min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-text-secondary">
        {commands.join("\n")}
      </pre>
      <CopyButton value={commands.join("\n")} label={`Copy ${label} commands`} />
    </div>
  );
}
