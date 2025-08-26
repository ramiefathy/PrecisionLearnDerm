import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import { IntegrationTestContext, setupEmulators } from './integrationTestUtils';

describe('Authentication and User Management', () => {
  let testContext: IntegrationTestContext;

  before(async () => {
    testContext = new IntegrationTestContext();
    setupEmulators();
    await testContext.cleanup();
  });

  after(async () => {
    await testContext.cleanup();
  });

  describe('User Registration and Profile Creation', () => {
    it('should create a new user and a corresponding user profile', async () => {
      const uid = 'test-user1';
      const email = 'user1@test.com';

      // Create user
      const user = await testContext.createUser(uid, email);
      expect(user).to.exist;
      expect(user.uid).to.equal(uid);
      expect(user.email).to.equal(email);

      // Check for user profile in Firestore
      const profileDoc = await testContext.getFirestore().collection('users').doc(uid).get();
      expect(profileDoc.exists, 'User profile should be created in Firestore').to.be.true;
      
      const profile = profileDoc.data();
      expect(profile).to.exist;
      expect(profile?.email).to.equal(email);
      expect(profile?.stats.quizzesTaken).to.equal(0);
    });
  });

  describe('Admin Role Management', () => {
    it('an admin should be able to grant another user admin role', async () => {
      const adminUid = 'test-admin2';
      const adminEmail = 'admin2@test.com';
      const userUid = 'test-user2';
      const userEmail = 'user2@test.com';

      // Create admin and regular user
      await testContext.createAdminUser(adminUid, adminEmail);
      await testContext.createUser(userUid, userEmail);

      // Create admin context
      const adminContext = testContext.createCallableContext(adminUid, { admin: true });

      // Call grantAdminRole function
      const result = await testContext.callFunction('admin_grant_role', { email: userEmail }, adminContext);
      testContext.expectSuccess(result);
      expect(result.message).to.equal(`Successfully granted admin role to ${userEmail}`);

      // Verify custom claims
      const user = await testContext.getAuth().getUser(userUid);
      expect(user.customClaims?.admin).to.be.true;
    });

    it('a non-admin should not be able to grant admin role', async () => {
      const userUid1 = 'test-user3';
      const userEmail1 = 'user3@test.com';
      const userUid2 = 'test-user4';
      const userEmail2 = 'user4@test.com';

      // Create two regular users
      await testContext.createUser(userUid1, userEmail1);
      await testContext.createUser(userUid2, userEmail2);

      // Create non-admin context
      const userContext = testContext.createCallableContext(userUid1);

      // Call grantAdminRole function (should fail)
      try {
        await testContext.callFunction('admin_grant_role', { email: userEmail2 }, userContext);
        expect.fail('Function should have thrown an error');
      } catch (error: any) {
        expect(error.code).to.equal('permission-denied');
        expect(error.message).to.include('Admin role required to grant roles');
      }
    });

    it('an admin should be able to revoke admin role from another user', async () => {
      const adminUid = 'test-admin3';
      const adminEmail = 'admin3@test.com';
      const userUid = 'test-user5';
      const userEmail = 'user5@test.com';

      // Create two admin users
      await testContext.createAdminUser(adminUid, adminEmail);
      await testContext.createAdminUser(userUid, userEmail);

      // Create admin context
      const adminContext = testContext.createCallableContext(adminUid, { admin: true });

      // Call revokeAdminRole function
      const result = await testContext.callFunction('admin_revoke_role', { email: userEmail }, adminContext);
      testContext.expectSuccess(result);
      expect(result.message).to.equal(`Successfully revoked admin role from ${userEmail}`);

      // Verify custom claims
      const user = await testContext.getAuth().getUser(userUid);
      expect(user.customClaims?.admin).to.be.false;
    });
  });

  describe('Function Authentication and Authorization', () => {
    before(async () => {
      // Seed data for tests
      await testContext.seedTestData();
    });

    it('should allow an authenticated user to call a protected function', async () => {
      const userUid = 'auth-user1';
      await testContext.createUser(userUid, 'auth-user1@test.com');
      const userContext = testContext.createCallableContext(userUid);

      // Call a protected function
      const result = await testContext.callFunction('pe_get_next_items', { count: 1 }, userContext);
      testContext.expectSuccess(result);
      expect(result.items).to.be.an('array');
    });

    it('should deny access to a protected function for an unauthenticated user', async () => {
      try {
        await testContext.callFunction('pe_get_next_items', { count: 1 });
        expect.fail('Function should have thrown an unauthenticated error');
      } catch (error: any) {
        expect(error.code).to.equal('unauthenticated');
      }
    });

    it('should deny access to an admin function for a non-admin user', async () => {
      const userUid = 'auth-user2';
      await testContext.createUser(userUid, 'auth-user2@test.com');
      const userContext = testContext.createCallableContext(userUid);

      try {
        await testContext.callFunction('admin_list_admins', {}, userContext);
        expect.fail('Function should have thrown a permission-denied error');
      } catch (error: any) {
        expect(error.code).to.equal('permission-denied');
      }
    });

    it('should allow access to an admin function for an admin user', async () => {
      const adminUid = 'auth-admin1';
      await testContext.createAdminUser(adminUid, 'auth-admin1@test.com');
      const adminContext = testContext.createCallableContext(adminUid, { admin: true });

      const result = await testContext.callFunction('admin_list_admins', {}, adminContext);
      testContext.expectSuccess(result);
      expect(result.admins).to.be.an('array');
    });
  });
});
