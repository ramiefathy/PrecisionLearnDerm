import * as functions from 'firebase-functions';

// Simple diagnostic callable to validate CORS/callable plumbing
export const diag_cors = functions.https.onCall(async (_data, _context) => {
  return {
    ok: true,
    ts: new Date().toISOString()
  };
});


