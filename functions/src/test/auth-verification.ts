/**
 * Manual verification script for authentication functions
 * Tests core functionality without test framework dependencies
 */

import { 
  requireAuth, 
  requireAdmin, 
  requireAdminContext,
  requireAdminIdentifier,
  isAdmin
} from '../util/auth';
import { createMockContext, createMockAdminContext, createMockUnauthenticatedContext } from './testUtils';

function runAuthenticationVerification() {
  console.log('🔐 Starting Authentication Verification...\n');

  let testsPassed = 0;
  let testsTotal = 0;

  function test(name: string, testFn: () => void) {
    testsTotal++;
    try {
      testFn();
      console.log(`✅ ${name}`);
      testsPassed++;
    } catch (error: any) {
      console.log(`❌ ${name}: ${error.message}`);
    }
  }

  // requireAuth tests
  test('requireAuth returns UID for valid auth', () => {
    const context = createMockContext({ auth: { uid: 'test-user-123' } });
    const result = requireAuth(context);
    if (result !== 'test-user-123') {
      throw new Error(`Expected 'test-user-123', got '${result}'`);
    }
  });

  test('requireAuth throws for missing auth', () => {
    const context = createMockUnauthenticatedContext();
    try {
      requireAuth(context);
      throw new Error('Should have thrown authentication error');
    } catch (error: any) {
      if (error.message !== 'Authentication required') {
        throw new Error(`Expected 'Authentication required', got '${error.message}'`);
      }
    }
  });

  // requireAdmin tests
  test('requireAdmin passes for admin user', () => {
    const context = createMockAdminContext();
    requireAdmin(context); // Should not throw
  });

  test('requireAdmin throws for non-admin user', () => {
    const context = createMockContext({ 
      auth: { 
        uid: 'test-user-123',
        token: { 
          admin: false,
          aud: 'test-project',
          auth_time: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600,
          firebase: { identities: {}, sign_in_provider: 'password' },
          iat: Date.now() / 1000,
          iss: 'https://securetoken.google.com/test-project',
          sub: 'test-user-123'
        } 
      } 
    });
    try {
      requireAdmin(context);
      throw new Error('Should have thrown admin error');
    } catch (error: any) {
      if (error.message !== 'Admin role required') {
        throw new Error(`Expected 'Admin role required', got '${error.message}'`);
      }
    }
  });

  test('requireAdmin throws for unauthenticated user', () => {
    const context = createMockUnauthenticatedContext();
    try {
      requireAdmin(context);
      throw new Error('Should have thrown authentication error');
    } catch (error: any) {
      if (error.message !== 'Authentication required') {
        throw new Error(`Expected 'Authentication required', got '${error.message}'`);
      }
    }
  });

  // isAdmin tests
  test('isAdmin returns true for admin user', () => {
    const context = createMockAdminContext();
    const result = isAdmin(context);
    if (result !== true) {
      throw new Error(`Expected true, got ${result}`);
    }
  });

  test('isAdmin returns false for non-admin user', () => {
    const context = createMockContext();
    const result = isAdmin(context);
    if (result !== false) {
      throw new Error(`Expected false, got ${result}`);
    }
  });

  test('isAdmin returns false for unauthenticated user', () => {
    const context = createMockUnauthenticatedContext();
    const result = isAdmin(context);
    if (result !== false) {
      throw new Error(`Expected false, got ${result}`);
    }
  });

  // requireAdminContext tests
  test('requireAdminContext returns context for admin user', () => {
    const context = createMockAdminContext();
    const result = requireAdminContext(context);
    if (!result.auth || !result.auth.uid) {
      throw new Error('Expected admin context with auth.uid');
    }
    if (result.auth.token.admin !== true) {
      throw new Error('Expected admin token to be true');
    }
  });

  test('requireAdminContext throws for non-admin user', () => {
    const context = createMockContext();
    try {
      requireAdminContext(context);
      throw new Error('Should have thrown admin error');
    } catch (error: any) {
      if (error.message !== 'Admin role required') {
        throw new Error(`Expected 'Admin role required', got '${error.message}'`);
      }
    }
  });

  // requireAdminIdentifier tests
  test('requireAdminIdentifier returns email when available', () => {
    const context = createMockAdminContext({
      auth: {
        uid: 'test-admin-123',
        token: {
          admin: true,
          email: 'admin@example.com',
          aud: 'test-project',
          auth_time: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600,
          firebase: { identities: {}, sign_in_provider: 'password' },
          iat: Date.now() / 1000,
          iss: 'https://securetoken.google.com/test-project',
          sub: 'test-admin-123'
        }
      }
    });
    const result = requireAdminIdentifier(context);
    if (result !== 'admin@example.com') {
      throw new Error(`Expected 'admin@example.com', got '${result}'`);
    }
  });

  test('requireAdminIdentifier returns UID when email not available', () => {
    const context = createMockAdminContext({
      auth: {
        uid: 'test-admin-123',
        token: {
          admin: true,
          aud: 'test-project',
          auth_time: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600,
          firebase: { identities: {}, sign_in_provider: 'anonymous' },
          iat: Date.now() / 1000,
          iss: 'https://securetoken.google.com/test-project',
          sub: 'test-admin-123'
        }
      }
    });
    const result = requireAdminIdentifier(context);
    if (result !== 'test-admin-123') {
      throw new Error(`Expected 'test-admin-123', got '${result}'`);
    }
  });

  // Summary
  console.log(`\n🔐 Authentication Verification Complete`);
  console.log(`✅ ${testsPassed}/${testsTotal} tests passed`);
  
  if (testsPassed === testsTotal) {
    console.log(`\n✨ All authentication functions are working correctly!`);
    return true;
  } else {
    console.log(`\n❌ Some authentication functions have issues.`);
    return false;
  }
}

// Export for testing
export { runAuthenticationVerification };

// Run if this file is executed directly
if (require.main === module) {
  runAuthenticationVerification();
}