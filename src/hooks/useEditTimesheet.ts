import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { KimaiTimesheetUpdate } from "../api/kimaiTypes";
import type { KimaiClient } from "../api/kimaiClient";
import { updateTimesheet, updateTimesheetMeta } from "../api/timesheetApi";
import { invalidateTimesheets } from "./invalidateTimesheets";

export interface EditTimesheetPayload extends KimaiTimesheetUpdate {
  metadata?: Record<string, string>;
}

interface EditTimesheetRequest {
  id: number;
  payload: EditTimesheetPayload;
}

export function useEditTimesheet(client: KimaiClient | null) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ id, payload }: EditTimesheetRequest) => {
      if (!client) throw new Error("Kimai client is not configured");
      const { metadata, ...timesheet } = payload;
      let result: unknown;
      if (Object.keys(timesheet).length > 0) {
        result = await updateTimesheet(client, id, timesheet);
      }
      for (const [name, value] of Object.entries(metadata ?? {})) {
        result = await updateTimesheetMeta(client, id, { name, value });
      }
      return result;
    },
    onSettled: () => invalidateTimesheets(queryClient),
    retry: false,
  });

  return {
    editTimesheet: (id: number, payload: EditTimesheetPayload) =>
      mutation.mutateAsync({ id, payload }),
  };
}
