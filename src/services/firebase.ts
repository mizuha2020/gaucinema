import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import firebaseConfig from '../../firebase-applet-config.json';

let app: any;
let dbInstance: any;
let authInstance: any;
let rtdbInstance: any;

try {
  app = initializeApp(firebaseConfig);
  dbInstance = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');
  authInstance = getAuth(app);
  rtdbInstance = getDatabase(app);
} catch (e) {
  console.error('Firebase initialization error, falling back:', e);
  try {
    app = initializeApp(firebaseConfig);
    dbInstance = getFirestore(app);
    authInstance = getAuth(app);
    rtdbInstance = getDatabase(app);
  } catch (e2) {
    console.error('Firebase fallback initialization failed:', e2);
  }
}

export const db = dbInstance;
export const auth = authInstance;
export const rtdb = rtdbInstance;

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
    console.warn('Firestore write quota limit reached (resource-exhausted). Switching to local persistence fallback.');
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code;

  if (errCode === 'resource-exhausted' || errMessage.includes('Quota limit exceeded') || errMessage.includes('resource-exhausted')) {
    markFirestoreQuotaExhausted();
    console.warn(`Firestore Quota Exceeded on ${operationType} ${path || ''}. Operation skipped.`);
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
  console.warn('Firestore Warning: ', JSON.stringify(errInfo));
}

// Sanitize objects by stripping undefined fields to prevent Firestore unsupported field value errors
export function sanitizeData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        sanitized[key] = sanitizeData(value);
      }
    }
    return sanitized as T;
  }
  return data;
}

// Connection test (optional debug helper, not run automatically on module load)
export async function testConnection() {
  if (isFirestoreQuotaExhausted()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
