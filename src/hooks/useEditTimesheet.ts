import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { KimaiTimesheetUpdate } from "../api/kimaiTypes";
import type { KimaiClient } from "../api/kimaiClient";
import { updateTimesheet } from "../api/timesheetApi";
import { invalidateTimesheets } from "./invalidateTimesheets";

interface EditTimesheetRequest {
  id: number;
  payload: KimaiTimesheetUpdate;
}

export function useEditTimesheet(client: KimaiClient | null) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, payload }: EditTimesheetRequest) => {
      if (!client) throw new Error("Kimai client is not configured");
      return updateTimesheet(client, id, payload);
    },
    onSuccess: () => invalidateTimesheets(queryClient),
    retry: false,
  });

  return {
    editTimesheet: (id: number, payload: KimaiTimesheetUpdate) =>
      mutation.mutateAsync({ id, payload }),
  };
}
