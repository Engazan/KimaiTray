import type { QueryClient } from "@tanstack/react-query";

export function invalidateTimesheets(qc: QueryClient) {
  qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey[0];
      return k === "active-timesheets" || k === "recent-timesheets" || k === "today-timesheets";
    },
  });
}
