import { describe, it } from 'mocha';
import { expect } from 'chai';
import { 
  requireAuth, 
  requireAdmin, 
  requireAdminContext,
  requireAdminIdentifier,
  isAdmin
} from '../util/auth';
import { createMockContext, createMockAdminContext, createMockUnauthenticatedContext } from './testUtils';

describe('Minimal Authentication Tests', () => {
  describe('requireAuth', () => {
    it('should return uid when auth is valid', () => {
      const context = createMockContext({ 
        auth: { uid: 'test-user-123' } 
      });

      const result = requireAuth(context);
      expect(result).to.equal('test-user-123');
    });

    it('should throw when auth is missing', () => {
      const context = createMockUnauthenticatedContext();
      expect(() => requireAuth(context)).to.throw('Authentication required');
    });
  });

  describe('requireAdmin', () => {
    it('should pass when user has admin role', () => {
      const context = createMockAdminContext();
      expect(() => requireAdmin(context)).to.not.throw();
    });

    it('should throw when user does not have admin role', () => {
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

      expect(() => requireAdmin(context)).to.throw('Admin role required');
    });

    it('should throw when auth is missing', () => {
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

    it('should throw when user is not admin', () => {
      const context = createMockContext();
      expect(() => requireAdminIdentifier(context)).to.throw('Admin role required');
    });
  });
});