export class PendingWriteEchoes<T> {
  private fingerprints: string[] = [];

  remember(value: T): void {
    this.fingerprints.push(JSON.stringify(value));
  }

  /** Consume this echo and any older writes coalesced by the backing store. */
  consume(value: T): boolean {
    const fingerprint = JSON.stringify(value);
    const index = this.fingerprints.indexOf(fingerprint);
    if (index < 0) return false;
    this.fingerprints.splice(0, index + 1);
    return true;
  }

  discard(value: T): void {
    const fingerprint = JSON.stringify(value);
    const index = this.fingerprints.lastIndexOf(fingerprint);
    if (index >= 0) this.fingerprints.splice(index, 1);
  }

  clear(): void {
    this.fingerprints = [];
  }
}
