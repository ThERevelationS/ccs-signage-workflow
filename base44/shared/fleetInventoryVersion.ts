export function requireFleetInventoryExpectedVersion(clientVersion: unknown): string {
  return String(clientVersion || '').trim();
}
