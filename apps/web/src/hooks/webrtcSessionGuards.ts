export function isStaleOfferSession(
  incomingSessionTs?: number,
  lastRemoteSessionTs?: number,
): boolean {
  if (typeof incomingSessionTs !== 'number' || typeof lastRemoteSessionTs !== 'number') {
    return false;
  }
  return incomingSessionTs < lastRemoteSessionTs;
}

export function isStaleAnswerSession(
  incomingSessionTs?: number,
  expectedLocalSessionTs?: number,
): boolean {
  if (typeof incomingSessionTs !== 'number' || typeof expectedLocalSessionTs !== 'number') {
    return false;
  }
  return incomingSessionTs < expectedLocalSessionTs;
}

export function isStaleIceSession(
  candidateSessionTs?: number,
  activeSessionTs?: number,
): boolean {
  if (typeof candidateSessionTs !== 'number' || typeof activeSessionTs !== 'number') {
    return false;
  }
  return candidateSessionTs < activeSessionTs;
}
