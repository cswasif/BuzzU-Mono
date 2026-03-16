export function shouldMarkSignalReady(params: {
  partnerId: string | null | undefined;
  isCryptoReady: boolean;
  hasSignalSession: boolean;
}): boolean {
  return !!params.partnerId && params.isCryptoReady && params.hasSignalSession;
}
