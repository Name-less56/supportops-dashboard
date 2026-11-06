# Security policy

## Supported version

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Do not disclose a vulnerability in a public issue. Contact the repository owner privately through their GitHub profile with a concise description, reproduction steps, affected version and expected impact.

This repository is a demonstration. Public demo credentials must never be reused in a real deployment. Production use requires unique secrets, TLS, managed PostgreSQL, rate limiting, MFA, verified password-recovery delivery, backups and independent security review.

## Repository hygiene

- `.env`, cookies, logs, dumps and PostgreSQL data directories are ignored.
- Only synthetic records are committed.
- Browser assets do not include third-party tracking SDKs.
- Dependencies are checked by CI with `npm audit`.

