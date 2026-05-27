import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { KimaiClient } from "../api/kimaiClient";
import { deleteTimesheet } from "../api/timesheetApi";
import { invalidateTimesheets } from "./invalidateTimesheets";

export function useDeleteTimesheet(client: KimaiClient | null) {
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (id: number) => {
      return deleteTimesheet(client!, id);
    },
    onMutate: (id) => {
      setDeletingId(id);
      setDeleteError(null);
    },
    onSuccess: () => {
      setDeletingId(null);
      invalidateTimesheets(qc);
    },
    onError: (err: Error) => {
      setDeletingId(null);
      setDeleteError(err.message);
    },
  });

  const deleteEntry = useCallback(
    (id: number) => {
      if (!client || mutation.isPending) return;
      mutation.mutate(id);
    },
    [client, mutation],
  );

  const dismissError = useCallback(() => setDeleteError(null), []);

  return {
    deleteEntry,
    deletingId,
    isDeleting: mutation.isPending,
    deleteError,
    dismissError,
  };
}
