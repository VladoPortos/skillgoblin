# Security Policy

SkillGoblin is a self-hosted homelab learning platform maintained as an open-source side project. There is no commercial entity behind it, no security team, and no SLA. That said, security issues are taken seriously — please follow the guidance below.

## Supported versions

Only the `main` branch (latest commit) is supported. There are no LTS releases, and patches are not back-ported. If you're running an older snapshot, the upgrade path is to pull the latest image and restart the container.

## Reporting a vulnerability

**For low-impact, non-exploitable issues** (CVE-style dep advisories that Dependabot already flags, hardening recommendations, configuration suggestions): open a regular [GitHub issue](https://github.com/VladoPortos/skillgoblin/issues/new) and tag it `security`. Public discussion is fine — these are usually obvious from the codebase anyway.

**For exploitable issues** (auth bypass, RCE, privilege escalation, data exfiltration, anything where a working PoC exists or is straightforward to construct): use [GitHub's private vulnerability reporting](https://github.com/VladoPortos/skillgoblin/security/advisories/new). This routes the report directly to the maintainer without exposing it publicly until a fix lands. Please include:

- A clear description of the issue
- Steps to reproduce, or a minimal PoC
- Affected versions / commits if known
- Your suggested severity (CVSS or just gut feeling — both are fine)

Acknowledgement is best-effort within a few days. Fix turnaround depends on severity and complexity.

## Threat model — what's in and out of scope

SkillGoblin is designed for **trusted local networks** (a homelab, a small classroom, a family server). The defaults assume the operator controls the network and reverse proxy. The auth model protects against:

- Account takeover within the deployed instance (auth bypass, session forgery, credential leakage, role escalation)
- Server-side data exposure to unauthenticated clients
- Persistent XSS in user-controllable content
- Path traversal and other input-validation bugs

Out of scope (or addressed by deployment, not the app):

- TLS termination — runs as a plain HTTP service. Operators put it behind nginx / Caddy / Traefik for HTTPS.
- DDoS / volumetric attacks — the app has basic rate limiting on auth, but bulk traffic is the reverse proxy's job.
- Reports based on running the container with default test credentials (`ADMIN_NAME` / `ADMIN_PASSWORD` env-var bootstrap is documented as required first-run setup — leaving these as defaults is operator error, not a vulnerability).
- Reports based on exposing the service to the public internet without a reverse proxy / authentication layer in front of it. The threat model assumes a trusted LAN.

### Legacy credential-less accounts

Upgraded installations can contain active **non-admin** accounts created by
older releases without a password or PIN. Their first visitor may set a
credential and claim the account because no prior secret exists to verify
ownership. This recovery flow is retained for trusted-LAN deployments and is
hardened as follows:

- **Admin accounts are never claimable this way.** A credential-less admin
  (possible after upgrading from a pre-auth-hardening release) is refused by
  the self-claim endpoint; only another administrator can set its credentials
  from the Admin Panel. This closes the unauthenticated admin-takeover path.
- **Claiming is atomic.** A compare-and-swap ensures only one racing request
  can ever claim a given account; the loser gets a 409 and no session.

If the wrong person claims a *non-admin* account, an administrator can reset
its password or PIN from the Admin Panel. Do not rely on this flow on an
untrusted network.

## Deployment hardening

The defaults suit a plain-HTTP trusted LAN. When exposing the service through
a reverse proxy (or to a less-trusted network), set these so the app's
defenses line up with your topology:

| Env var | Default | When to set |
|---------|---------|-------------|
| `TRUST_PROXY_HOPS` | `0` (ignore `X-Forwarded-For`) | Set to the number of **trusted** reverse proxies in front of the app so login rate-limiting keys on the real client IP instead of a spoofable header. With `0`, a client-supplied `X-Forwarded-For` is ignored and the transport peer is used — safe, but every request behind a proxy shares one IP bucket. |
| `COOKIE_SECURE` | auto-detect | Set to `true` when TLS is terminated by a proxy that does **not** forward `X-Forwarded-Proto=https` (otherwise the session cookie may be issued without the `Secure` flag). `false` forces it off for an intentional plain-HTTP LAN. |

The app also caps request bodies (256 KiB for JSON APIs) to blunt memory-
exhaustion attempts. As defense in depth, configure a body-size limit at your
reverse proxy too (e.g. nginx `client_max_body_size`).

## Hall of fame

When fixes ship, the commit message will credit the reporter (with permission) by name or handle. There is no bug bounty program.
