/**
 * Hook for handling errors in the renderer process
 */
import { useState, useCallback, useEffect } from "react";

export interface ErrorState {
  error: string | null;
  errorType: string | null;
  recoverable: boolean;
  retryable: boolean;
  timestamp: string | null;
}

export interface UseErrorHandlerReturn {
  error: ErrorState;
  setError: (error: string, errorType?: string, recoverable?: boolean, retryable?: boolean) => void;
  clearError: () => void;
  handleError: (error: unknown) => void;
}

/**
 * Hook for managing error state and handling errors
 */
export function useErrorHandler(): UseErrorHandlerReturn {
  const [error, setErrorState] = useState<ErrorState>({
    error: null,
    errorType: null,
    recoverable: true,
    retryable: true,
    timestamp: null,
  });

  const setError = useCallback(
    (
      errorMessage: string,
      errorType = "Error",
      recoverable = true,
      retryable = true
    ) => {
      setErrorState({
        error: errorMessage,
        errorType,
        recoverable,
        retryable,
        timestamp: new Date().toISOString(),
      });
    },
    []
  );

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      errorType: null,
      recoverable: true,
      retryable: true,
      timestamp: null,
    });
  }, []);

  const handleError = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err && typeof err === "object") {
        // Handle structured error response from IPC
        if (err.success === false && err.error) {
          setError(
            err.error,
            err.errorType || "Error",
            err.recoverable !== false,
            err.retryable !== false
          );
        } else if (err.message) {
          // Handle Error object
          setError(err.message, err.name || "Error");
        } else {
          // Handle unknown error format
          setError(String(err));
        }
      } else {
        // Handle primitive error
        setError(String(err));
      }
    },
    [setError]
  );

  // Listen for global error events from main process
  useEffect(() => {
    if (window.api?.error?.onError) {
      const unsubscribe = window.api.error.onError((errorData) => {
        handleError(errorData);
      });

      return () => {
        unsubscribe();
      };
    }
  }, [handleError]);

  return {
    error,
    setError,
    clearError,
    handleError,
  };
}
