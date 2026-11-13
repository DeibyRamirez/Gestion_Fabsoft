/**
 * Reconciliación post-upgrade develop: fabsoft_owner → migrator en schema app.
 * Ejecutar como provisioner (`DATABASE_PROVISION_URL`) antes de db:migrate en rutas históricas.
 */
import { assertNonProduction, resolveGuardedDatabaseUrl } from './guard.js';
import { parseDatabaseTarget } from './database-url.js';
import {
  assertNoFabsoftOwnerInApp,
  reconcileFabsoftOwnerAppObjectsToMigrator,
} from './reconcile-owner-to-migrator.js';

assertNonProduction();
const { url: provisionUrl } = resolveGuardedDatabaseUrl(['DATABASE_PROVISION_URL'], {
  allowUsers: ['fabsoft_owner', 'postgres', 'fabsoft_provisioner'],
});
const dbName = parseDatabaseTarget(provisionUrl).database;
const count = await reconcileFabsoftOwnerAppObjectsToMigrator(provisionUrl, dbName);
const migUrl = process.env.DATABASE_MIGRATION_URL?.trim();
if (migUrl) {
  await assertNoFabsoftOwnerInApp(migUrl, 'reconcile post-check');
}
console.log(
  JSON.stringify({ dbReconcileOwnerToMigrator: true, database: dbName, reassigned: count }),
);
