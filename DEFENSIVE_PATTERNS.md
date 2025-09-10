# Defensive Export and Fallback Patterns

This document describes the defensive patterns implemented in PrecisionLearnDerm to ensure robust deployments and graceful degradation when components fail.

## Overview

The system implements defensive patterns at two levels:
1. **Backend (Functions)**: Defensive exports that handle missing modules gracefully
2. **Frontend (Web)**: Minimal fallback components that work without external dependencies

## Backend Defensive Exports

### Pattern Implementation

Located in `functions/src/util/defensiveExport.ts`, this provides utilities for safe module exports:

```typescript
// Safe export with automatic fallback
const exports = safeExportBatch('./module/path', [
  { name: 'functionName' },
  { name: 'anotherFunction', alias: 'aliasName' }
]);

export const functionName = exports.functionName;
```

### Key Features

1. **Graceful Module Loading**: If a module fails to load, continues deployment with stub functions
2. **Automatic Stub Generation**: Creates consistent error responses for missing functions
3. **Environment-Aware**: Conditionally exports development/test functions only in appropriate environments
4. **Backward Compatibility**: Maintains existing function signatures and response formats

### Export Types

#### Safe Export with Stubs
```typescript
const exports = safeExportBatch('./path/to/module', [
  { name: 'myFunction' }
]);
// Returns stub if module fails to load
```

#### Conditional Export
```typescript
const isDevelopment = process.env.NODE_ENV !== 'production';
const devFunction = conditionalExport(
  isDevelopment,
  './dev/module',
  'devFunction',
  () => ({ error: 'Disabled in production' })
);
```

#### Safe Export with Custom Fallback
```typescript
const myFunction = safeExport(
  './module/path',
  'functionName',
  customFallbackFunction
);
```

### Stub Function Behavior

When a module fails to load, stub functions:
- Log warnings about unavailable services
- Return consistent error responses
- Include appropriate HTTP status codes for Cloud Functions
- Maintain function signature compatibility

Example stub response:
```typescript
{
  success: false,
  error: "Service temporarily unavailable: functionName",
  code: "SERVICE_UNAVAILABLE"
}
```

## Frontend Minimal Fallbacks

### MinimalFallback Component

Located in `web/src/components/MinimalFallback.tsx`, provides comprehensive error and loading boundaries:

```tsx
import { MinimalFallback } from './components/MinimalFallback';

<MinimalFallback
  loadingFallback={<CustomLoader />}
  errorFallback={<CustomError />}
  onError={(error, errorInfo) => logError(error)}
>
  <MyComponent />
</MinimalFallback>
```

### Key Features

1. **No External Dependencies**: Uses inline styles and native CSS animations
2. **Responsive Design**: Works on all screen sizes
3. **Accessibility**: Includes proper focus management and screen reader support
4. **Dual Boundaries**: Handles both React errors and Suspense loading states

### Fallback Types

#### Loading Fallback
- Animated spinner using pure CSS
- Minimal styling that works without Tailwind/external CSS
- Graceful animation that respects `prefers-reduced-motion`

#### Error Fallback
- Clear error messaging
- Recovery actions (retry, reload, go home)
- Error details in development mode
- Styled to work without external CSS frameworks

### Usage Patterns

#### Higher-Order Component
```tsx
const SafeComponent = withDefensiveRendering(MyComponent, {
  onError: (error) => reportError(error)
});
```

#### Hook-Based
```tsx
function MyContainer() {
  const { wrapComponent } = useDefensiveWrapper();
  
  return wrapComponent(
    <ComplexComponent />,
    { onError: handleError }
  );
}
```

#### Direct Usage
```tsx
<MinimalFallback>
  <AsyncComponent />
</MinimalFallback>
```

## Implementation Guidelines

### When to Use Defensive Exports

1. **Non-Critical Functions**: Features that can gracefully degrade
2. **Development Tools**: Test endpoints, debug utilities
3. **Optional Integrations**: Third-party services, experimental features
4. **Environment-Specific**: Functions that should only exist in certain environments

### When NOT to Use Defensive Exports

1. **Core Authentication**: Security-critical functions must fail fast
2. **Database Operations**: Data integrity functions should not degrade
3. **Health Checks**: Monitoring endpoints need to report real status
4. **Payment Processing**: Financial operations require guaranteed availability

### Frontend Fallback Best Practices

1. **Progressive Enhancement**: Start with minimal fallback, enhance with features
2. **Inline Styles**: Don't depend on external CSS for critical fallbacks
3. **Clear Messaging**: Users should understand what happened and what to do
4. **Recovery Options**: Always provide a way for users to retry or continue

## Error Handling Strategy

### Backend Error Responses

All defensive exports follow a consistent error response format:

```typescript
interface DefensiveErrorResponse {
  success: false;
  error: string;          // Human-readable error message
  code: string;           // Machine-readable error code
  details?: any;          // Optional additional context
}
```

### Frontend Error States

1. **Loading State**: Show progress while components load
2. **Error State**: Clear error message with recovery options
3. **Empty State**: Handle cases where data is missing
4. **Offline State**: Gracefully handle network failures

## Monitoring and Observability

### Backend Logging

Defensive exports automatically log:
- Module loading failures
- Stub function invocations
- Environment-based function disabling

### Frontend Error Tracking

MinimalFallback components can be configured to:
- Report errors to external services
- Track user recovery actions
- Monitor fallback usage patterns

## Testing Defensive Patterns

### Backend Testing

Test scenarios for defensive exports:
```typescript
describe('Defensive Exports', () => {
  it('should provide stub when module missing', () => {
    // Mock module loading failure
    const result = safeExportWithStub('./nonexistent', 'func');
    expect(result()).to.include({ code: 'SERVICE_UNAVAILABLE' });
  });
});
```

### Frontend Testing

Test scenarios for fallback components:
```typescript
describe('MinimalFallback', () => {
  it('should show error UI when child throws', () => {
    const ThrowingComponent = () => { throw new Error('Test'); };
    render(
      <MinimalFallback>
        <ThrowingComponent />
      </MinimalFallback>
    );
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });
});
```

## Performance Considerations

### Backend
- Defensive exports add minimal runtime overhead
- Stub functions are lightweight and fast
- Module loading failures are cached to avoid repeated attempts

### Frontend
- Inline styles avoid CSS loading dependencies
- Minimal DOM structure reduces rendering cost
- Error boundaries prevent cascade failures

## Migration Guide

### Converting Existing Exports

1. **Identify Non-Critical Functions**
   ```typescript
   // Before
   export { myFunction } from './module';
   
   // After
   const exports = safeExportBatch('./module', [{ name: 'myFunction' }]);
   export const myFunction = exports.myFunction;
   ```

2. **Add Environment Guards**
   ```typescript
   // Before
   export { devTool } from './dev-tools';
   
   // After
   export const devTool = conditionalExport(
     process.env.NODE_ENV !== 'production',
     './dev-tools',
     'devTool'
   );
   ```

### Enhancing Frontend Components

1. **Add Error Boundaries**
   ```tsx
   // Before
   <MyComponent />
   
   // After
   <MinimalFallback>
     <MyComponent />
   </MinimalFallback>
   ```

2. **Convert to Defensive HOC**
   ```tsx
   const SafeMyComponent = withDefensiveRendering(MyComponent);
   ```

## Conclusion

Defensive patterns ensure that PrecisionLearnDerm maintains high availability even when individual components fail. By implementing these patterns consistently, we achieve:

- **Graceful Degradation**: System continues working when non-critical parts fail
- **Better User Experience**: Clear error states with recovery options
- **Deployment Safety**: Reduced risk of complete deployment failures
- **Maintainability**: Consistent patterns for handling failures

These patterns should be applied thoughtfully, with critical functions failing fast and non-critical functions degrading gracefully.

### Callable Security (Sep 2025)
- Always require `context.auth`; restrict email/resource checks to the caller unless `context.auth.token.admin === true`.
- Add emulator tests for unauthenticated and forbidden cases; include negative tests in CI.

### Deprecation Enforcement
- Centralize collection names and expose via constants; add lint/CI check to block `questionQueue` usage.
- Integration test: admin generation must create a `reviewQueue` doc; fail CI if missing.