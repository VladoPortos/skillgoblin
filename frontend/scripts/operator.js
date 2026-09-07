#!/usr/bin/env node
import Database from 'better-sqlite3';
import { parseArgs } from 'node:util';
import { resolveDatabasePath } from '../server/utils/databasePath.js';
import { backupDatabase, restoreDatabase, resetPassword, validateDatabase } from '../server/utils/operatorRecovery.js';

const usage = `SkillGoblin operator tools
  node scripts/operator.js users [--database PATH]
  node scripts/operator.js backup --output PATH [--database PATH]
  node scripts/operator.js restore --input PATH --offline [--database PATH]
  node scripts/operator.js reset-password --user-id ID [--stdin] [--database PATH]

Stop every application process before restore. --offline acknowledges this.
Passwords are accepted only through a hidden terminal prompt or standard input.
`;

function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Use an interactive terminal or --stdin');
  process.stderr.write(label);
  process.stdin.setEncoding('utf8'); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause();
      process.stderr.write('\n'); error ? reject(error) : resolve(value);
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\u0003' || char === '\u0004') return finish(new Error('Cancelled'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
        if (value.length > 1024) return finish(new Error('Password is too long'));
      }
    };
    process.stdin.on('data', onData);
  });
}

async function readPassword(stdin) {
  if (stdin) {
    process.stdin.setEncoding('utf8');
    let text = '';
    for await (const chunk of process.stdin) {
      text += chunk.toString('utf8');
      if (Buffer.byteLength(text) > 4096) throw new Error('Password input is too long');
    }
    text = text.replace(/\r?\n$/, '');
    if (/[\r\n]/.test(text)) throw new Error('Standard input must contain one password line');
    return text;
  }
  const password = await hiddenPrompt('New password (12+ characters): ');
  if (password !== await hiddenPrompt('Confirm password: ')) throw new Error('Passwords do not match');
  return password;
}

try {
  // Do not print parser error text: it can contain a mistakenly supplied secret.
  let args;
  try { args = parseArgs({ allowPositionals: true, options: { database:{type:'string'}, output:{type:'string'}, input:{type:'string'}, 'user-id':{type:'string'}, offline:{type:'boolean'}, stdin:{type:'boolean'}, help:{type:'boolean'} } }); }
  catch { throw new Error('Invalid command options. Use --help; never pass passwords as arguments.'); }
  const { values, positionals } = args;
  if (values.help || !positionals.length) { process.stdout.write(usage); }
  else {
    if (positionals.length !== 1) throw new Error('Expected one command; never pass passwords as arguments');
    const command = positionals[0];
    const database = values.database || resolveDatabasePath();
    if (command === 'backup') {
      if (!values.output) throw new Error('backup requires --output');
      console.log(`Backup created: ${await backupDatabase(database, values.output)}`);
    } else if (command === 'restore') {
      if (!values.input) throw new Error('restore requires --input');
      const result = await restoreDatabase(values.input, database, { offline: values.offline });
      console.log(`Restored: ${result.database}\nSafety backup: ${result.safetyBackup || 'No previous database'}`);
    } else if (command === 'users' || command === 'reset-password') {
      const db = new Database(database, { fileMustExist: true });
      try {
        validateDatabase(db);
        if (command === 'users') console.table(db.prepare('SELECT id,name,isAdmin,is_active FROM users ORDER BY name').all());
        else {
          if (!values['user-id']) throw new Error('reset-password requires --user-id');
          await resetPassword(db, values['user-id'], await readPassword(values.stdin));
          console.log('Password reset. PIN cleared; all sessions and credential-upgrade tokens revoked.');
        }
      } finally { db.close(); }
    } else throw new Error('Unknown command. Use --help.');
  }
} catch (error) {
  console.error(`Operator command failed: ${error.message}`);
  process.exitCode = 1;
}
