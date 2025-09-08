/**
 * Defensive Export Utilities
 * Resolves module paths relative to lib root so production deploys can load compiled modules.
 */

import * as path from 'path';

/**
 * Resolve a module path relative to the compiled lib root.
 * __dirname here is .../lib/util at runtime; we need .../lib/<modulePath>.
 */
function resolveFromLibRoot(modulePath: string): string {
  if (modulePath.startsWith('.')) {
    // lib/util -> lib
    return path.join(__dirname, '..', modulePath);
  }
  return modulePath;
}

/**
 * Safe export wrapper that catches module import failures
 * and provides a fallback stub function (dev only).
 */
export function safeExport<T>(
  modulePath: string,
  exportName: string,
  fallbackFn?: T
): T | undefined {
  try {
    const resolved = resolveFromLibRoot(modulePath);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(resolved);
    const exported = mod[exportName];

    if (typeof exported === 'function') {
      return exported;
    }

    console.warn(`Export '${exportName}' not found in '${resolved}', using fallback`);
    return fallbackFn;
  } catch (error) {
    console.warn(
      `Failed to load module '${modulePath}': ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    return fallbackFn;
  }
}

/**
 * Creates a stub function; in production we throw to avoid silent fallbacks.
 */
export function createStubFunction(moduleName: string, functionName: string) {
  return (...args: any[]) => {
    const message = `Function '${functionName}' from module '${moduleName}' is not available.`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.warn(`${message} Returning dev stub.`, { args });
    return {
      success: false,
      error: `Service temporarily unavailable: ${functionName}`,
      code: 'SERVICE_UNAVAILABLE'
    };
  };
}

/**
 * Safe export with automatic stub generation for missing functions
 */
export function safeExportWithStub<T extends (...args: any[]) => any>(
  modulePath: string,
  exportName: string
): T {
  const fn = safeExport(modulePath, exportName);
  if (fn) return fn as T;
  return createStubFunction(modulePath, exportName) as T;
}

/**
 * Batch safe export for multiple functions from the same module
 */
export function safeExportBatch(
  modulePath: string,
  exports: Array<{ name: string; alias?: string }>
): Record<string, any> {
  const result: Record<string, any> = {};
  try {
    const resolved = resolveFromLibRoot(modulePath);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(resolved);

    for (const { name, alias } of exports) {
      const key = alias || name;
      if (mod[name] && typeof mod[name] === 'function') {
        result[key] = mod[name];
      } else {
        console.warn(`Export '${name}' not found in '${resolved}', creating stub`);
        result[key] = createStubFunction(modulePath, name);
      }
    }
  } catch (error) {
    console.warn(
      `Failed to load module '${modulePath}': ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    for (const { name, alias } of exports) {
      const key = alias || name;
      result[key] = createStubFunction(modulePath, name);
    }
  }
  return result;
}

/**
 * Environment-aware safe export that can disable certain functions in production
 */
export function conditionalExport<T>(
  condition: boolean,
  modulePath: string,
  exportName: string,
  fallbackFn?: T
): T | undefined {
  if (!condition) return fallbackFn;
  return safeExport(modulePath, exportName, fallbackFn);
}