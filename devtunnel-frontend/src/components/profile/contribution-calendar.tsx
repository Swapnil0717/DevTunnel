"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/layout/nav-icons";
import { GithubLoginButton } from "@/components/auth/github-login-button";
import { fetchContributionMonth, ProfileApiError } from "@/lib/profile/api";
import type { ContributionMonth } from "@/lib/profile/types";

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function currentMonthUTC(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [yearStr, monthStr] = month.split("-") as [string, string];
  const date = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [yearStr, monthStr] = month.split("-") as [string, string];
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1)));
}

/**
 * Maps a raw contribution count to one of 5 intensity levels for the
 * `contrib-{0..4}` color scale. Bucketed relative to the highest day in
 * *this* month's own data (the same approach GitHub's own graph uses),
 * not against any fixed/invented thresholds.
 */
function levelFor(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

const LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-contrib-0 border border-border-subtle",
  1: "bg-contrib-1",
  2: "bg-contrib-2",
  3: "bg-contrib-3",
  4: "bg-contrib-4",
};

type Status = "loading" | "ready" | "error" | "no-github" | "reauth-required";

/**
 * GitHub-style monthly contribution calendar for the profile page's
 * "Contribution history" tab — real data from
 * `GET /users/me/contributions` (devtunnel-backend
 * src/routes/contributions.ts, fetched using the signed-in user's own
 * GitHub authorization — src/db/githubTokens.ts), one calendar month at
 * a time, with prev/next arrows to navigate.
 */
export function ContributionCalendar() {
  const [month, setMonth] = useState<string>(() => currentMonthUTC());
  const [data, setData] = useState<ContributionMonth | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (targetMonth: string) => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const result = await fetchContributionMonth(targetMonth);
      setData(result);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ProfileApiError && err.code === "github_account_not_linked") {
        setStatus("no-github");
        return;
      }
      if (err instanceof ProfileApiError && err.code === "github_reauth_required") {
        setStatus("reauth-required");
        return;
      }
      setErrorMessage(
        err instanceof ProfileApiError ? err.message : "Couldn't load contribution data right now.",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  if (status === "no-github") {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim">
        Link a GitHub account to see your contribution history here.
      </div>
    );
  }

  if (status === "reauth-required") {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center">
        <p className="mb-3 text-[12.5px] text-text-dim">
          Your GitHub authorization has expired. Reconnect to see your contribution history.
        </p>
        <div className="mx-auto max-w-[220px]">
          <GithubLoginButton next="/profile" />
        </div>
      </div>
    );
  }

  const maxCount =
    data?.weeks.reduce(
      (max, week) => week.days.reduce((weekMax, day) => Math.max(weekMax, day.count), max),
      0,
    ) ?? 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[12.5px] text-text-muted">
          {status === "ready" && data ? (
            <>
              <span className="font-medium text-text">{data.totalContributions}</span>{" "}
              contribution{data.totalContributions === 1 ? "" : "s"} in {monthLabel(data.month)}
            </>
          ) : (
            <span aria-hidden="true">&nbsp;</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
            disabled={status === "loading" || (data ? !data.canGoPrevious : false)}
            aria-label="Previous month"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
            disabled={status === "loading" || (data ? !data.canGoNext : false)}
            aria-label="Next month"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle bg-surface p-4">
        {status === "error" ? (
          <p className="py-6 text-center text-[12.5px] text-text-dim">
            {errorMessage ?? "Couldn't load contribution data right now."}
          </p>
        ) : status === "loading" && !data ? (
          <p className="py-6 text-center text-[12.5px] text-text-dim">Loading contribution history…</p>
        ) : data ? (
          <>
            <div className="mb-1.5 flex gap-[3px] pl-6">
              {WEEKDAY_LABELS.map((label, i) =>
                i % 2 === 1 ? (
                  <span key={label} className="w-[13px] text-[9px] text-text-faint">
                    {label.slice(0, 1)}
                  </span>
                ) : (
                  <span key={label} className="w-[13px]" aria-hidden="true" />
                ),
              )}
            </div>

            <div
              className="flex gap-[3px] overflow-x-auto pb-1"
              role="img"
              aria-label={`${data.totalContributions} contributions in ${monthLabel(data.month)}`}
            >
              {data.weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  {week.days.map((day) => {
                    const level = levelFor(day.count, maxCount);
                    return (
                      <div
                        key={day.date}
                        title={`${day.count} contribution${day.count === 1 ? "" : "s"} on ${day.date}`}
                        className={`h-[13px] w-[13px] rounded-[3px] ${LEVEL_CLASSES[level]}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-text-faint">
              <span>Less</span>
              {([0, 1, 2, 3, 4] as const).map((level) => (
                <span key={level} className={`h-[10px] w-[10px] rounded-[2px] ${LEVEL_CLASSES[level]}`} />
              ))}
              <span>More</span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}