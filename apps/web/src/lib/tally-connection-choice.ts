type ConnectionChoice = {id: string; pairedAt?: string | null; revoked?: boolean; bridgeConnected?: boolean};

/** UI preference only: input must already be filtered by the authorized API. */
export function chooseTallyConnection(
  connections: ConnectionChoice[],
  options: {explicitId?: string | null; previousId?: string | null; locallyPairedIds: string[]},
) {
  const explicit = connections.find(row => row.id === options.explicitId);
  if (explicit) return explicit.id;
  const local = connections.filter(row => !row.revoked && options.locallyPairedIds.includes(row.id))
    .sort((a, b) => (Date.parse(b.pairedAt || '') || 0) - (Date.parse(a.pairedAt || '') || 0));
  if (local.length) return local[0].id;
  const previous = connections.find(row => row.id === options.previousId);
  const connected = connections.filter(row => !row.revoked && row.bridgeConnected === true);
  // A stale shared selection should not hide the only connected PC after pairing.
  // Explicit choices above are retained even when that chosen PC is offline.
  if ((!previous || previous.bridgeConnected === false) && connected.length === 1) return connected[0].id;
  return previous?.id || connections[0]?.id || '';
}
