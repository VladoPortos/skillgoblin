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

## Hall of fame

When fixes ship, the commit message will credit the reporter (with permission) by name or handle. There is no bug bounty program.
