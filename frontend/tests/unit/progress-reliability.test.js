import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import migration from '../../server/migrations/006_stable_progress.js';
import { addVideoIds } from '../../server/utils/videoIdentity.js';
import { makeProgressPatch, applyProgressPatch, createProgressSync } from '../../utils/progressSync.js';
import { writeProgress, readProgress } from '../../server/utils/progressStore.js';

describe('stable progress and concurrent saves', () => {
  it('preserves video identity when a preceding file is inserted', () => {
    const course = addVideoIds({ lessons: [{ id: 'main', folder: '', videos: [{ file: '02.mp4' }] }] });
    const next = addVideoIds({ lessons: [{ id: 'main', folder: '', videos: [{ file: '01.mp4' }, { file: '02.mp4' }] }] });
    expect(course.lessons[0].videos[0].id).toBe(next.lessons[0].videos[1].id);
  });

  function database() {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('u');
      CREATE TABLE courses(id TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE user_progress(user_id TEXT PRIMARY KEY, progress TEXT, updated_at TEXT);`);
    db.prepare('INSERT INTO courses VALUES(?,?)').run('c', JSON.stringify({ id: 'c', lessons: [{id:'main',folder:'',videos:[{file:'02.mp4'}]}] }));
    db.prepare('INSERT INTO user_progress VALUES(?,?,NULL)').run('u', JSON.stringify({c:{completed:{'main-0':true},progress:{'main-0':45},favorite:true}}));
    migration.up(db);
    return db;
  }
  it('migrates legacy keys from the stored tree, not current disk order', () => {
    const db = database();
    const course = JSON.parse(db.prepare('SELECT data FROM courses').get().data);
    const data = readProgress(db, 'u').progress.c;
    expect(data.completed[course.lessons[0].videos[0].id]).toBe(true);
    expect(data.progress[course.lessons[0].videos[0].id]).toBe(45);
    expect(data.completed['main-0']).toBeUndefined();
    db.close();
  });
  it('rejects stale snapshots and preserves unrelated changes on rebase', () => {
    const db = database();
    const original = readProgress(db, 'u').progress.c;
    const a = { ...original, favorite: false };
    writeProgress(db, 'u', 'c', a, 0);
    const b = { ...original, progress: { ...original.progress, another: 20 } };
    expect(() => writeProgress(db, 'u', 'c', b, 0)).toThrow(/changed/i);
    const current = readProgress(db, 'u');
    const rebased = applyProgressPatch(current.progress.c, makeProgressPatch(original, b));
    writeProgress(db, 'u', 'c', rebased, current.revisions.c);
    expect(readProgress(db,'u').progress.c.favorite).toBe(false);
    expect(readProgress(db,'u').progress.c.progress.another).toBe(20);
    expect(() => writeProgress(db,'u','c',a,undefined)).toThrow();
    db.close();
  });
  it('represents explicit resets without deleting unrelated changes from another device', () => {
    const patch = makeProgressPatch({completed:{a:true},progress:{a:40}}, {completed:{},progress:{}});
    expect(applyProgressPatch({completed:{a:true,b:true},progress:{a:70,b:20}}, patch))
      .toEqual({completed:{b:true},progress:{b:20}});
  });
  it('rebases a conflict and keeps edits made while the save is in flight', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const writes = [];
    const sync = createProgressSync({
      read: async () => ({data:{favorite:true,completed:{remote:true}},revision:1}),
      write: async (data,revision) => {
        writes.push({data,revision});
        if (writes.length === 1) { await gate; throw {statusCode:409}; }
        return {revision:2};
      }
    });
    sync.hydrate({favorite:true,completed:{}},0);
    sync.stage({favorite:false,completed:{}});
    const saving = sync.flush();
    sync.stage({favorite:false,completed:{local:true}});
    release();
    expect(await saving).toBe(true);
    expect(writes[1]).toEqual({data:{favorite:false,completed:{remote:true,local:true}},revision:1});
    sync.dispose();
  });
  it('retains failed work in browser storage and restores only local changes', async () => {
    const entries = new Map();
    const storage = {getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
    const sync = createProgressSync({key:'test',storage,write:async()=>{throw new Error('offline');}});
    sync.hydrate({favorite:false,completed:{}},0);
    sync.stage({favorite:true,completed:{}});
    expect(await sync.flush()).toBe(false);
    sync.dispose();
    let restored;
    const recovery = createProgressSync({key:'test',storage,onData:data=>{restored=data;},write:async()=>({revision:2})});
    recovery.hydrate({favorite:false,completed:{remote:true}},1);
    expect(restored).toEqual({favorite:true,completed:{remote:true}});
    expect(await recovery.flush()).toBe(true);
    expect(entries.size).toBe(0);
    recovery.dispose();
  });
  it('does not let a disposed page erase a newer page recovery record', async () => {
    const entries = new Map();
    const storage = {getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
    let release;
    const old = createProgressSync({key:'same',storage,write:()=>new Promise(resolve=>{release=resolve;})});
    old.hydrate({favorite:false},0); old.stage({favorite:true}); const pending=old.flush(); old.dispose();
    const next = createProgressSync({key:'same',storage,write:async()=>({revision:2})});
    next.hydrate({favorite:false},0); next.stage({favorite:true,completed:{new:true}});
    release({revision:1}); await pending;
    expect([...entries.values()].map(value => JSON.parse(value).desired)).toEqual([{favorite:true,completed:{new:true}}]);
    next.dispose();
  });
  it('recovers a closed tab without claiming live work from another tab', () => {
    const entries = new Map();
    const storage = {get length(){return entries.size;},key:i=>[...entries.keys()][i],getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
    const closed = createProgressSync({key:'prefix:closed',storage});
    closed.hydrate({},0);closed.stage({favorite:true});closed.dispose();
    const live = createProgressSync({key:'prefix:live',storage});
    live.hydrate({},0);live.stage({completed:{live:true}});
    let recovered;
    const next = createProgressSync({key:'prefix:new',recoveryPrefix:'prefix:',storage,onData:data=>{recovered=data;}});
    next.hydrate({},0);
    expect(recovered).toEqual({favorite:true});
    expect(entries.has('prefix:closed')).toBe(false);
    expect(entries.has('prefix:live')).toBe(true);
    next.dispose();live.dispose();
  });
});

function recoveryStorage() {
  const entries = new Map();
  return { entries, storage: { get length(){return entries.size;},key:i=>[...entries.keys()][i],getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k) } };
}
it('does not release work for adoption until an in-flight request settles', async () => {
  const {entries,storage}=recoveryStorage();let rejectWrite;
  const old=createProgressSync({key:'p:old',storage,write:()=>new Promise((resolve,reject)=>{rejectWrite=reject;})});
  old.hydrate({favorite:false},0);old.stage({favorite:true});const saving=old.flush();old.release();
  expect(JSON.parse(entries.get('p:old')).released).toBe(false);
  let data;
  const next=createProgressSync({key:'p:new',storage,recoveryPrefix:'p:',onData:value=>{data=value;}});
  next.hydrate({favorite:false},0);expect(data.favorite).toBe(false);
  rejectWrite(new Error('offline'));await saving;
  expect(JSON.parse(entries.get('p:old')).released).toBe(true);
  old.dispose();next.dispose();
});
it('a resumed adopted owner rebases only newly staged intent', async () => {
  const {storage}=recoveryStorage();let server={favorite:false};let revision=0;
  const write=async(data)=>{server=JSON.parse(JSON.stringify(data));return {revision:++revision};};
  const read=async()=>({data:server,revision});
  const old=createProgressSync({key:'p:old',storage,write,read});
  old.hydrate(server,revision);old.stage({favorite:true});old.release();
  const next=createProgressSync({key:'p:new',storage,recoveryPrefix:'p:',write,read});
  next.hydrate(server,revision);await next.flush();next.stage({favorite:false});await next.flush();
  old.stage({favorite:true,completed:{new:true}});await old.flush();
  expect(server).toEqual({favorite:false,completed:{new:true}});
  old.dispose();next.dispose();
});

it('a same-tab revisit does not adopt an unsettled request', async () => {
  const {storage}=recoveryStorage();let complete;
  const old=createProgressSync({key:'p:tab',storage,write:()=>new Promise(resolve=>{complete=resolve;})});
  old.hydrate({favorite:false},0);old.stage({favorite:true});const saving=old.flush();old.dispose();
  let recovered;
  const next=createProgressSync({key:'p:tab',storage,recoveryPrefix:'p:',onData:data=>{recovered=data;}});
  next.hydrate({favorite:false},0);
  expect(recovered).toEqual({favorite:false});
  complete({revision:1});await saving;next.dispose();
});

it('retries canceled intent after the attempted write committed but its response was lost', async () => {
  const {storage}=recoveryStorage();let release;let server={favorite:false,completed:{}};let revision=0;let calls=0;
  const sync=createProgressSync({key:'ambiguous',storage,read:async()=>({data:server,revision}),write:async data=>{
    server=JSON.parse(JSON.stringify(data));revision++;
    if (++calls===1) { await new Promise(resolve=>{release=resolve;});server.completed.remote=true;revision++;throw new Error('response lost'); }
    return {revision};
  }});
  sync.hydrate(server,revision);sync.stage({favorite:true,completed:{}});const saving=sync.flush();
  sync.stage({favorite:false,completed:{}});release();expect(await saving).toBe(false);
  expect(sync.hasPending()).toBe(true);
  expect(await sync.flush()).toBe(true);
  expect(server).toEqual({favorite:false,completed:{remote:true}});sync.dispose();
});
it('persists canceled in-flight intent for recovery after closing the page', async () => {
  const {entries,storage}=recoveryStorage();let rejectWrite;
  const old=createProgressSync({key:'ambiguous',storage,write:()=>new Promise((resolve,reject)=>{rejectWrite=reject;})});
  old.hydrate({favorite:false},0);old.stage({favorite:true});const saving=old.flush();old.stage({favorite:false});
  expect(entries.has('ambiguous')).toBe(true);
  old.dispose();rejectWrite(new Error('response lost'));await saving;
  let recovered;
  const next=createProgressSync({key:'ambiguous',storage,onData:data=>{recovered=data;}});
  next.hydrate({favorite:true,completed:{remote:true}},1);
  expect(recovered).toEqual({favorite:false,completed:{remote:true}});next.dispose();
});

it('rebases canceled video keys after response loss without clearing other videos', async () => {
  let fail;let server={completed:{},progress:{}};let revision=0;let calls=0;
  const sync=createProgressSync({read:async()=>({data:server,revision}),write:async data=>{
    server=JSON.parse(JSON.stringify(data));revision++;
    if (++calls===1) {
      await new Promise(resolve=>{fail=resolve;});
      server.completed.remote=true;server.progress.remote=30;revision++;
      throw new Error('response lost');
    }
    return {revision};
  }});
  sync.hydrate(server,0);sync.stage({completed:{local:true},progress:{local:80}});const saving=sync.flush();
  sync.stage({completed:{},progress:{}});fail();await saving;
  expect(await sync.flush()).toBe(true);
  expect(server).toEqual({completed:{remote:true},progress:{remote:30}});sync.dispose();
});
