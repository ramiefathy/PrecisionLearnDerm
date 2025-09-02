import { toast } from '../components/Toast';

export interface ErrorInfo {
  title: string;
  message: string;
  context?: string;
  shouldLog?: boolean;
}

/**
 * Extracts error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object') {
    const err = error as any;
    
    // Firebase error format
    if (err.code && err.message) {
      return err.message;
    }
    
    // Standard Error object
    if (err.message) {
      return err.message;
    }
    
    // API error format
    if (err.error?.message) {
      return err.error.message;
    }
  }
  
  return 'An unexpected error occurred';
}

/**
 * Standardized error handling for API calls and other operations
 */
export function handleError(error: unknown, info: ErrorInfo): void {
  const message = extractErrorMessage(error);
  
  // Console logging for debugging (only in development or when explicitly requested)
  if (info.shouldLog !== false && (process.env.NODE_ENV === 'development' || info.shouldLog)) {
    const context = info.context ? `[${info.context}]` : '';
    console.error(`${context} ${info.title}:`, error);
  }
  
  // Show user-friendly toast notification
  toast.error(info.title, message);
}

/**
 * Specialized error handler for API operations
 */
export function handleApiError(error: unknown, operation: string, context?: string): void {
  handleError(error, {
    title: `Failed to ${operation}`,
    message: extractErrorMessage(error),
    context: context || 'API',
    shouldLog: true,
  });
}

/**
 * Specialized error handler for admin operations
 */
export function handleAdminError(error: unknown, operation: string): void {
  handleApiError(error, operation, 'Admin');
}

/**
 * Error handler for loading operations with fallback state management
 */
export function handleLoadingError<T>(
  error: unknown, 
  operation: string, 
  setErrorState?: (error: string | null) => void,
  setDataState?: (data: T) => void,
  fallbackData?: T
): void {
  const message = extractErrorMessage(error);
  
  // Set error state if provided
  if (setErrorState) {
    setErrorState(message);
  }
  
  // Set fallback data if provided
  if (setDataState && fallbackData !== undefined) {
    setDataState(fallbackData);
  }
  
  handleApiError(error, operation);
}