# Basket Booster Discounts — v1.7.1 RC1

**Status:** Release candidate, not verified against live Shopify installation. **Do not deploy to production before testing on a development store / staging instance.**

## Source basis
Prepared from user-uploaded `BasketBooster Production v1.7.zip`, not from current EC2 disk. Existing Function implementation, GraphQL discount mutations, `shopify.server.ts`, package dependency versions, and Prisma schema are unchanged.

## Changes
- `app/routes/app.tsx`: use Shopify React Router v1 layout with `authenticate.admin` parent loader, a server-provided Client ID, `<AppProvider embedded apiKey={apiKey}>`, `boundary.error` and `boundary.headers`.
- `app/routes/app._index.tsx`: use a React Router `<Link>` to `/app/discounts` instead of handcrafted query parameters; correct the displayed 2L tin BE example to 4 (documentation only; no discount Function change).
- `scripts/Server_Git_AppOnly_Staged_Deploy.sh`: Git-clone staged app-only build; export Vite key; verify lockfile compatibility; back up and switch compiled build only; automatic rollback on failed start or HTTP health check. **This does not deploy Shopify Functions or run migrations.**
- `scripts/Server_Git_AppOnly_Rollback.sh`: manual compiled-build rollback if Shopify authenticated UI testing fails.

## Important deployment constraints
- The staged Git script builds **the remote `origin/main` branch**, not the uploaded ZIP. Commit/push the reviewed changes before executing it.
- Existing `/var/www/basketbooster` must be a Git checkout; its `package-lock.json` must exactly match the staged checkout. No change to production node_modules is performed.
- Since this swaps only the compiled `build/`, the server's source checkout will not match its running build until the next full source synchronization. Record the Git revision.
- Keep `DATABASE_URL`, production SQLite (`prisma/prod.sqlite`) and service environment unchanged; the staged script does not modify these.
- Verify both the home page AND `/app/discounts` in a development store. A `401` response may indicate revoked/missing installation session or token-exchange issues and is **not proven fixed** by this candidate.
- Do not run the previous `Server_Git_Code_Deploy.sh` as a shortcut; it resets Git, removes files and stops the live service before building.

## Local tests
```bash
npm ci
npx prisma generate
npx react-router typegen
# typecheck app only: the original Function generated GraphQL types are inconsistent
cat > tsconfig.app-check.json <<'EOF'
{"extends":"./tsconfig.json","exclude":["extensions/**","node_modules/**","build/**"]}
EOF
npx tsc --noEmit --project tsconfig.app-check.json
rm tsconfig.app-check.json
# Supply VITE_SHOPIFY_API_KEY equal to your Shopify app Client ID at build time
npm run build
```

## Validation / smoke test
1. In a non-production Shopify development store, verify embedded app loads without `401`.
2. Open Discount Manager twice; verify no `/auth/session-token.data` route `ErrorResponse 200` and no missing client assets.
3. List pre-existing discounts; don't create/delete a discount in production until verified.
4. Verify no errors in service journal, test checkout Function independently.
5. If any regression: run manual rollback script using backup path printed by the staged deploy.

## Security
The archive received included environment and local certificate/database artifacts. This release package excludes `.env`, `.shopify` credentials, private keys, SQLite files, and compiled artifacts. Review credentials in the original archive and rotate any that were shared outside trusted storage.
