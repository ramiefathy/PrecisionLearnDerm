# Authentication Type Safety Migration Guide

This guide outlines the comprehensive TypeScript enhancements to the authentication system, eliminating `any` types and improving type safety throughout the codebase.

## Overview

The authentication system has been consolidated and enhanced with:
- **Single source of truth**: All authentication logic in `util/auth.ts`
- **Type-safe contexts**: Proper TypeScript interfaces for all authentication states
- **Type guards**: Runtime type checking with compile-time type narrowing
- **Deprecation strategy**: Gradual migration from unsafe patterns

## Enhanced Type System

### Core Types

```typescript
// Base context - uses Firebase Functions' native type
export type CallableContext = functions.https.CallableContext;

// Guaranteed authenticated user
interface AuthenticatedContext extends CallableContext {
  auth: {
    uid: string;
    token: admin.auth.DecodedIdToken & {
      admin?: boolean;
      email?: string;
      [key: string]: any;
    };
  };
}

// Guaranteed admin user
interface AdminContext extends CallableContext {
  auth: {
    uid: string;
    token: admin.auth.DecodedIdToken & {
      admin: true;  // Required to be true
      email?: string;
      [key: string]: any;
    };
  };
}
```

### Type Guards

```typescript
// Runtime checks with compile-time type narrowing
export function isAuthenticated(context: CallableContext): context is AuthenticatedContext
export function isAdmin(context: CallableContext): context is AdminContext
```

## Migration Patterns

### 1. Function Parameter Types

**BEFORE:**
```typescript
export const myFunction = functions.https.onCall(async (data: any, context: any) => {
  // Unsafe - could fail at runtime
  const uid = context.auth.uid;
});
```

**AFTER:**
```typescript
interface MyFunctionData {
  itemId: string;
  options?: string[];
}

export const myFunction = functions.https.onCall(async (data: MyFunctionData, context: CallableContext) => {
  // Type-safe with proper validation
  const uid = requireAuth(context); // Returns string, throws if invalid
});
```

### 2. Authentication Requirements

**BEFORE:**
```typescript
export const adminFunction = functions.https.onCall(async (data: any, context: any) => {
  // Unsafe - manual checks
  if (!context?.auth?.uid) {
    throw new Error('Not authenticated');
  }
  if (context.auth.token?.admin !== true) {
    throw new Error('Not admin');
  }
  
  const uid = context.auth.uid; // Could still be undefined
});
```

**AFTER:**
```typescript
export const adminFunction = functions.https.onCall(async (data: AdminFunctionData, context: CallableContext) => {
  // Type-safe with proper error codes
  requireAdmin(context); // Throws HttpsError with proper codes
  
  // OR get typed admin context
  const adminContext = requireAdminContext(context);
  const uid = adminContext.auth.uid; // Guaranteed to exist
  const isAdmin = adminContext.auth.token.admin; // Guaranteed to be true
});
```

### 3. Error Handling

**BEFORE:**
```typescript
} catch (error: any) {
  return { success: false, error: error.message };
}
```

**AFTER:**
```typescript
} catch (error: any) {
  console.error('Function error:', error);
  
  // Re-throw HttpsError for proper client handling
  if (error instanceof functions.https.HttpsError) {
    throw error;
  }
  
  throw new functions.https.HttpsError('internal', 
    error instanceof Error ? error.message : 'An unexpected error occurred');
}
```

## New Authentication Functions

### Core Functions
```typescript
// Basic authentication - returns UID
requireAuth(context: CallableContext): string

// Authentication with context - returns typed context
requireAuthentication(context: CallableContext): AuthenticatedContext

// Admin requirement - void return for backward compatibility
requireAdmin(context: CallableContext): void

// Admin requirement - returns typed admin context
requireAdminContext(context: CallableContext): AdminContext

// Admin check - boolean return
isAdmin(context: CallableContext): boolean

// Get admin identifier (email or UID) - replacement for requireAdminByEmail
requireAdminIdentifier(context: CallableContext): string
```

### Admin Management
```typescript
// Set admin claim
setAdminClaim(uid: string): Promise<void>

// Remove admin claim  
removeAdminClaim(uid: string): Promise<void>
```

## Migration Steps

### Step 1: Update Function Signatures

Replace `any` types with proper interfaces:

```typescript
// Define data interface
interface FunctionData {
  requiredField: string;
  optionalField?: number;
}

// Use CallableContext instead of any
export const myFunction = functions.https.onCall(
  async (data: FunctionData, context: CallableContext) => {
```

### Step 2: Update Authentication Calls

Replace manual checks with type-safe functions:

```typescript
// For admin functions
requireAdmin(context);

// For authenticated functions
const uid = requireAuth(context);

// For functions needing admin context
const adminContext = requireAdminContext(context);
const adminEmail = adminContext.auth.token.email || adminContext.auth.uid;
```

### Step 3: Update Error Handling

Use proper HttpsError codes:

```typescript
// Input validation
if (!data?.requiredField) {
  throw new functions.https.HttpsError('invalid-argument', 'Missing required field');
}

// Not found errors
if (!document.exists) {
  throw new functions.https.HttpsError('not-found', 'Resource not found');
}

// Proper error re-throwing
} catch (error: any) {
  if (error instanceof functions.https.HttpsError) {
    throw error;
  }
  throw new functions.https.HttpsError('internal', 'Internal error occurred');
}
```

### Step 4: Update Imports

```typescript
// Single import location
import { 
  requireAuth, 
  requireAdmin, 
  requireAdminContext,
  requireAdminIdentifier,
  isAdmin 
} from '../util/auth';

import { CallableContext, AuthenticatedContext, AdminContext } from '../types';
```

## Deprecated Patterns

### adminAuth.ts (DEPRECATED)
- `requireAdminByEmail()` → Use `requireAdminIdentifier()` from `util/auth`
- `isAdmin()` → Use `isAdmin()` from `util/auth`
- `setAdminClaim()` → Use `setAdminClaim()` from `util/auth`  
- `removeAdminClaim()` → Use `removeAdminClaim()` from `util/auth`

### Unsafe Type Assertions
- `context as AuthenticatedContext` → Use `requireAuthentication(context)`
- `context.auth!.uid` → Use `requireAuth(context)`
- Manual admin checks → Use `requireAdmin()` or `requireAdminContext()`

## Testing

Enhanced test utilities are available:

```typescript
import { createMockContext, createMockAdminContext } from './testUtils';

describe('Auth Tests', () => {
  it('should handle admin context', () => {
    const context = createMockAdminContext();
    const result = requireAdminContext(context);
    expect(result.auth.token.admin).to.be.true;
  });
});
```

## Benefits

1. **Type Safety**: Compile-time checking prevents auth-related runtime errors
2. **Consistent Error Handling**: Proper HttpsError codes for client consumption
3. **Better IDE Support**: IntelliSense and auto-completion for auth patterns
4. **Maintainability**: Single source of truth for authentication logic
5. **Testing**: Type-safe mock utilities for comprehensive testing

## Checklist for Migration

- [ ] Replace `context: any` with `context: CallableContext`
- [ ] Replace `data: any` with proper interface types
- [ ] Update authentication calls to use new functions
- [ ] Update error handling to use HttpsError with proper codes
- [ ] Update imports to use `util/auth` instead of `util/adminAuth`
- [ ] Add proper TypeScript interfaces for function data
- [ ] Update tests to use new type-safe patterns
- [ ] Remove deprecated `adminAuth.ts` usage

This migration ensures type safety throughout the authentication system while maintaining backward compatibility during the transition period.