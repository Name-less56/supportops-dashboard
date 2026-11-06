# Contributing

## Workflow

1. Create a branch from `develop` using `feature/<short-name>` or `fix/<short-name>`.
2. Install dependencies with `npm ci`.
3. Keep changes focused and use Conventional Commit messages.
4. Run `npm test` and `npm audit --omit=dev`.
5. Open a pull request into `develop` and describe behavior, verification and privacy impact.

Release pull requests merge `develop` into `main`. Never commit `.env`, cookies, database dumps, real tickets or customer information.

## Commit examples

```text
feat(tickets): add SLA pause controls
fix(auth): invalidate expired sessions
docs: explain local PostgreSQL setup
test(rbac): verify agent group scope
```

## Design expectations

Preserve keyboard access, visible focus, responsive layouts, reduced-motion support and the white/blue/grey neumorphic system. New browser storage or external SDKs require a privacy review and policy update.

