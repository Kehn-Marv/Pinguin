import Logger from "electron-log";

/**
 * Performance thresholds for different operations (in milliseconds)
 */
const PERFORMANCE_THRESHOLDS = {
  contextualization: 1000, // Contextualization should complete within 1s
  documentSearch: 500, // Document search should complete within 500ms
  llmFirstToken: 5000, // First token should arrive within 5s
  llmStreaming: 120000, // LLM request timeout: 120s (2 minutes)
  searchQuery: 200, // Search should complete within 200ms
  messageProcessing: 3000, // Overall message processing within 3s
  fileUpload: 60000, // File upload processing within 60s
};

/**
 * Performance metrics for an operation
 */
interface PerformanceMetric {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Active timer for tracking ongoing operations
 */
interface ActiveTimer {
  operation: string;
  startTime: number;
  metadata?: Record<string, unknown>;
}

/**
 * PerformanceMonitor class for tracking and logging operation timing
 * Helps identify performance bottlenecks and slow operations
 */
class PerformanceMonitor {
  private static activeTimers: Map<string, ActiveTimer> = new Map();
  private static metrics: PerformanceMetric[] = [];
  private static readonly MAX_METRICS_HISTORY = 100; // Keep last 100 metrics

  /**
   * Starts a timer for an operation
   * @param operation - Name of the operation being tracked
   * @param metadata - Optional metadata about the operation
   * @returns A function to call when the operation completes
   */
  public static startTimer(
    operation: string,
    metadata?: Record<string, unknown>
  ): () => void {
    const timerId = `${operation}-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();

    this.activeTimers.set(timerId, {
      operation,
      startTime,
      metadata,
    });

    Logger.debug(`[Performance] Started: ${operation}`, metadata);

    // Return end timer function
    return () => {
      this.endTimer(timerId);
    };
  }

  /**
   * Ends a timer and logs the duration
   * @param timerId - ID of the timer to end
   */
  private static endTimer(timerId: string): void {
    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      Logger.warn(`[Performance] Timer not found: ${timerId}`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - timer.startTime;

    // Create metric
    const metric: PerformanceMetric = {
      operation: timer.operation,
      startTime: timer.startTime,
      endTime,
      duration,
      metadata: timer.metadata,
    };

    // Store metric
    this.metrics.push(metric);
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics.shift(); // Remove oldest metric
    }

    // Remove from active timers
    this.activeTimers.delete(timerId);

    // Log the metric
    this.logMetric(metric);

    // Check if operation was slow
    this.checkSlowOperation(metric);
  }

  /**
   * Logs a performance metric
   * @param metric - The metric to log
   */
  private static logMetric(metric: PerformanceMetric): void {
    const metadataStr = metric.metadata
      ? ` | ${JSON.stringify(metric.metadata)}`
      : "";
    Logger.info(
      `[Performance] ${metric.operation}: ${metric.duration}ms${metadataStr}`
    );
  }

  /**
   * Checks if an operation exceeded its threshold and logs a warning
   * @param metric - The metric to check
   */
  private static checkSlowOperation(metric: PerformanceMetric): void {
    const threshold = this.getThreshold(metric.operation);
    if (threshold && metric.duration && metric.duration > threshold) {
      const metadataStr = metric.metadata
        ? ` | ${JSON.stringify(metric.metadata)}`
        : "";
      Logger.warn(
        `[Performance] SLOW OPERATION: ${metric.operation} took ${metric.duration}ms (threshold: ${threshold}ms)${metadataStr}`
      );
    }
  }

  /**
   * Gets the performance threshold for an operation
   * @param operation - Operation name
   * @returns Threshold in milliseconds, or undefined if no threshold set
   */
  private static getThreshold(operation: string): number | undefined {
    // Check for exact match
    if (operation in PERFORMANCE_THRESHOLDS) {
      return PERFORMANCE_THRESHOLDS[
        operation as keyof typeof PERFORMANCE_THRESHOLDS
      ];
    }

    // Check for partial matches (e.g., "message:send" matches "messageProcessing")
    for (const [key, value] of Object.entries(PERFORMANCE_THRESHOLDS)) {
      if (operation.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Wraps an async function with performance monitoring
   * @param operation - Name of the operation
   * @param fn - Async function to wrap
   * @param metadata - Optional metadata
   * @returns Wrapped function that tracks performance
   */
  public static async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const endTimer = this.startTimer(operation, metadata);
    try {
      const result = await fn();
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      Logger.error(`[Performance] Error in ${operation}:`, error);
      throw error;
    }
  }

  /**
   * Wraps a synchronous function with performance monitoring
   * @param operation - Name of the operation
   * @param fn - Function to wrap
   * @param metadata - Optional metadata
   * @returns Wrapped function that tracks performance
   */
  public static measure<T>(
    operation: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T {
    const endTimer = this.startTimer(operation, metadata);
    try {
      const result = fn();
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      Logger.error(`[Performance] Error in ${operation}:`, error);
      throw error;
    }
  }

  /**
   * Creates a timeout promise that rejects after specified duration
   * @param operation - Name of the operation
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise that rejects on timeout
   */
  public static createTimeout(
    operation: string,
    timeoutMs: number
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        Logger.error(
          `[Performance] TIMEOUT: ${operation} exceeded ${timeoutMs}ms`
        );
        reject(
          new Error(`Operation "${operation}" timed out after ${timeoutMs}ms`)
        );
      }, timeoutMs);
    });
  }

  /**
   * Wraps a promise with a timeout
   * @param operation - Name of the operation
   * @param promise - Promise to wrap
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise that rejects if timeout is exceeded
   */
  public static async withTimeout<T>(
    operation: string,
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([promise, this.createTimeout(operation, timeoutMs)]);
  }

  /**
   * Gets performance statistics for a specific operation
   * @param operation - Operation name
   * @returns Statistics object with min, max, avg, count
   */
  public static getStats(operation: string): {
    min: number;
    max: number;
    avg: number;
    count: number;
  } | null {
    const operationMetrics = this.metrics.filter(
      (m) => m.operation === operation && m.duration !== undefined
    );

    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics
      .map((m) => m.duration)
      .filter((d): d is number => d !== undefined);
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    return {
      min,
      max,
      avg,
      count: operationMetrics.length,
    };
  }

  /**
   * Gets all performance metrics
   * @returns Array of all stored metrics
   */
  public static getAllMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Clears all stored metrics
   */
  public static clearMetrics(): void {
    this.metrics = [];
    Logger.info("[Performance] Metrics cleared");
  }

  /**
   * Gets currently active timers (for debugging)
   * @returns Array of active timer operations
   */
  public static getActiveTimers(): string[] {
    return Array.from(this.activeTimers.values()).map((t) => t.operation);
  }

  /**
   * Logs a summary of performance metrics
   */
  public static logSummary(): void {
    const operations = new Set(this.metrics.map((m) => m.operation));

    Logger.info("[Performance] === Performance Summary ===");
    for (const operation of operations) {
      const stats = this.getStats(operation);
      if (stats) {
        Logger.info(
          `[Performance] ${operation}: avg=${stats.avg.toFixed(2)}ms, min=${stats.min}ms, max=${stats.max}ms, count=${stats.count}`
        );
      }
    }
    Logger.info("[Performance] ========================");
  }

  /**
   * Gets the default timeout for LLM requests
   * @returns Timeout in milliseconds
   */
  public static getLLMTimeout(): number {
    return PERFORMANCE_THRESHOLDS.llmStreaming;
  }
}

export default PerformanceMonitor;
