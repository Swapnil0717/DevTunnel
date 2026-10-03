// devtunnel-frontend/src/components/admin/sponsors/admin-sponsors-manager.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { StatusDot } from "@/components/ui/status-dot";
import { Toggle } from "@/components/ui/toggle";
import { Spinner } from "@/components/ui/spinner";
import { formatInr, tierName } from "@/lib/sponsors/sponsors";
import { listAdminSponsors, updateAdminSponsor } from "@/lib/admin/sponsors/client-api";
import {
  ADMIN_SPONSOR_STATUSES,
  type AdminSponsor,
  type AdminSponsorPatch,
  type AdminSponsorsPage,
  type AdminSponsorStatus,
} from "@/lib/admin/sponsors/types";
import { AddManualSponsorForm } from "./add-manual-sponsor-form";
import { EditSponsorDialog } from "./edit-sponsor-dialog";
import { INPUT_CLASS, SECONDARY_BUTTON_CLASS, sponsorErrorMessage } from "./sponsor-form-fields";

type StatusFilter = "" | AdminSponsorStatus;
type ApprovalFilter = "" | "true" | "false";

const STATUS_COPY: Record<AdminSponsorStatus, { label: string; dotColor: string }> = {
  captured: { label: "Captured", dotColor: "#1D9E75" },
  pending: { label: "Pending", dotColor: "#C98A1B" },
  refunded: { label: "Refunded", dotColor: "#6B6B6B" },
  failed: { label: "Failed", dotColor: "#D14B4B" },
};

const HEADINGS = ["Sponsor", "Amount", "Tier", "Status", "Source", "Paid", "Approved", "Hidden", "Actions"];

// India time, fixed, so the server render and the browser always agree.
const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

/** A name for labels and messages. Never the payment id. */
function sponsorLabel(sponsor: AdminSponsor): string {
  if (sponsor.displayName) return sponsor.displayName;
  if (sponsor.githubUsername) return `@${sponsor.githubUsername}`;
  return "Unnamed sponsor";
}

function matchesFilters(sponsor: AdminSponsor, status: StatusFilter, approval: ApprovalFilter): boolean {
  if (status && sponsor.status !== status) return false;
  if (approval && String(sponsor.approved) !== approval) return false;
  return true;
}

/**
 * The sponsors table on `/admin/sponsors`: status, tier, amount, and an
 * approved / hidden switch per row, an "Edit" dialog, and "Add manual
 * sponsor". Talks to the Part 4 endpoints through `lib/admin/sponsors/client-api`.
 *
 * `initial` is the first page rendered on the server (`null` if that call
 * failed; the manager then loads it in the browser). Changing a filter
 * reloads from the backend (`?status=&approved=`), and "Load more" walks
 * older rows with the backend's keyset cursor. Hiding a sponsor is a soft
 * hide (`hidden = true`); there is no delete anywhere.
 */
export function AdminSponsorsManager({ initial }: { initial: AdminSponsorsPage | null }) {
  const [sponsors, setSponsors] = useState<AdminSponsor[]>(initial?.sponsors ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [status, setStatus] = useState<StatusFilter>("");
  const [approval, setApproval] = useState<ApprovalFilter>("");
  const [isLoading, setIsLoading] = useState(initial === null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminSponsor | null>(null);

  // Ignore a response that arrives after a newer request was started.
  const requestId = useRef(0);
  // The server already rendered the unfiltered first page, so skip the first load.
  const skipFirstLoad = useRef(initial !== null);

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    const id = ++requestId.current;
    setIsLoading(true);
    setListError(null);
    listAdminSponsors({ status: status || null, approved: approval === "" ? null : approval === "true" })
      .then((page) => {
        if (id !== requestId.current) return;
        setSponsors(page.sponsors);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setListError(sponsorErrorMessage(err, "Couldn't load sponsors. Check your connection and try again."));
      })
      .finally(() => {
        if (id === requestId.current) setIsLoading(false);
      });
  }, [status, approval, reloadKey]);

  async function handleLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    const id = requestId.current;
    setIsLoadingMore(true);
    setListError(null);
    try {
      const page = await listAdminSponsors({
        before: nextCursor,
        status: status || null,
        approved: approval === "" ? null : approval === "true",
      });
      if (id !== requestId.current) return;
      setSponsors((current) => [...current, ...page.sponsors]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setListError(sponsorErrorMessage(err, "Couldn't load more sponsors. Try again."));
    } finally {
      setIsLoadingMore(false);
    }
  }

  function replaceSponsor(updated: AdminSponsor) {
    setSponsors((current) => current.map((row) => (row.id === updated.id ? updated : row)));
  }

  async function handleRowPatch(sponsor: AdminSponsor, patch: AdminSponsorPatch) {
    setBusyId(sponsor.id);
    setActionError(null);
    try {
      replaceSponsor(await updateAdminSponsor(sponsor.id, patch));
    } catch (err) {
      setActionError(
        sponsorErrorMessage(err, `Couldn't update ${sponsorLabel(sponsor)}. Check your connection and try again.`),
      );
    } finally {
      setBusyId(null);
    }
  }

  function handleCreated(sponsor: AdminSponsor) {
    // A new row is the newest one; show it only if it belongs under the current filters.
    if (matchesFilters(sponsor, status, approval)) setSponsors((current) => [sponsor, ...current]);
  }

  function handleSaved(updated: AdminSponsor) {
    replaceSponsor(updated);
    setEditing(null);
  }

  const filtersActive = status !== "" || approval !== "";
  const isApprovalQueue = status === "captured" && approval === "false";

  return (
    <>
      <AddManualSponsorForm onCreated={handleCreated} />

      <section aria-labelledby="sponsors-table-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="sponsors-table-heading" className="m-0 text-[14px] font-medium text-text">
            Sponsors
          </h2>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="sponsor-filter-status" className="mb-1 block text-[11px] text-text-muted">
                Status
              </label>
              <select
                id="sponsor-filter-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className={`${INPUT_CLASS} !w-auto`}
              >
                <option value="">All statuses</option>
                {ADMIN_SPONSOR_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_COPY[value].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sponsor-filter-approval" className="mb-1 block text-[11px] text-text-muted">
                Approval
              </label>
              <select
                id="sponsor-filter-approval"
                value={approval}
                onChange={(event) => setApproval(event.target.value as ApprovalFilter)}
                className={`${INPUT_CLASS} !w-auto`}
              >
                <option value="">Approved and not</option>
                <option value="true">Approved</option>
                <option value="false">Not approved</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setStatus("captured");
                setApproval("false");
              }}
              disabled={isApprovalQueue}
              className={SECONDARY_BUTTON_CLASS}
            >
              Approval queue
            </button>
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setStatus("");
                  setApproval("");
                }}
                className="rounded-md px-2 py-2 text-[12.5px] text-text-muted transition-colors hover:text-text"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <p role="alert" className="m-0 mb-2 text-[12px] text-status-error-label empty:hidden">
          {actionError ?? listError}
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-border px-4 py-6 text-[12.5px] text-text-dim">
            <Spinner size={13} />
            Loading sponsors…
          </div>
        ) : sponsors.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border-subtle bg-surface/40 px-4 py-6 text-[12.5px] text-text-dim">
            {listError && !filtersActive && initial === null ? (
              <>
                Sponsors couldn&apos;t be loaded.{" "}
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="rounded-sm text-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Try again
                </button>
              </>
            ) : filtersActive ? (
              "No sponsors match these filters."
            ) : (
              "No sponsors yet. Payments from Razorpay appear here once the webhook records them."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-border">
            <table className="w-full min-w-[960px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface">
                  {HEADINGS.map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-text-faint"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sponsors.map((sponsor) => {
                  const label = sponsorLabel(sponsor);
                  const busy = busyId === sponsor.id;
                  const statusCopy = STATUS_COPY[sponsor.status] ?? { label: sponsor.status, dotColor: "#6B6B6B" };
                  return (
                    <tr key={sponsor.id} className="border-b border-border-subtle last:border-b-0 hover:bg-surface/60">
                      <th scope="row" className="px-4 py-3 font-medium text-text">
                        <span className="block">{label}</span>
                        {sponsor.displayName && sponsor.githubUsername ? (
                          <span className="block font-mono text-[11px] font-normal text-text-muted">
                            @{sponsor.githubUsername}
                          </span>
                        ) : null}
                        {sponsor.isAnonymous ? (
                          <span className="block text-[11px] font-normal text-text-muted">Shown as Anonymous</span>
                        ) : null}
                      </th>

                      <td className="px-4 py-3 text-text-secondary">
                        {formatInr(sponsor.amountInr)}
                        <span className="block text-[11px] text-text-muted">
                          {sponsor.showAmount ? "Amount shown" : "Amount hidden"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-text-secondary">{tierName(sponsor.tier)}</td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
                          <StatusDot color={statusCopy.dotColor} />
                          {statusCopy.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-text-secondary">
                        {sponsor.source === "manual" ? "Manual" : "Razorpay"}
                        {sponsor.razorpayPaymentId ? (
                          <span
                            title={sponsor.razorpayPaymentId}
                            className="block max-w-[150px] truncate font-mono text-[10.5px] text-text-muted"
                          >
                            {sponsor.razorpayPaymentId}
                          </span>
                        ) : null}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDate(sponsor.paidAt)}</td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <Toggle
                            checked={sponsor.approved}
                            disabled={busy}
                            label={`Approved: ${label}`}
                            onChange={(checked) => handleRowPatch(sponsor, { approved: checked })}
                          />
                          <span className="text-[11.5px] text-text-muted">{sponsor.approved ? "Yes" : "No"}</span>
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <Toggle
                            checked={sponsor.hidden}
                            disabled={busy}
                            label={`Hidden: ${label}`}
                            onChange={(checked) => handleRowPatch(sponsor, { hidden: checked })}
                          />
                          <span className="text-[11.5px] text-text-muted">{sponsor.hidden ? "Yes" : "No"}</span>
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setEditing(sponsor)}
                          aria-label={`Edit ${label}`}
                          className="rounded-md px-2 py-1 text-[11.5px] font-medium text-text-secondary hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {nextCursor && !isLoading ? (
          <div className="mt-3">
            <button type="button" onClick={handleLoadMore} disabled={isLoadingMore} className={SECONDARY_BUTTON_CLASS}>
              {isLoadingMore ? <Spinner size={13} /> : null}
              {isLoadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}

        <p className="m-0 mt-3 text-[11.5px] text-text-faint">
          Only approved, captured, not hidden payments appear on the public wall, and a change there takes about 5
          minutes to show.
        </p>
      </section>

      <EditSponsorDialog sponsor={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
    </>
  );
}
