import { describe, expect, it } from 'vitest';
import { openProgressRecovery } from '../../utils/browserRecovery.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

describe('progress recovery on local HTTP', () => {
  it('keeps browser storage and a stable tab ID when randomUUID is unavailable', () => {
    const browser = { localStorage: memoryStorage(), sessionStorage: memoryStorage(), crypto: {} };
    const first = openProgressRecovery(browser);
    expect(first.storage).toBe(browser.localStorage);
    expect(first.storageUnavailable).toBe(false);
    expect(first.tabId).toBeTruthy();
    expect(openProgressRecovery(browser).tabId).toBe(first.tabId);
  });

  it('does not mistake blocked session storage for blocked recovery storage', () => {
    const browser = { localStorage: memoryStorage(), get sessionStorage() { throw new Error('blocked'); } };
    const first = openProgressRecovery(browser);
    expect(first.storageUnavailable).toBe(false);
    expect(first.storage).toBe(browser.localStorage);
    expect(openProgressRecovery(browser).tabId).not.toBe(first.tabId);
  });

  it('reports unavailable local storage separately', () => {
    const result = openProgressRecovery({ get localStorage() { throw new Error('blocked'); }, sessionStorage: memoryStorage() });
    expect(result.storage).toBeNull();
    expect(result.storageUnavailable).toBe(true);
    expect(result.tabId).toBeTruthy();
  });
});
