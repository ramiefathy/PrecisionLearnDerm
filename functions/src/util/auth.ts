import * as admin from 'firebase-admin';

let app: admin.app.App | undefined;
export function getAdminApp() {
  if (!app) {
    app = admin.apps.length ? admin.app() : admin.initializeApp();
  }
  return app;
}

export function requireAuth(context: any) {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new Error('UNAUTHENTICATED');
  }
  return uid;
}

export function requireAdmin(context: any) {
  const token = context.auth?.token as any;
  if (!token || token.role !== 'admin') {
    throw new Error('PERMISSION_DENIED');
  }
}
