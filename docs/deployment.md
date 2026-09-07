# Deployment and release

Use Node 24 (at least 24.11) for development and CI. The locked Nuxt version supports Node ^22.19, ^24.11, or >=26; Node 20 is unsupported. Install with `npm ci` in `frontend`. The production image pins the Node 24 Alpine base manifest and includes a native compiler toolchain only in its build stage. Each architecture builds on a native runner, including SQLite, Argon2, and image processing dependencies.

## Isolated tests

From the repository root:

```sh
docker compose -f docker-compose.test.yml run --build --rm tests
docker compose -f docker-compose.test.yml logs web
docker compose -f docker-compose.test.yml down -v
```

The test runner installs the lockfile with `npm ci`, runs unit tests, then runs all Chromium functional tests against a production build. Fixtures are mounted read-only into an initialization service and copied into disposable named volumes. Tests can edit branding/course files without modifying tracked fixtures or operator data. Always run `down -v` before another run to reset the test database and fixture copies. These commands only affect the test compose services/volumes; use a distinct compose project name when running concurrent suites.

## Publishing

Pull requests and main commits run production builds, unit tests, and functional browser tests on native AMD64 and ARM64 runners. Publishing waits for both suites. Successful main builds publish `sha-<full-commit>-amd64`, `sha-<full-commit>-arm64`, and the multiarchitecture `sha-<full-commit>` manifest; `beta` is a convenience alias. The publish summary records the exact manifest digest.

The workflow refuses existing commit tags and fails closed when the registry lookup fails. Configure Docker Hub immutable tags for `sha-*` (leave `beta` and `latest` mutable) to enforce write-once tags against other registry clients too. A rerun for an already published commit will fail against immutable tags; create a new commit for a new image. Digest references remain content-addressed regardless of tag settings. Keep both native GitHub runner types enabled. A missing runner or failed test blocks publishing.

## Promotion

Pull and test the exact digest from the successful publish summary in a staging instance with separate data volumes:

```sh
docker pull vladoportos/skillgoblin@sha256:<64-hex-digest>
```

Use that digest as the staging compose `image`, then verify login, course playback, progress persistence, and operator recovery against disposable staging data. Do not use `beta` to identify what you tested: its target may have changed.

Run **Promote verified digest to latest** from the main branch. Supply the full commit SHA, exact tested manifest digest, and check the verification confirmation. The workflow requires a successful publish run for that main commit, checks the commit tag resolves to the supplied registry digest, independently resolves the digest, and promotes it without rebuilding. It verifies `latest` resolves to the same digest after promotion. Manual staging verification is an operator attestation; CI does not infer it from a mutable tag.

Production deployments can pin `vladoportos/skillgoblin@sha256:<digest>` for repeatable upgrades and rollback. Back up application data before upgrades; rolling back an image does not roll back database migrations. See [operator recovery](operations.md) for backup/restore commands and storage permissions.
