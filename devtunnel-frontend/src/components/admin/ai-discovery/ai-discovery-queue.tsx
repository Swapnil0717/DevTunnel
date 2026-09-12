"use client";

import { useState, useTransition } from "react";
import { approveAiDiscoveredItem, rejectAiDiscoveredItem } from "@/lib/admin/ai-discovery/client-api";
import { Spinner } from "@/components/ui/spinner";

type Kind = "projects" | "tools" | "tasks";

interface Item {
  id: string;
  title: string;
  subtitle: string;
  meta: string[];
  reasoning: string;
  details?: string[];
  url: string;
}

export function AiDiscoveryQueue({ kind, items }: { kind: Kind; items: Item[] }) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [isPending, startTransition] = useTransition();

  function handle(id: string, action: "approve" | "reject") {
    setPendingId(id);
    setPendingAction(action);
    startTransition(async () => {
      try {
        if (action === "approve") await approveAiDiscoveredItem(kind, id);
        else await rejectAiDiscoveredItem(kind, id);
        setLocalItems((prev) => prev.filter((i) => i.id !== id));
      } finally {
        setPendingId(null);
        setPendingAction(null);
      }
    });
  }

  if (localItems.length === 0) {
    return <p className="text-sm text-text-muted">Nothing left to review here.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {localItems.map((item) => (
        <li key={item.id} className="rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-text hover:underline">
                {item.title}
              </a>
              <p className="mt-0.5 text-sm text-text-muted">{item.subtitle}</p>
              {item.meta.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-2 text-xs text-text-muted">
                  {item.meta.map((m) => (
                    <span key={m} className="rounded bg-surface-muted px-1.5 py-0.5">
                      {m}
                    </span>
                  ))}
                </p>
              )}
              {item.details && item.details.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-text-muted">
                  {item.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-sm italic text-text-muted">{item.reasoning}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={isPending && pendingId === item.id}
                onClick={() => handle(item.id, "approve")}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {isPending && pendingId === item.id && pendingAction === "approve" ? (
                  <Spinner size={13} />
                ) : null}
                Approve
              </button>
              <button
                type="button"
                disabled={isPending && pendingId === item.id}
                onClick={() => handle(item.id, "reject")}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text disabled:opacity-50"
              >
                {isPending && pendingId === item.id && pendingAction === "reject" ? (
                  <Spinner size={13} />
                ) : null}
                Reject
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}