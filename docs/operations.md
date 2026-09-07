# Backup, restore, and administrator recovery

Run these commands from the repository directory. Examples use the production Compose file and service `skillgoblin`; substitute your Compose file if different. The production image includes `/app/scripts/operator.js`. It operates on the same SQLite database as the server.

## Database selection and permissions

The database path is resolved when the process starts, in this order: `NUXT_DATABASE_PATH`, `DATABASE_PATH`, `DB_PATH`, Nuxt runtime configuration, then `/app/data/database/database.sqlite`. The CLI also accepts `--database /absolute/path.sqlite`, which takes priority. Use the same configuration for server and CLI. A wrong path is rejected by operator commands rather than silently creating an empty database.

The database directory and backups must be writable by container UID/GID 1000:1000. The image entrypoint repairs ownership of standard data directories when launched as root and drops privileges. `docker compose exec` bypasses that entrypoint, so the examples explicitly use `--user 1000:1000`. Keep backups private: they contain profiles, password hashes, settings, progress, metadata, and thumbnail blobs. New backup files use mode 0600 on systems supporting Unix permissions. Copy a backup off the host and test recovery periodically.

## Consistent live backup

Choose a new filename for every backup; existing files are never overwritten.

```sh
docker compose -f docker-compose.prod.yml exec --user 1000:1000 skillgoblin node /app/scripts/operator.js backup --output /app/data/database/backups/skillgoblin-2026-09-07.sqlite
```

This uses SQLite's online backup API and includes committed WAL data, then checks database integrity, foreign keys, required schema, and migration compatibility. It does not require stopping the server. Do not copy a live `.sqlite` file alone: recent writes can be in its WAL sidecar.

In the example Compose layout the result is on the host at `data/database/backups/skillgoblin-2026-09-07.sqlite`. Back up `data/content` (course media and filesystem course metadata), `data/branding`, and your Compose/environment configuration separately. These are not part of the database snapshot. Never put passwords in filenames or command arguments.

## Offline restore

Stop **every** application container/process using this database, including replicas, development servers, watchers, and any scheduled writers. `--offline` acknowledges that you have done this; the CLI cannot reliably detect an idle process holding the database open. Never use `exec` against the running service to restore. Avoid concurrent recovery commands.

```sh
docker compose -f docker-compose.prod.yml stop skillgoblin
docker compose -f docker-compose.prod.yml run --rm --no-deps skillgoblin node /app/scripts/operator.js restore --input /app/data/database/backups/skillgoblin-2026-09-07.sqlite --offline
docker compose -f docker-compose.prod.yml up -d skillgoblin
docker compose -f docker-compose.prod.yml logs --tail 100 skillgoblin
```

Only restart after the restore command succeeds. It first creates and validates a private snapshot of the input. Before replacing an existing target, it creates a consistent safety copy beside the database named `database.sqlite.before-restore-<timestamp>-<random>.sqlite` and prints its path. It checkpoints the previous database, replaces it, and discards obsolete WAL/SHM sidecars. All restored sessions and credential-upgrade tokens are cleared so previously revoked access cannot return. Everyone signs in again. The server applies any newer supported forward migrations at startup; a database from a newer application version is rejected by an older CLI.

If restore fails, leave the service stopped and read the error. Invalid input is rejected before target changes. Existing corrupt targets cannot receive an automatic validated safety backup: preserve the stopped database and all sidecars separately, then restore to a new database path with `--database` and configure the service to use it. Never delete the original to bypass this protection.

To undo a successful restore, repeat the stop/run/start procedure with the printed safety backup as `--input`. Verify profiles, a known course, and recent progress after restarting. Course files must also be available at their configured content path; a database backup does not recreate media.

## Recover a forgotten password or a legacy administrator without credentials

The public credential bootstrap API deliberately refuses administrator accounts. Recover these through the operator CLI with access to the container/host, including when no administrator can sign in. This preserves the existing account, permissions, and progress.

Find the exact user ID:

```sh
docker compose -f docker-compose.prod.yml exec --user 1000:1000 skillgoblin node /app/scripts/operator.js users
```

Reset it using a hidden interactive prompt (replace `USER_ID`):

```sh
docker compose -f docker-compose.prod.yml exec --user 1000:1000 skillgoblin node /app/scripts/operator.js reset-password --user-id USER_ID
```

Enter and confirm a new password of 12–1024 characters. The CLI never accepts a password argument or prints the password. Reset clears the old PIN and revokes all normal sessions and credential-upgrade tokens, including any browser currently signed in. It does not activate pending users or change administrator status. An active administrator with no previous credentials can now sign in normally. Existing rate-limit cooldowns may require waiting before another login attempt.

For automation, supply one password line from a protected secret file over stdin, using `-T` to disable the terminal. Do not use an `echo password` command, shell history, or environment variable containing the secret.

```sh
docker compose -f docker-compose.prod.yml exec -T --user 1000:1000 skillgoblin node /app/scripts/operator.js reset-password --user-id USER_ID --stdin < /secure/new-password.txt
```

If the service is stopped, replace `exec --user 1000:1000` with `run --rm --no-deps`; the entrypoint still drops privileges. For a local Node installation, run `node scripts/operator.js ...` from `frontend`, provide the correct database path, and install locked dependencies with `npm ci` first. Operator commands never apply migrations themselves; use a database already initialized by a compatible SkillGoblin server.
