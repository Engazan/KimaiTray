import { saveApiToken, getApiToken, deleteApiToken } from "./secureStore";

// Kimai API tokens used to be stored keyed by the server URL, which meant two
// connections to the same server shared (and overwrote) one token. They are now
// keyed by the connection's id so each connection keeps its own token.
function connectionTokenKey(connectionId: string): string {
  return `conn-token:${connectionId}`;
}

export async function saveConnectionToken(
  connectionId: string,
  token: string,
): Promise<void> {
  if (!connectionId) return;
  return saveApiToken(connectionTokenKey(connectionId), token);
}

/**
 * Loads the token for a connection. Falls back to a legacy token stored under
 * the server URL and transparently migrates it to the id-based key, so existing
 * installs keep working after the upgrade.
 */
export async function getConnectionToken(
  connectionId: string,
  legacyUrl?: string,
): Promise<string | null> {
  if (connectionId) {
    const byId = await getApiToken(connectionTokenKey(connectionId));
    if (byId) return byId;
  }
  if (legacyUrl) {
    const legacy = await getApiToken(legacyUrl);
    if (legacy) {
      if (connectionId) {
        await saveConnectionToken(connectionId, legacy);
        // Remove the URL alias only after the id-scoped credential has been
        // verified by the native secure-store command.
        await deleteApiToken(legacyUrl);
      }
      return legacy;
    }
  }
  return null;
}

export async function deleteConnectionToken(
  connectionId: string,
): Promise<void> {
  if (!connectionId) return;
  return deleteApiToken(connectionTokenKey(connectionId));
}
