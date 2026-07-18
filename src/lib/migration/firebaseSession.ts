import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFirebaseRuntimeConfig } from '@/lib/firebase';
import { loadAuthoritativeCloudBackupData } from '@/lib/backup/firestoreSource';
import type { BackupData } from '@/lib/backup/types';
import {
  createFirestoreMigrationWriter,
  createLocalToCloudMigrationPlan,
  executeLocalToCloudMigration,
  type LocalToCloudMigrationPlan,
  type MigrationConfirmation,
  type MigrationReport,
} from './localToCloud';

const MIGRATION_APP_NAME = 'legwan-local-cloud-migration';

export interface MigrationTargetSession {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  targetBoutiqueId: string;
  email: string;
}

export async function openMigrationTargetSession(email: string, password: string): Promise<MigrationTargetSession> {
  const config = getFirebaseRuntimeConfig();
  if (!config) throw new Error('migration_firebase_config_unavailable');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('migration_requires_online');
  const existing = getApps().find(app => app.name === MIGRATION_APP_NAME);
  const app = existing ?? initializeApp(config, MIGRATION_APP_NAME);
  const auth = getAuth(app);
  if (auth.currentUser) await signOut(auth);
  const normalizedEmail = email.trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  return {
    app,
    auth,
    db: getFirestore(app),
    targetBoutiqueId: credential.user.uid,
    email: normalizedEmail,
  };
}

export async function closeMigrationTargetSession(session: MigrationTargetSession): Promise<void> {
  await signOut(session.auth).catch(() => {});
  await deleteApp(session.app).catch(() => {});
}

export async function prepareAuthenticatedMigration(
  source: BackupData,
  sourceBoutiqueId: string,
  session: MigrationTargetSession,
): Promise<LocalToCloudMigrationPlan> {
  const target = await loadAuthoritativeCloudBackupData(session.targetBoutiqueId, session.db);
  return createLocalToCloudMigrationPlan(source, target, sourceBoutiqueId, session.targetBoutiqueId);
}

export async function executeAuthenticatedMigration(
  plan: LocalToCloudMigrationPlan,
  confirmation: MigrationConfirmation,
  session: MigrationTargetSession,
): Promise<MigrationReport> {
  if (session.targetBoutiqueId !== plan.targetBoutiqueId) throw new Error('migration_session_target_mismatch');
  return executeLocalToCloudMigration(
    plan,
    confirmation,
    createFirestoreMigrationWriter(session.targetBoutiqueId, session.db),
  );
}
