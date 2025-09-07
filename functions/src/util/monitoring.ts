/* Excerpt: only the getLogs export replaced. The rest of the file remains unchanged above this block. */

export const getLogs = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }

  const { level, operation, userId, startTime, endTime, limit = 100 } = data || {};

  const applyCommonFilters = (q: FirebaseFirestore.Query) => {
    let query: FirebaseFirestore.Query = q;
    if (level) query = query.where('level', '==', level);
    if (operation) query = query.where('operation', '==', operation);
    if (userId) query = query.where('userId', '==', userId);
    return query;
  };

  // Prefer createdAt; fallback to timestamp if no results
  let primary = applyCommonFilters(db.collection('logs'));
  if (startTime) {
    primary = primary.where('createdAt', '>=', typeof startTime === 'string' ? startTime : startTime);
  }
  if (endTime) {
    primary = primary.where('createdAt', '<=', typeof endTime === 'string' ? endTime : endTime);
  }
  primary = primary.orderBy('createdAt', 'desc').limit(limit);

  let snapshot = await primary.get();
  let usedField: 'createdAt' | 'timestamp' = 'createdAt';

  if (snapshot.empty) {
    // Fallback to timestamp field for legacy docs
    let fallback = applyCommonFilters(db.collection('logs'));
    if (startTime) {
      fallback = fallback.where('timestamp', '>=', typeof startTime === 'string' ? startTime : startTime);
    }
    if (endTime) {
      fallback = fallback.where('timestamp', '<=', typeof endTime === 'string' ? endTime : endTime);
    }
    fallback = fallback.orderBy('timestamp', 'desc').limit(limit);
    const fbSnap = await fallback.get();
    if (!fbSnap.empty) {
      snapshot = fbSnap;
      usedField = 'timestamp';
    }
  }

  const logs = snapshot.docs.map(doc => {
    const data = doc.data() as any;
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt || data.timestamp || null,
      legacyTimestamp: data.timestamp || null,
      orderingFieldUsed: usedField
    };
  });

  return { logs, count: logs.length };
});
