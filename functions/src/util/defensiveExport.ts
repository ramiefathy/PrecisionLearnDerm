/**
 * Defensive Export Utilities
 * Provides safe export patterns that handle missing modules gracefully
 * and provide fallback behaviors when modules fail to load.
 */

/**
 * Safe export wrapper that catches module import failures
 * and provides a fallback stub function
 */
export function safeExport<T>(
  modulePath: string,
  exportName: string,
  fallbackFn?: T
): T | undefined {
  try {
    const module = require(modulePath);
    const exportedFunction = module[exportName];
    
    if (typeof exportedFunction === 'function') {
      return exportedFunction;
    }
    
    console.warn(`Export '${exportName}' not found in module '${modulePath}', using fallback`);
    return fallbackFn;
  } catch (error) {
    console.warn(`Failed to load module '${modulePath}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    return fallbackFn;
  }
}

/**
 * Creates a stub function that logs attempts to call missing functions
 */
export function createStubFunction(moduleName: string, functionName: string) {
  return (...args: any[]) => {
    const message = `Function '${functionName}' from module '${moduleName}' is not available. This is a stub implementation.`;
    console.warn(message, { args });
    
    // Return a consistent error response for Cloud Functions
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
  const safeFunction = safeExport(modulePath, exportName);
  
  if (safeFunction) {
    return safeFunction as T;
  }
  
  // Return a stub function if the export failed
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
    const module = require(modulePath);
    
    for (const exportConfig of exports) {
      const { name, alias } = exportConfig;
      const key = alias || name;
      
      if (module[name] && typeof module[name] === 'function') {
        result[key] = module[name];
      } else {
        console.warn(`Export '${name}' not found in module '${modulePath}', creating stub`);
        result[key] = createStubFunction(modulePath, name);
      }
    }
  } catch (error) {
    console.warn(`Failed to load module '${modulePath}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Create stubs for all requested exports
    for (const exportConfig of exports) {
      const { name, alias } = exportConfig;
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
  if (!condition) {
    return fallbackFn;
  }
  
  return safeExport(modulePath, exportName, fallbackFn);
}