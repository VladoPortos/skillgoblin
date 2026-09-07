import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../../server/utils/migrations.js';
import { backupDatabase, restoreDatabase, resetPassword } from '../../server/utils/operatorRecovery.js';
import { resolveDatabasePath } from '../../server/utils/databasePath.js';
import { createSession, createCredentialUpgrade } from '../../server/utils/sessions.js';
import { verifyCredential } from '../../server/utils/credentials.js';
let dir, file, db;
beforeEach(() => { dir=fs.mkdtempSync(path.join(os.tmpdir(),'sg-recovery-')); file=path.join(dir,'db.sqlite'); db=new Database(file); runMigrations(db); db.prepare("INSERT INTO users(id,name,isAdmin,is_active) VALUES('admin','Admin',1,1)").run(); });
afterEach(() => { if(db?.open) db.close(); fs.rmSync(dir,{recursive:true,force:true}); });
it('resolves aliases at invocation time with explicit runtime precedence', () => { expect(resolveDatabasePath({DB_PATH:'./legacy'})).toBe(path.resolve('./legacy')); expect(resolveDatabasePath({DATABASE_PATH:'./new',DB_PATH:'./old'})).toBe(path.resolve('./new')); expect(resolveDatabasePath({NUXT_DATABASE_PATH:'./nuxt',DATABASE_PATH:'./new'})).toBe(path.resolve('./nuxt')); });
it('backs up committed WAL data and restores offline with a safety copy', async () => {
 db.pragma('journal_mode=WAL'); db.prepare("UPDATE users SET name='Snapshot' WHERE id='admin'").run();
 const backup=path.join(dir,'backup.sqlite'); await backupDatabase(file,backup);
 db.prepare("UPDATE users SET name='After' WHERE id='admin'").run(); db.close();
 const { safetyBackup }=await restoreDatabase(backup,file,{offline:true});
 db=new Database(file); expect(db.prepare('SELECT name FROM users').get().name).toBe('Snapshot');
 const safety=new Database(safetyBackup,{readonly:true}); expect(safety.prepare('SELECT name FROM users').get().name).toBe('After'); safety.close();
});
it('refuses restore without explicit offline mode and leaves target intact', async () => { await expect(restoreDatabase(file,path.join(dir,'other'))).rejects.toThrow(/offline/i); });
it('rejects invalid restore input before changing target', async () => { const bad=path.join(dir,'bad');fs.writeFileSync(bad,'not sqlite'); await expect(restoreDatabase(bad,file,{offline:true})).rejects.toThrow();expect(db.prepare('SELECT name FROM users').get().name).toBe('Admin'); });
it('recovers a credential-less admin and revokes sessions and bridge credentials', async () => {
 createSession(db,'admin');createCredentialUpgrade(db,'admin'); await resetPassword(db,'admin','replacement-password');
 const user=db.prepare('SELECT * FROM users').get();expect((await verifyCredential('replacement-password',user.password)).ok).toBe(true);expect(user.isAdmin).toBe(1);expect(user.pin).toBeNull();
 expect(db.prepare('SELECT count(*) n FROM user_sessions').get().n).toBe(0);expect(db.prepare('SELECT count(*) n FROM credential_upgrades').get().n).toBe(0);
});

it('restoring a backup does not resurrect logged out sessions', async () => {
 createSession(db,'admin');createCredentialUpgrade(db,'admin');const snapshot=path.join(dir,'sessions.sqlite');await backupDatabase(file,snapshot);db.close();await restoreDatabase(snapshot,file,{offline:true});db=new Database(file);expect(db.prepare('SELECT count(*) n FROM user_sessions').get().n).toBe(0);expect(db.prepare('SELECT count(*) n FROM credential_upgrades').get().n).toBe(0);
});
it('never overwrites an existing backup', async () => { const output=path.join(dir,'keep');fs.writeFileSync(output,'keep');await expect(backupDatabase(file,output)).rejects.toThrow();expect(fs.readFileSync(output,'utf8')).toBe('keep'); });

it('CLI resets from stdin using runtime DB_PATH without exposing the password', async () => {
 const { spawnSync } = await import('node:child_process');
 const password='private-cli-password';
 const result=spawnSync(process.execPath,['scripts/operator.js','reset-password','--user-id','admin','--stdin'],{cwd:process.cwd(),env:{...process.env,NUXT_DATABASE_PATH:'',DATABASE_PATH:'',DB_PATH:file},input:password+'\n',encoding:'utf8'});
 expect(result.status).toBe(0);expect(result.stdout+result.stderr).not.toContain(password);expect((await verifyCredential(password,db.prepare('SELECT password FROM users').get().password)).ok).toBe(true);
});
it('CLI refuses password arguments without echoing them', async () => {
 const { spawnSync } = await import('node:child_process');const password='mistaken-secret';
 const result=spawnSync(process.execPath,['scripts/operator.js','reset-password','--password',password],{cwd:process.cwd(),encoding:'utf8'});
 expect(result.status).toBe(1);expect(result.stdout+result.stderr).not.toContain(password);
});

it('CLI preserves a Unicode password split across stdin byte chunks', async () => {
  const { spawn } = await import('node:child_process');
  const password = 'unicode-password-\u{1f680}';
  const bytes = Buffer.from(password + '\n', 'utf8');
  const child = spawn(process.execPath, ['scripts/operator.js', 'reset-password', '--user-id', 'admin', '--stdin', '--database', file], {
    cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  // Leave the first two bytes of the four-byte character in the first chunk.
  child.stdin.write(bytes.subarray(0, bytes.length - 3));
  await new Promise(resolve => setTimeout(resolve, 500));
  child.stdin.end(bytes.subarray(bytes.length - 3));
  expect(await completion).toBe(0);
  expect(output).not.toContain(password);
  const stored = db.prepare('SELECT password FROM users WHERE id = ?').get('admin').password;
  expect((await verifyCredential(password, stored)).ok).toBe(true);
});
