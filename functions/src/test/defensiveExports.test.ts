/**
 * Integration test for defensive export patterns
 * Tests that the defensive export system works correctly
 */

import { safeExport, safeExportBatch, createStubFunction, conditionalExport } from '../src/util/defensiveExport';

describe('Defensive Export Patterns', () => {
  beforeEach(() => {
    // Clear console warnings for cleaner test output
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('safeExport', () => {
    it('should return function when module exists and export is valid', () => {
      // Use a real module that exists
      const result = safeExport('fs', 'existsSync');
      expect(typeof result).toBe('function');
    });

    it('should return fallback when module does not exist', () => {
      const fallback = () => 'fallback result';
      const result = safeExport('./nonexistent-module', 'someFunction', fallback);
      expect(result).toBe(fallback);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load module')
      );
    });

    it('should return fallback when export does not exist', () => {
      const fallback = () => 'fallback result';
      const result = safeExport('fs', 'nonExistentFunction', fallback);
      expect(result).toBe(fallback);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Export \'nonExistentFunction\' not found')
      );
    });
  });

  describe('createStubFunction', () => {
    it('should create a function that returns error response', () => {
      const stub = createStubFunction('test-module', 'testFunction');
      const result = stub('arg1', 'arg2');
      
      expect(result).toEqual({
        success: false,
        error: 'Service temporarily unavailable: testFunction',
        code: 'SERVICE_UNAVAILABLE'
      });
      
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Function \'testFunction\' from module \'test-module\' is not available'),
        { args: ['arg1', 'arg2'] }
      );
    });
  });

  describe('safeExportBatch', () => {
    it('should handle mixed success and failure exports', () => {
      const result = safeExportBatch('fs', [
        { name: 'existsSync' }, // Should work
        { name: 'nonExistentFunction' }, // Should create stub
        { name: 'readFileSync', alias: 'readFile' } // Should work with alias
      ]);

      expect(typeof result.existsSync).toBe('function');
      expect(typeof result.nonExistentFunction).toBe('function');
      expect(typeof result.readFile).toBe('function');
      
      // Test that the stub returns error response
      const stubResult = result.nonExistentFunction();
      expect(stubResult).toEqual({
        success: false,
        error: 'Service temporarily unavailable: nonExistentFunction',
        code: 'SERVICE_UNAVAILABLE'
      });
    });

    it('should create stubs for all exports when module fails to load', () => {
      const result = safeExportBatch('./nonexistent-module', [
        { name: 'func1' },
        { name: 'func2', alias: 'aliasFunc2' }
      ]);

      expect(typeof result.func1).toBe('function');
      expect(typeof result.aliasFunc2).toBe('function');
      
      const result1 = result.func1();
      const result2 = result.aliasFunc2();
      
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
    });
  });

  describe('conditionalExport', () => {
    it('should return function when condition is true', () => {
      const result = conditionalExport(true, 'fs', 'existsSync');
      expect(typeof result).toBe('function');
    });

    it('should return fallback when condition is false', () => {
      const fallback = () => 'disabled';
      const result = conditionalExport(false, 'fs', 'existsSync', fallback);
      expect(result).toBe(fallback);
    });

    it('should return undefined when condition is false and no fallback provided', () => {
      const result = conditionalExport(false, 'fs', 'existsSync');
      expect(result).toBeUndefined();
    });
  });

  describe('Environment-aware behavior', () => {
    it('should respect NODE_ENV for conditional exports', () => {
      const originalEnv = process.env.NODE_ENV;
      
      try {
        // Test production environment
        process.env.NODE_ENV = 'production';
        const prodResult = conditionalExport(
          process.env.NODE_ENV !== 'production',
          'fs',
          'existsSync',
          () => ({ error: 'Disabled in production' })
        );
        
        expect(typeof prodResult).toBe('function');
        expect(prodResult()).toEqual({ error: 'Disabled in production' });
        
        // Test development environment
        process.env.NODE_ENV = 'development';
        const devResult = conditionalExport(
          process.env.NODE_ENV !== 'production',
          'fs',
          'existsSync'
        );
        
        expect(typeof devResult).toBe('function');
        // This should be the real function, not our fallback
        expect(devResult.toString()).not.toContain('Disabled in production');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});