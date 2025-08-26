import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupTestEnvironment, testHelper, admin } from './test_setup';
import { 
  requireAuth, 
  requireAdmin, 
  requireAdminContext,
  requireAdminIdentifier,
  isAdmin, 
  getAdminApp,
  setAdminClaim,
  removeAdminClaim
} from '../util/auth';
import { createMockContext, createMockAdminContext, createMockUnauthenticatedContext } from './testUtils';

setupTestEnvironment();

describe('Authentication Utility Tests', () => {
  describe('requireAuth', () => {
    it('should return uid when auth is valid', () => {
      const context = createMockContext({ 
        auth: { uid: 'test-user-123' } 
      });

      const result = requireAuth(context);
      expect(result).to.equal('test-user-123');
    });

    it('should throw UNAUTHENTICATED when auth is missing', () => {
      const context = createMockUnauthenticatedContext();

      expect(() => requireAuth(context)).to.throw('Authentication required');
    });

    it('should throw UNAUTHENTICATED when uid is missing', () => {
      const context = createMockContext({ 
        auth: {} 
      });

      expect(() => requireAuth(context)).to.throw('Authentication required');
    });
  });

  describe('requireAdmin', () => {
    it('should pass when user has admin role', () => {
      const context = createMockAdminContext();

      expect(() => requireAdmin(context)).to.not.throw();
    });

    it('should throw error when user does not have admin role', () => {
      const context = createMockContext({ 
        auth: { 
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

      expect(() => requireAdmin(context)).to.throw('Admin role required');
    });

    it('should throw error when token is missing', () => {
      const context = createMockContext({ 
        auth: {} 
      });

      expect(() => requireAdmin(context)).to.throw('Admin role required');
    });

    it('should throw error when auth is missing', () => {
      const context = createMockUnauthenticatedContext();

      expect(() => requireAdmin(context)).to.throw('Authentication required');
    });
  });

  describe('isAdmin', () => {
    it('should return true for admin user', () => {
      const context = createMockAdminContext();

      const result = isAdmin(context);
      expect(result).to.be.true;
    });

    it('should return false for non-admin user', () => {
      const context = createMockContext();

      const result = isAdmin(context);
      expect(result).to.be.false;
    });

    it('should return false when auth is missing', () => {
      const context = createMockUnauthenticatedContext();

      const result = isAdmin(context);
      expect(result).to.be.false;
    });
  });

  describe('Admin Management Functions', () => {
    let userStub: sinon.SinonStub;
    let authStub: sinon.SinonStub;

    beforeEach(() => {
      userStub = sinon.stub(admin.auth(), 'getUser');
      authStub = sinon.stub(admin.auth(), 'setCustomUserClaims');
    });

    afterEach(() => {
      userStub.restore();
      authStub.restore();
    });

    describe('setAdminClaim', () => {
      it('should set admin claim for user', async () => {
        const mockUser = {
          uid: 'test-user',
          email: 'test@example.com',
          customClaims: {}
        };

        userStub.resolves(mockUser);
        authStub.resolves();

        await setAdminClaim('test-user');

        expect(authStub.calledOnce).to.be.true;
        expect(authStub.firstCall.args[0]).to.equal('test-user');
        expect(authStub.firstCall.args[1]).to.deep.include({ admin: true });
      });

      it('should handle user not found error', async () => {
        userStub.rejects(new Error('User not found'));

        try {
          await setAdminClaim('nonexistent-user');
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).to.include('User not found');
        }
      });
    });

    describe('removeAdminClaim', () => {
      it('should remove admin claim from user', async () => {
        const mockUser = {
          uid: 'test-user',
          email: 'test@example.com',
          customClaims: { admin: true }
        };

        userStub.resolves(mockUser);
        authStub.resolves();

        await removeAdminClaim('test-user');

        expect(authStub.calledOnce).to.be.true;
        expect(authStub.firstCall.args[0]).to.equal('test-user');
        const updatedClaims = authStub.firstCall.args[1];
        expect(updatedClaims).to.not.have.property('admin');
      });
    });
  });

  describe('Enhanced Type-Safe Functions', () => {
    describe('requireAdminContext', () => {
      it('should return AdminContext when user has admin role', () => {
        const context = createMockAdminContext();

        const result = requireAdminContext(context);
        expect(result.auth.uid).to.exist;
        expect(result.auth.token.admin).to.be.true;
      });

      it('should throw error when user does not have admin role', () => {
        const context = createMockContext();

        expect(() => requireAdminContext(context)).to.throw('Admin role required');
      });

      it('should throw error when auth is missing', () => {
        const context = createMockUnauthenticatedContext();

        expect(() => requireAdminContext(context)).to.throw('Authentication required');
      });
    });

    describe('requireAdminIdentifier', () => {
      it('should return email when available', () => {
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
        expect(result).to.equal('admin@example.com');
      });

      it('should return UID when email is not available', () => {
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
        expect(result).to.equal('test-admin-123');
      });

      it('should throw error when user is not admin', () => {
        const context = createMockContext();

        expect(() => requireAdminIdentifier(context)).to.throw('Admin role required');
      });
    });

    describe('requireAdmin integration tests', () => {
      it('should allow access for admin email', () => {
        const context = createMockAdminContext({
          auth: {
            token: {
              admin: true,
              email: 'ramiefathy@gmail.com',
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

        expect(() => requireAdmin(context)).to.not.throw();
      });

      it('should deny access for non-admin email', () => {
        const context = createMockContext({
          auth: {
            token: {
              admin: false,
              email: 'user@example.com',
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

        expect(() => requireAdmin(context)).to.throw('Admin role required');
      });
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle malformed contexts gracefully', () => {
      const malformedContexts = [
        createMockUnauthenticatedContext(),
        createMockContext({ auth: { uid: '' } }),
        createMockContext({ auth: { token: {} } })
      ];

      malformedContexts.forEach((context, index) => {
        expect(() => requireAuth(context), `Failed on context ${index}`).to.throw();
        expect(() => requireAdmin(context), `Failed on context ${index}`).to.throw();
        expect(isAdmin(context), `Failed on context ${index}`).to.be.false;
      });
    });

    it('should reject invalid admin values', () => {
      const invalidAdminContexts = [
        createMockContext({
          auth: {
            token: {
              admin: 1 as any, // Invalid type
              aud: 'test-project',
              auth_time: Date.now() / 1000,
              exp: Date.now() / 1000 + 3600,
              firebase: { identities: {}, sign_in_provider: 'password' },
              iat: Date.now() / 1000,
              iss: 'https://securetoken.google.com/test-project',
              sub: 'test-user-123'
            }
          }
        }),
        createMockContext({
          auth: {
            token: {
              admin: 'true' as any, // Invalid type
              aud: 'test-project',
              auth_time: Date.now() / 1000,
              exp: Date.now() / 1000 + 3600,
              firebase: { identities: {}, sign_in_provider: 'password' },
              iat: Date.now() / 1000,
              iss: 'https://securetoken.google.com/test-project',
              sub: 'test-user-123'
            }
          }
        })
      ];

      invalidAdminContexts.forEach((context, index) => {
        expect(() => requireAdmin(context), `Failed on invalid context ${index}`).to.throw();
        expect(isAdmin(context), `Failed on invalid context ${index}`).to.be.false;
      });
    });

    it('should handle extra properties in context without breaking', () => {
      const extraContext = createMockContext({
        auth: {
          uid: 'test-user',
          token: {
            admin: true,
            email: 'test@example.com',
            extraProperty: 'should not break',
            aud: 'test-project',
            auth_time: Date.now() / 1000,
            exp: Date.now() / 1000 + 3600,
            firebase: { identities: {}, sign_in_provider: 'password' },
            iat: Date.now() / 1000,
            iss: 'https://securetoken.google.com/test-project',
            sub: 'test-user-123'
          }
        },
        extraContext: 'extra property'
      });

      expect(requireAuth(extraContext)).to.equal('test-user');
      expect(() => requireAdmin(extraContext)).to.not.throw();
      expect(isAdmin(extraContext)).to.be.true;
    });
  });
});