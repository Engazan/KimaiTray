/** An explicit rejection before a time entry was accepted. Network failures,
 * HTTP 408 and server errors remain ambiguous and must not be replayed.
 */
export class SpentTimeRejectedError extends Error {
  constructor(readonly status: number) {
    super(`Failed to log time: ${status}`);
  }
}
