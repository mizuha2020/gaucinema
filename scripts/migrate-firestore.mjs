import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const newConfig = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-applet-config.json'), 'utf8')
);

const oldConfig = {
  apiKey: 'AIzaSyD9xPIxrY5rmQo9o8F1BQGUYAcoQg8NYh0',
  authDomain: 'calm-gravity-31ttq.firebaseapp.com',
  projectId: 'calm-gravity-31ttq',
  appId: '1:533113334886:web:053029e6ae36b02d57d1a7',
  firestoreDatabaseId: 'ai-studio-qtbrpphimcnhn-e228ee20-957f-4edc-8547-1a92e9df2d7f',
};

const oldApp = initializeApp(oldConfig, 'old-project');
const newApp = initializeApp(newConfig, 'new-project');
const oldDb = getFirestore(oldApp, oldConfig.firestoreDatabaseId);
const newDb = getFirestore(newApp, '(default)');

const PROFILE_SUBCOLLECTIONS = [
  'history',
  'myList',
  'savedManga',
  'mangaHistory',
  'youtubeFavorites',
  'youtubeHistory',
  'youtubeSubscriptions',
];

const ROOT_COLLECTIONS = [
  'customAvatars',
  'notifications',
  'userStats',
  'userActivityHistory',
  'system_apis',
];

const GLOBAL_DOCS = ['tv_config'];

const BATCH_SIZE = 400;
const summary = [];

async function copyDocs(oldColRef, newColRef, label) {
  const snap = await getDocs(oldColRef);
  if (snap.empty) {
    summary.push(`${label}: 0 docs (bỏ qua)`);
    return [];
  }

  let batch = writeBatch(newDb);
  let ops = 0;
  let count = 0;

  for (const d of snap.docs) {
    batch.set(doc(newColRef, d.id), d.data());
    ops++;
    count++;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(newDb);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  summary.push(`${label}: ${count} docs`);
  return snap.docs;
}

async function migrateAccounts() {
  const accDocs = await copyDocs(
    collection(oldDb, 'accounts'),
    collection(newDb, 'accounts'),
    'accounts'
  );

  for (const acc of accDocs) {
    const profDocs = await copyDocs(
      collection(oldDb, 'accounts', acc.id, 'profiles'),
      collection(newDb, 'accounts', acc.id, 'profiles'),
      `accounts/${acc.id}/profiles`
    );

    for (const prof of profDocs) {
      for (const sub of PROFILE_SUBCOLLECTIONS) {
        await copyDocs(
          collection(oldDb, 'accounts', acc.id, 'profiles', prof.id, sub),
          collection(newDb, 'accounts', acc.id, 'profiles', prof.id, sub),
          `accounts/${acc.id}/profiles/${prof.id}/${sub}`
        );
      }
    }
  }
}

async function migrateGlobalDocs() {
  for (const docName of GLOBAL_DOCS) {
    const snap = await getDoc(doc(oldDb, 'global', docName));
    if (snap.exists()) {
      await setDoc(doc(newDb, 'global', docName), snap.data());
      summary.push(`global/${docName}: 1 doc`);
    } else {
      summary.push(`global/${docName}: không tồn tại (bỏ qua)`);
    }
  }
}

async function main() {
  console.log('=== QTB-MOVIE FIRESTORE MIGRATION ===');
  console.log(`From: ${oldConfig.projectId} (${oldConfig.firestoreDatabaseId})`);
  console.log(`To:   ${newConfig.projectId} (default)\n`);

  try {
    await migrateAccounts();
    for (const name of ROOT_COLLECTIONS) {
      await copyDocs(collection(oldDb, name), collection(newDb, name), name);
    }
    await migrateGlobalDocs();
  } catch (e) {
    console.error('\nMIGRATION FAILED:', e.code || '', e.message);
    console.error('Đã migrate phần nào sẽ hiển thị bên dưới. Fix lỗi rồi chạy lại (an toàn, ghi đè không trùng).');
  }

  console.log('\n=== KẾT QUẢ ===');
  summary.forEach((s) => console.log(' -', s));
  console.log('\nDone.');
  process.exit(0);
}

main();
