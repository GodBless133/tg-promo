// Shared in-memory state for Telegram auth flow between API routes
declare global {
  var __tgPhoneCodeHash: string | undefined;
}

export function getTgCodeHash(): string | undefined {
  return globalThis.__tgPhoneCodeHash;
}

export function setTgCodeHash(hash: string) {
  globalThis.__tgPhoneCodeHash = hash;
}

export function clearTgCodeHash() {
  globalThis.__tgPhoneCodeHash = undefined;
}