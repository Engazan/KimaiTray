import { useEffect, useRef, useState } from "react";
import type { KimaiClient } from "../api/kimaiClient";
import type { SavedConnection } from "../types";
import type { ExternalIssue, IssueIntegrationSettings } from "../integrations/issues/types";
import type { StartTaskPayload } from "../services/timerService";
import type { NewTaskFormInitialValues } from "../components/NewTaskForm";
import {
  DESCRIPTION_INPUT_TARGET,
  type PluginCustomInputDefinition,
} from "../plugins/customInputs";
import { createIssueProvider } from "../integrations/issues/issueProvider";
import { subscribeToDeepLinks } from "../api/deepLink";
import {
  parseKimaiTrayDeepLink,
  resolveDeepLinkConnectionId,
  type KimaiTrayDeepLink,
} from "../api/deepLinkPayload";

interface PendingDeepLink {
  id: number;
  request: KimaiTrayDeepLink;
}
interface Options {
  client: KimaiClient | null;
  activeConnectionId: string;
  connections: SavedConnection[];
  settingsReady: boolean;
  isConfigured: boolean;
  busy: boolean;
  issueIntegration: IssueIntegrationSettings;
  issueToken: string | null;
  pluginCustomInputs: readonly PluginCustomInputDefinition[];
  switchConnection: (id: string) => Promise<void>;
  startWithIssue: (payload: StartTaskPayload, issue: ExternalIssue | null, trackingKey?: string) => Promise<unknown>;
  openForm: (values: NewTaskFormInitialValues) => void;
  closeForm: () => void;
}

export function useTrayDeepLinks({
  client,
  activeConnectionId,
  connections,
  settingsReady,
  isConfigured,
  busy,
  issueIntegration,
  issueToken,
  pluginCustomInputs,
  switchConnection,
  startWithIssue,
  openForm,
  closeForm,
}: Options) {
  const [deepLinkQueue, setDeepLinkQueue] = useState<PendingDeepLink[]>([]);
  const [deepLinkProcessing, setDeepLinkProcessing] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const deepLinkSequenceRef = useRef(0);
  const attemptedConnectionSwitchesRef = useRef(new Set<number>());

  const timerActionsDisabled = busy || deepLinkProcessing;
  useEffect(
    () =>
      subscribeToDeepLinks((url) => {
        try {
          const request = parseKimaiTrayDeepLink(url);
          setDeepLinkError(null);
          closeForm();
          setDeepLinkQueue((current) => [
            ...current.slice(-19),
            { id: ++deepLinkSequenceRef.current, request },
          ]);
        } catch (error) {
          setDeepLinkError(
            error instanceof Error ? error.message : String(error),
          );
        }
      }),
    [closeForm],
  );
  useEffect(() => {
    const pending = deepLinkQueue[0];
    if (!pending || timerActionsDisabled) return;
    if (!settingsReady) return;

    const removePending = () => {
      attemptedConnectionSwitchesRef.current.delete(pending.id);
      setDeepLinkQueue((current) =>
        current[0]?.id === pending.id ? current.slice(1) : current,
      );
    };
    const failPending = (message: string) => {
      setDeepLinkError(message);
      removePending();
    };

    const requestedConnection = resolveDeepLinkConnectionId(
      pending.request,
      activeConnectionId,
    );
    if (requestedConnection && requestedConnection !== activeConnectionId) {
      if (!connections.some((connection) => connection.id === requestedConnection)) {
        failPending(`Deep-link connection "${requestedConnection}" does not exist`);
        return;
      }
      if (attemptedConnectionSwitchesRef.current.has(pending.id)) {
        failPending(`KimaiTray could not switch to connection "${requestedConnection}"`);
        return;
      }
      attemptedConnectionSwitchesRef.current.add(pending.id);
      setDeepLinkProcessing(true);
      void switchConnection(requestedConnection).finally(() => {
        setDeepLinkProcessing(false);
      });
      return;
    }

    if (!client || !isConfigured) {
      failPending("Configure the requested Kimai connection before using this deep link");
      return;
    }

    setDeepLinkProcessing(true);
    void (async () => {
      const request = pending.request;
      const metadata: Record<string, string> = {};
      const customInputValues: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.customFields)) {
        const input = pluginCustomInputs.find(
          (candidate) =>
            candidate.metadataName === name || candidate.id === name,
        );
        if (!input) {
          // The "new" form is interactive: if a plugin field the deep link
          // targets isn't enabled for this connection (plugin off, or no such
          // input), just open the form without it instead of failing. The
          // "start" action commits directly, so a missing field is surfaced.
          if (request.action === "new") continue;
          throw new Error(
            `Custom plugin field "${name}" is not enabled for this connection`,
          );
        }
        metadata[input.metadataName] = value;
        customInputValues[input.id] = value;
      }

      let description = request.description;
      let linkedIssue: ExternalIssue | null = null;
      // The interactive "new" form only needs the issue URL, which a custom
      // plugin field (e.g. Creative Issue Link) already carries. Resolving the
      // issue through the Git integration is a best-effort enrichment there, so
      // a missing integration must not abort the whole deep link. The "start"
      // action commits a timer directly and still requires a resolved issue.
      if (request.issueUrl && issueIntegration.enabled && issueToken) {
        const provider = createIssueProvider(
          issueIntegration,
          issueToken,
          activeConnectionId,
        );
        if (!provider.fetchIssueByUrl) {
          throw new Error("The configured Git provider cannot load issue URLs");
        }
        linkedIssue = await provider.fetchIssueByUrl(request.issueUrl);
        if (!linkedIssue && request.action === "start") {
          throw new Error(
            "The issue URL does not match an accessible issue on the configured Git provider",
          );
        }

        if (issueIntegration.autoInsertUrl) {
          // Opening the interactive form must keep working when GitLab is
          // temporarily unreachable. Use the original, already validated deep
          // link URL when the optional issue enrichment could not be loaded.
          const issueWebUrl = linkedIssue?.webUrl ?? request.issueUrl;
          const target =
            issueIntegration.autoInsertUrlTarget ?? DESCRIPTION_INPUT_TARGET;
          const customTarget = pluginCustomInputs.find(
            (input) => input.id === target,
          );
          if (customTarget) {
            metadata[customTarget.metadataName] ??= issueWebUrl;
            customInputValues[customTarget.id] ??= issueWebUrl;
          } else if (!description?.includes(issueWebUrl)) {
            description = description?.trim()
              ? `${description.trim()}\n${issueWebUrl}`
              : issueWebUrl;
          }
        }
      }

      if (request.issueUrl && request.action === "start" && !linkedIssue) {
        throw new Error(
          "Enable and authenticate the Git issue integration for this connection",
        );
      }

      if (request.action === "new") {
        openForm({
          description,
          tags: request.tags,
          customInputValues,
          selectedIssue: linkedIssue,
        });
        return;
      }

      const payload: StartTaskPayload = {
        projectId: request.projectId,
        activityId: request.activityId,
        begin: request.begin,
        description,
        tags: request.tags,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        label: request.label ?? `Project #${request.projectId}`,
      };
      await startWithIssue(payload, linkedIssue, `deep-link:${pending.id}`);
    })()
      .catch((error) => {
        setDeepLinkError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        removePending();
        setDeepLinkProcessing(false);
      });
  }, [
    activeConnectionId,
    client,
    connections,
    deepLinkProcessing,
    deepLinkQueue,
    isConfigured,
    timerActionsDisabled,
    issueIntegration,
    issueToken,
    pluginCustomInputs,
    settingsReady,
    startWithIssue,
    openForm,
    switchConnection,
  ]);

  return { deepLinkProcessing, deepLinkError, dismissDeepLinkError: () => setDeepLinkError(null) };
}
