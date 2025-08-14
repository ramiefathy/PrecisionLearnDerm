import * as admin from 'firebase-admin';

const db = admin.firestore();

export function logInfo(op: string, details: unknown) {
  const entry = { level: 'INFO', op, details, at: Date.now() };
  console.log(JSON.stringify(entry));
  db.collection('ops').doc('runLogs').collection('entries').add(entry).catch(()=>{});
}
export function logError(op: string, details: unknown) {
  const entry = { level: 'ERROR', op, details, at: Date.now() };
  console.error(JSON.stringify(entry));
  db.collection('ops').doc('runLogs').collection('entries').add(entry).catch(()=>{});
}
