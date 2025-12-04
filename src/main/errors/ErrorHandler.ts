/**
 * Centralized error handling for Electron main process
 * Provides structured error responses and logging
 */
import logger from "electron-log";
import { BrowserWindow } from "electron";

export interface ErrorResponse {
  success: false;
  error: string;
  errorType: string;
  timestamp: string;
  recoverable: boolean;
  retryable: boolean;
}

export enum ErrorType {
  PROCESS_SPAWN = "ProcessSpawnError",
  PROCESS_CRASH = "ProcessCrashError",
  IPC_ERROR = "IPCError",
  FILE_SYSTEM = "FileSystemError",
  NETWORK = "NetworkError",
  VALIDATION = "ValidationError",
  TIMEOUT = "TimeoutError",
  UNKNOWN = "UnknownError",
}

export class AppError extends Error {
  constructor(
    message: string,
    public type: ErrorType = ErrorType.UNKNOWN,
    public recoverable: boolean = true,
    public retryable: boolean = true,
    public originalError?: Error
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Error handler class for managing errors in the main process
 */
export class ErrorHandler {
  private static instance: ErrorHandler;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle an error and return a structured response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public handleError(error: Error | AppError | any): ErrorResponse {
    const timestamp = new Date().toISOString();

    // Log the error
    if (error instanceof Error) {
      logger.error("Error occurred:", {
        message: error.message,
        stack: error.stack,
        type: error instanceof AppError ? error.type : ErrorType.UNKNOWN,
        timestamp,
      });
    } else {
      logger.error("Unknown error occurred:", error);
    }

    // Determine error details
    let errorMessage: string;
    let errorType: ErrorType;
    let recoverable: boolean;
    let retryable: boolean;

    if (error instanceof AppError) {
      errorMessage = error.message;
      errorType = error.type;
      recoverable = error.recoverable;
      retryable = error.retryable;
    } else if (error instanceof Error) {
      errorMessage = error.message;
      errorType = this.classifyError(error);
      recoverable = this.isRecoverable(error);
      retryable = this.isRetryable(error);
    } else {
      errorMessage = String(error);
      errorType = ErrorType.UNKNOWN;
      recoverable = false;
      retryable = false;
    }

    return {
      success: false,
      error: errorMessage,
      errorType,
      timestamp,
      recoverable,
      retryable,
    };
  }

  /**
   * Classify an error based on its properties
   */
  private classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes("spawn") || message.includes("enoent")) {
      return ErrorType.PROCESS_SPAWN;
    } else if (message.includes("timeout")) {
      return ErrorType.TIMEOUT;
    } else if (
      message.includes("eacces") ||
      message.includes("eperm") ||
      message.includes("permission")
    ) {
      return ErrorType.FILE_SYSTEM;
    } else if (
      message.includes("econnrefused") ||
      message.includes("network") ||
      message.includes("fetch")
    ) {
      return ErrorType.NETWORK;
    } else if (message.includes("validation") || message.includes("invalid")) {
      return ErrorType.VALIDATION;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * Determine if an error is recoverable
   */
  private isRecoverable(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Non-recoverable errors
    if (
      message.includes("eacces") ||
      message.includes("eperm") ||
      message.includes("out of memory")
    ) {
      return false;
    }

    // Most errors are potentially recoverable
    return true;
  }

  /**
   * Determine if an operation should be retried
   */
  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Retryable errors
    if (
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("network") ||
      message.includes("unavailable")
    ) {
      return true;
    }

    // Non-retryable errors
    if (
      message.includes("validation") ||
      message.includes("invalid") ||
      message.includes("not found") ||
      message.includes("permission")
    ) {
      return false;
    }

    return true;
  }

  /**
   * Send error event to renderer process
   */
  public sendErrorToRenderer(
    window: BrowserWindow | null,
    error: ErrorResponse
  ): void {
    if (window && !window.isDestroyed()) {
      window.webContents.send("error:occurred", error);
    }
  }

  /**
   * Wrap an IPC handler with error handling
   */
  public wrapIPCHandler<T extends unknown[], R>(
    handler: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R | ErrorResponse> {
    return async (...args: T): Promise<R | ErrorResponse> => {
      try {
        return await handler(...args);
      } catch (error) {
        return this.handleError(error);
      }
    };
  }
}

/**
 * Utility function to create error responses
 */
export function createErrorResponse(
  message: string,
  type: ErrorType = ErrorType.UNKNOWN,
  recoverable = true,
  retryable = true
): ErrorResponse {
  return {
    success: false,
    error: message,
    errorType: type,
    timestamp: new Date().toISOString(),
    recoverable,
    retryable,
  };
}

/**
 * Utility function to check if a response is an error
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isErrorResponse(response: any): response is ErrorResponse {
  return (
    response &&
    typeof response === "object" &&
    response.success === false &&
    "error" in response
  );
}
