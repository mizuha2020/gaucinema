import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, doc } from 'firebase/firestore';
import { getDatabase, Database } from 'firebase/database';
import firebaseConfig from '../../firebase-applet-config.json';

let app: FirebaseApp | undefined;
let dbInstance: Firestore | undefined;
let authInstance: Auth | undefined;
let rtdbInstance: Database | undefined;

try {
  app = initializeApp(firebaseConfig);
  dbInstance = getFirestore(app, (firebaseConfig as Record<string, string>).firestoreDatabaseId || '(default)');
  authInstance = getAuth(app);
  rtdbInstance = getDatabase(app);
} catch (e) {
  void 0;
  try {
    app = initializeApp(firebaseConfig);
    dbInstance = getFirestore(app);
    authInstance = getAuth(app);
    rtdbInstance = getDatabase(app);
  } catch (e2) {
    void 0;
  }
}

export const db = dbInstance!;
export const auth = authInstance!;
export const rtdb = rtdbInstance!;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const QUOTA_EXHAUSTED_KEY = 'qtb_firestore_quota_exhausted_time';
let quotaExhausted = false;

export function isFirestoreQuotaExhausted(): boolean {
  if (quotaExhausted) return true;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = sessionStorage.getItem(QUOTA_EXHAUSTED_KEY);
      if (saved) {
        const time = parseInt(saved, 10);
        if (Date.now() - time < 2 * 60 * 60 * 1000) {
          quotaExhausted = true;
          return true;
        }
        // Window expired, reset flag and clear storage
        quotaExhausted = false;
        sessionStorage.removeItem(QUOTA_EXHAUSTED_KEY);
      }
    }
  } catch {}
  return false;
}

export function markFirestoreQuotaExhausted(): void {
  if (!quotaExhausted) {
    quotaExhausted = true;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem(QUOTA_EXHAUSTED_KEY, String(Date.now()));
      }
    } catch {}
    void 0;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errCode = (error as { code?: string })?.code;

  if (errCode === 'resource-exhausted' || errMessage.includes('Quota limit exceeded') || errMessage.includes('resource-exhausted')) {
    markFirestoreQuotaExhausted();
    void 0;
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  void 0;
}

// Sanitize objects by stripping undefined fields to prevent Firestore unsupported field value errors
// IMPORTANT: Preserve Firestore FieldValue sentinels (increment, serverTimestamp, etc.)
export function sanitizeData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const raw = data as Record<string, any>;
    if (raw._methodName && (raw._methodName.includes('increment') || raw._methodName.includes('FieldValue') || raw._methodName.includes('delete') || raw._methodName.includes('serverTimestamp'))) {
      return data;
    }
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value !== undefined) {
        sanitized[key] = sanitizeData(value);
      }
    }
    return sanitized as T;
  }
  return data;
}
