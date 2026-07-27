import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import {
  updateTimesheet,
  updateTimesheetMeta,
} from "../api/timesheetApi";
import { serializeKimaiTags } from "../api/tagUtils";
import { invalidateTimesheets } from "./invalidateTimesheets";

interface EditPayload {
  description?: string;
  begin?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

export function useEditTimer(client: KimaiClient | null) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number } & EditPayload) => {
      const { tags, metadata, ...rest } = payload;
      const apiPayload = {
        ...rest,
        ...(tags !== undefined ? { tags: serializeKimaiTags(tags) } : {}),
      };
      if (Object.keys(apiPayload).length > 0) {
        await updateTimesheet(client!, id, apiPayload);
      }
      for (const [name, value] of Object.entries(metadata ?? {})) {
        await updateTimesheetMeta(client!, id, { name, value });
      }
    },
    onSuccess: () => {
      invalidateTimesheets(qc);
    },
  });

  return {
    editTimer: (id: number, payload: EditPayload) =>
      mutation.mutate({ id, ...payload }),
    isSaving: mutation.isPending,
    saveError: mutation.error instanceof Error ? mutation.error.message : null,
  };
}
