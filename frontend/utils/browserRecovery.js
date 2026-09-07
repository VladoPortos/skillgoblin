// Tab IDs identify local recovery records, not credentials. Ordinary LAN HTTP
// does not expose randomUUID in every browser, so it must have a fallback.
export function openProgressRecovery(browser) {
  const tabKey = 'sg-progress-tab';
  let storage = null;
  try { storage = browser.localStorage; } catch { /* Recovery is optional. */ }
  const fallbackId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let tabId = fallbackId();
  try {
    tabId = browser.sessionStorage.getItem(tabKey) || browser.crypto?.randomUUID?.() || tabId;
    browser.sessionStorage.setItem(tabKey, tabId);
  } catch { /* Keep a unique per-page ID if session storage is blocked. */ }
  return { storage, tabId, storageUnavailable: !storage };
}
