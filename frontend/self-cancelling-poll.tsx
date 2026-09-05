/**
 * Self-Cancelling Poll — for async AI generation
 *
 * Source pattern: a data-fetching hook that polls a status endpoint while an
 * async AI generation job is still in progress, and stops polling itself
 * once nothing is pending anymore. Simplified/anonymized from a real-app
 * hook that polled a "generate description" job via react-query's
 * `refetchInterval` function form.
 *
 * Shape: the poll interval is not a fixed value — it's a function of the
 * latest fetched data. Returning a delay means "keep polling"; returning
 * `false` means "stop", and the polling library owns start/stop + cleanup
 * on unmount, so there's no manual clearInterval/AbortController needed.
 */

type Job = { id: string; status: "processing" | "done" | "failed" };

// Stand-in for a react-query-style hook; the pattern generalizes to any
// polling primitive that accepts "compute next delay from latest data".
declare function useQuery<T>(config: {
  queryKey: unknown[];
  queryFn: () => Promise<T>;
  refetchInterval: (query: { state: { data: T | undefined } }) => number | false;
}): { data: T | undefined };

function useJobsInProgress(groupId: string) {
  return useQuery<{ jobs: Job[] }>({
    queryKey: ["jobs", groupId],
    queryFn: () => fetchJobs(groupId),

    // Self-cancelling: poll every 4s while anything is still processing,
    // then return `false` to stop once the last job settles.
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs;
      const stillProcessing = Array.isArray(jobs) && jobs.some((j) => j.status === "processing");
      return stillProcessing ? 4000 : false;
    },
  });
}

declare function fetchJobs(groupId: string): Promise<{ jobs: Job[] }>;

// Consumer: a plain list bound to the same query. No websocket, no manual
// re-fetch button — while `useJobsInProgress` is still polling, each row
// just re-renders with whatever status came back, so a row visibly flips
// from "processing" to "done" (or "failed") on its own as the backend
// finishes that job, and polling stops once none are left processing.
function JobsList({ groupId }: { groupId: string }) {
  const { data } = useJobsInProgress(groupId);

  return (
    <ul>
      {data?.jobs.map((job) => (
        <li key={job.id}>
          {job.id}: {job.status}
        </li>
      ))}
    </ul>
  );
}
