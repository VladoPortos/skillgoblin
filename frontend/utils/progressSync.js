const clone = value => JSON.parse(JSON.stringify(value || {}));
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const safeKey = key => !['__proto__','constructor','prototype'].includes(key);

// A patch records intent relative to the last acknowledged snapshot. Rebase
// only those keys, preserving unrelated work from another tab/device.
export function makeProgressPatch(before = {}, after = {}) {
  const patch = {};
  for (const field of ['completed','progress']) {
    const changes = {};
    for (const key of new Set([...Object.keys(before[field] || {}), ...Object.keys(after[field] || {})])) {
      if (safeKey(key) && !equal(before[field]?.[key], after[field]?.[key])) changes[key] = after[field]?.[key] ?? null;
    }
    if (Object.keys(changes).length) patch[field] = changes;
  }
  for (const field of ['favorite','lastViewed']) {
    if (!equal(before[field],after[field])) patch[field] = after[field] ?? null;
  }
  return patch;
}

export function applyProgressPatch(data = {}, patch = {}) {
  const result = clone(data);
  for (const field of ['completed','progress']) {
    if (!patch[field]) continue;
    result[field] = {...result[field]};
    for (const [key,value] of Object.entries(patch[field])) {
      if (!safeKey(key)) continue;
      if (value === null) delete result[field][key]; else result[field][key] = value;
    }
  }
  for (const field of ['favorite','lastViewed']) {
    if (Object.hasOwn(patch,field)) {
      if (patch[field] === null) delete result[field]; else result[field] = clone({v:patch[field]}).v;
    }
  }
  return result;
}

// Preserve keys touched by an attempted write even when a later edit returns
// them to their old value. A failed response does not prove the write failed.
function mergePatches(first, second) {
  const merged = {...first,...second};
  for (const field of ['completed','progress']) {
    if (first[field] || second[field]) merged[field] = {...first[field],...second[field]};
  }
  return merged;
}

export function createProgressSync({ read, write, storage, key, recoveryPrefix, onState = () => {}, onData = () => {} }) {
  let base = {}, desired = {}, revision = 0, ready = false, running = null, disposed = false, timer = null, failures = 0;
  const owner = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  let state = 'saved';
  let heldRecord = false, needsRefresh = false, releaseRequested = false;
  let inFlight = null, uncertainPatch = null, uncertainBase = null;
  function report(next) { state = next; onState(next); }
  function pendingPatch() {
    if (inFlight) return mergePatches(makeProgressPatch(base,inFlight),makeProgressPatch(inFlight,desired));
    if (uncertainPatch) return mergePatches(uncertainPatch,makeProgressPatch(uncertainBase,desired));
    return makeProgressPatch(base,desired);
  }
  const dirty = () => Object.keys(pendingPatch()).length > 0;
  function refreshOwnership() {
    if (!heldRecord) return;
    try {
      const record = JSON.parse(storage?.getItem(key) || 'null');
      if (record?.owner === owner) return;
      // The old pending intent was adopted elsewhere. Only edits made after
      // resuming belong to this instance; fetch a fresh base before writing.
      base = clone(desired);
      uncertainPatch = null; uncertainBase = null;
      needsRefresh = true;
      heldRecord = false;
      key += ':instance:' + owner;
    } catch { onState('storage-error'); }
  }
  function persist(claim = false, released = (disposed || releaseRequested) && !running) {
    try {
      const current = JSON.parse(storage?.getItem(key) || 'null');
      // A new page may already have recovered this record while an old request
      // was in flight. Its work is never removed by the old acknowledgement.
      if (!claim && ((current?.owner && current.owner !== owner) || (heldRecord && !current))) return false;
      if (disposed && !current) return false;
      if (dirty()) storage?.setItem(key,JSON.stringify({base,desired,patch:pendingPatch(),owner,updatedAt:Date.now(),released}));
      else storage?.removeItem(key);
      heldRecord = !!storage && dirty();
      return !!storage;
    } catch { onState('storage-error'); return false; }
  }
  function hydrate(data, version) {
    base = clone(data); desired = clone(data); revision = version || 0; ready = true;
    const recovered = [];
    try {
      let pending = JSON.parse(storage?.getItem(key) || 'null');
      if (pending?.owner && pending.owner !== owner && !pending.released && Date.now()-pending.updatedAt <= 120000) {
        key += ':instance:' + owner;
        pending = null;
      }
      if (pending?.base && pending?.desired) desired = applyProgressPatch(base,pending.patch || makeProgressPatch(pending.base,pending.desired));
      if (storage && recoveryPrefix) {
        for (let i=0;i<storage.length;i++) {
          const candidate = storage.key(i);
          if (!candidate?.startsWith(recoveryPrefix) || candidate === key) continue;
          const record = JSON.parse(storage.getItem(candidate) || 'null');
          if (record?.base && record?.desired && (record.released || Date.now()-record.updatedAt > 120000)) {
            desired = applyProgressPatch(desired,record.patch || makeProgressPatch(record.base,record.desired));
            recovered.push([candidate,record.owner]);
          }
        }
      }
    } catch { /* Ignore invalid local recovery data. */ }
    if (persist(true)) {
      for (const [candidate,previousOwner] of recovered) {
        try { if (JSON.parse(storage.getItem(candidate) || 'null')?.owner === previousOwner) storage.removeItem(candidate); } catch {}
      }
    }
    onData(clone(desired)); report(dirty() ? 'pending' : 'saved');
  }
  function stage(data) {
    if (!ready || disposed) return;
    refreshOwnership();
    releaseRequested = false;
    desired = clone(data); persist();
    if (state !== 'error') report(dirty() ? 'pending' : 'saved');
  }
  async function refreshBase() {
    const latest = await read();
    const patch = pendingPatch();
    base = clone(latest.data); revision = latest.revision || 0;
    desired = applyProgressPatch(base,patch);
    needsRefresh = false; uncertainPatch = null; uncertainBase = null;
    onData(clone(desired)); persist();
  }
  async function drain(options) {
    if (needsRefresh) await refreshBase();
    let conflicts = 0;
    while (dirty()) {
      const snapshot = clone(desired);
      inFlight = snapshot;
      persist();
      report('saving');
      try {
        const result = await write(snapshot,revision,options);
        inFlight = null;
        base = snapshot; revision = result.revision; failures = 0; conflicts = 0; persist();
      } catch (error) {
        // Keep the full touched-key intent, including cancellation back to the
        // acknowledged base, until a fresh read resolves the unknown outcome.
        uncertainPatch = pendingPatch(); uncertainBase = clone(desired);
        inFlight = null; needsRefresh = true; persist();
        if ((error?.statusCode || error?.status) === 409 && conflicts++ < 3) {
          await refreshBase();
          continue;
        }
        throw error;
      }
    }
    report('saved');
  }
  function flush(options = {}) {
    if (!ready || disposed) return Promise.resolve(false);
    if (timer) { clearTimeout(timer); timer = null; }
    if (running) return running;
    refreshOwnership();
    running = drain(options).then(() => true).catch(() => {
      persist(); report('error');
      if (!disposed && !releaseRequested) timer = setTimeout(() => { timer = null; flush(); },Math.min(30000,1000 * 2 ** Math.min(failures++,5)));
      return false;
    }).finally(() => { running = null; if (releaseRequested || disposed) persist(false,true); });
    return running;
  }
  function release() {
    releaseRequested = true;
    if (timer) { clearTimeout(timer); timer = null; }
    persist(false,!running);
  }
  function dispose() { disposed = true; if (timer) clearTimeout(timer); release(); }
  return {hydrate,stage,flush,release,dispose,hasPending:dirty};
}
