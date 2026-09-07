import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { createApp, toNodeListener } from 'h3';
const race = vi.hoisted(() => { vi.resetModules(); return { afterVerify: null }; });
vi.mock('../../server/utils/credentials', async (original) => {
  const real = await original();
  return { ...real, verifyCredential: async (...args) => {
    const result = await real.verifyCredential(...args);
    race.afterVerify?.();
    return result;
  }};
});
import { getDb } from '../../server/utils/db.js';
import { hashCredential } from '../../server/utils/credentials.js';
import handler from '../../server/api/users/auth.js';
let server, url;
beforeAll(async () => {
 const app = createApp(); app.use(handler); server = createServer(toNodeListener(app));
 await new Promise(r => server.listen(0, '127.0.0.1', r)); url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { race.afterVerify = null; await new Promise(r => server.close(r)); });
for (const change of ['password', 'inactive', 'pin-policy']) it(`rejects authentication when ${change} changes during verification`, async () => {
 const db = getDb(), id = `race-${change}`;
 const hash = await hashCredential('valid-password');
 db.prepare('INSERT INTO users (id,name,password,pin,isAdmin,is_active) VALUES (?,?,?,?,0,1)').run(id,id,hash,hash);
 race.afterVerify = () => {
   if (change === 'password') db.prepare('UPDATE users SET password = ? WHERE id = ?').run('reset-value',id);
   if (change === 'inactive') db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
   if (change === 'pin-policy') db.prepare("INSERT OR REPLACE INTO system_settings (key,value) VALUES ('allow_pin','false')").run();
 };
 try {
   const res = await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:id,[change === 'pin-policy' ? 'pin' : 'password']:'valid-password'})});
   expect((await res.json()).success).toBe(false);
   expect(res.headers.get('set-cookie')).toBeNull();
   expect(db.prepare('SELECT count(*) n FROM user_sessions WHERE user_id = ?').get(id).n).toBe(0);
 } finally { race.afterVerify = null; db.prepare('DELETE FROM users WHERE id = ?').run(id); db.prepare("UPDATE system_settings SET value='true' WHERE key='allow_pin'").run(); }
});
