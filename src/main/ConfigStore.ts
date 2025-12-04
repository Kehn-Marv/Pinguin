import Store from "electron-store";
import logger from "electron-log";

const log = logger.log;

/**
 * Application configuration interface
 */
export interface AppConfig {
  // Theme settings
  theme: "light" | "dark" | "system";
  
  // Model settings
  activeLLM: string;
  activeEmbeddingModel: string;
  
  // Study mode
  studyMode: "files" | "coding" | "thinking";
  
  // Service ports
  ollamaPort: number;
  pythonBackendPort: number;
  
  // RAG settings
  maxContextMessages: number;
  maxContextChars: number; // Maximum characters in conversation context
  retrievalTopK: number;
  similarityThreshold: number;
  chunkSize: number;
  chunkOverlap: number;
  
  // Model paths
  modelInstallationLocation: string;
  
  // Performance settings
  embeddingBatchSize: number;
  cacheEnabled: boolean;
  cacheTTL: number; // in minutes
  maxCacheEntries: number;
  
  // First run flag
  isFirstRun: boolean;
}

/**
 * Default configuration values
 */
const defaultConfig: AppConfig = {
  theme: "system",
  activeLLM: "",
  activeEmbeddingModel: "", // Empty on first run - user must select and download
  studyMode: "files",
  ollamaPort: 11434,
  pythonBackendPort: 8000,
  maxContextMessages: 6,
  maxContextChars: 4000,
  retrievalTopK: 10,
  similarityThreshold: 0.25,
  chunkSize: 320,
  chunkOverlap: 50,
  modelInstallationLocation: "",
  embeddingBatchSize: 32,
  cacheEnabled: true,
  cacheTTL: 5,
  maxCacheEntries: 100,
  isFirstRun: true,
};

/**
 * ConfigStore manages application configuration using electron-store
 * Provides type-safe get/set methods with validation
 */
class ConfigStore {
  private static instance: ConfigStore;
  private store: Store<AppConfig>;

  private constructor() {
    this.store = new Store<AppConfig>({
      defaults: defaultConfig,
      name: "pinguin-config",
      clearInvalidConfig: true,
    });

    // Validate and migrate config on initialization
    this.validateAndMigrate();
  }

  public static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    return ConfigStore.instance;
  }

  /**
   * Validate and migrate configuration
   */
  private validateAndMigrate(): void {
    // Ensure all default keys exist
    for (const key in defaultConfig) {
      if (!this.store.has(key as keyof AppConfig)) {
        log(`Adding missing config key: ${key}`);
        this.store.set(
          key as keyof AppConfig,
          defaultConfig[key as keyof AppConfig]
        );
      }
    }

    // Migration: Fix old embedding model name (nomic-embed-text -> nomic-embed-text:v1.5)
    const embeddingModel = this.store.get("activeEmbeddingModel");
    if (embeddingModel === "nomic-embed-text") {
      log(`Migrating embedding model from "nomic-embed-text" to "nomic-embed-text:v1.5"`);
      this.store.set("activeEmbeddingModel", "nomic-embed-text:v1.5");
    }

    // Validate theme
    const theme = this.store.get("theme");
    if (!["light", "dark", "system"].includes(theme)) {
      log(`Invalid theme value: ${theme}, resetting to default`);
      this.store.set("theme", defaultConfig.theme);
    }

    // Validate study mode
    const studyMode = this.store.get("studyMode");
    if (!["files", "coding", "thinking"].includes(studyMode)) {
      log(`Invalid study mode: ${studyMode}, resetting to default`);
      this.store.set("studyMode", defaultConfig.studyMode);
    }

    // Validate numeric ranges
    this.validateNumericRange("maxContextMessages", 1, 20);
    this.validateNumericRange("maxContextChars", 1000, 10000);
    this.validateNumericRange("retrievalTopK", 1, 50);
    this.validateNumericRange("similarityThreshold", 0, 1);
    this.validateNumericRange("chunkSize", 100, 1000);
    this.validateNumericRange("chunkOverlap", 0, 200);
    this.validateNumericRange("embeddingBatchSize", 1, 128);
    this.validateNumericRange("cacheTTL", 1, 60);
    this.validateNumericRange("maxCacheEntries", 10, 1000);
  }

  /**
   * Validate numeric value is within range
   */
  private validateNumericRange(
    key: keyof AppConfig,
    min: number,
    max: number
  ): void {
    const value = this.store.get(key) as number;
    if (typeof value !== "number" || value < min || value > max) {
      log(
        `Invalid ${key} value: ${value}, must be between ${min} and ${max}, resetting to default`
      );
      this.store.set(key, defaultConfig[key] as unknown);
    }
  }

  /**
   * Get a configuration value
   */
  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.store.get(key);
  }

  /**
   * Set a configuration value with validation
   */
  public set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    // Validate before setting
    if (!this.validateValue(key, value)) {
      log(`Invalid value for ${key}: ${value}, not setting`);
      throw new Error(`Invalid value for ${key}: ${value}`);
    }

    log(`Setting config ${key} = ${value}`);
    this.store.set(key, value);
  }

  /**
   * Get entire configuration
   */
  public getAll(): AppConfig {
    return this.store.store;
  }

  /**
   * Set multiple configuration values
   */
  public setMultiple(config: Partial<AppConfig>): void {
    for (const key in config) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        const value = config[key as keyof AppConfig];
        if (value !== undefined) {
          this.set(key as keyof AppConfig, value);
        }
      }
    }
  }

  /**
   * Reset configuration to defaults
   */
  public reset(): void {
    log("Resetting configuration to defaults");
    this.store.clear();
    this.validateAndMigrate();
  }

  /**
   * Reset a specific key to default
   */
  public resetKey<K extends keyof AppConfig>(key: K): void {
    log(`Resetting ${key} to default`);
    this.store.set(key, defaultConfig[key]);
  }

  /**
   * Validate a configuration value
   */
  private validateValue<K extends keyof AppConfig>(
    key: K,
    value: AppConfig[K]
  ): boolean {
    switch (key) {
      case "theme":
        return ["light", "dark", "system"].includes(value as string);
      
      case "studyMode":
        return ["files", "coding", "thinking"].includes(value as string);
      
      case "activeLLM":
      case "activeEmbeddingModel":
      case "modelInstallationLocation":
        return typeof value === "string";
      
      case "ollamaPort":
      case "pythonBackendPort":
        return (
          typeof value === "number" &&
          value >= 1024 &&
          value <= 65535
        );
      
      case "maxContextMessages":
        return (
          typeof value === "number" &&
          value >= 1 &&
          value <= 20
        );
      
      case "maxContextChars":
        return (
          typeof value === "number" &&
          value >= 1000 &&
          value <= 10000
        );
      
      case "retrievalTopK":
        return (
          typeof value === "number" &&
          value >= 1 &&
          value <= 50
        );
      
      case "similarityThreshold":
        return (
          typeof value === "number" &&
          value >= 0 &&
          value <= 1
        );
      
      case "chunkSize":
        return (
          typeof value === "number" &&
          value >= 100 &&
          value <= 1000
        );
      
      case "chunkOverlap":
        return (
          typeof value === "number" &&
          value >= 0 &&
          value <= 200
        );
      
      case "embeddingBatchSize":
        return (
          typeof value === "number" &&
          value >= 1 &&
          value <= 128
        );
      
      case "cacheTTL":
        return (
          typeof value === "number" &&
          value >= 1 &&
          value <= 60
        );
      
      case "maxCacheEntries":
        return (
          typeof value === "number" &&
          value >= 10 &&
          value <= 1000
        );
      
      case "cacheEnabled":
      case "isFirstRun":
        return typeof value === "boolean";
      
      default:
        return true;
    }
  }

  /**
   * Check if this is the first run
   */
  public isFirstRun(): boolean {
    return this.store.get("isFirstRun");
  }

  /**
   * Mark first run as complete
   */
  public completeFirstRun(): void {
    log("Marking first run as complete");
    this.store.set("isFirstRun", false);
  }

  /**
   * Get the store path for debugging
   */
  public getStorePath(): string {
    return this.store.path;
  }
}

export default ConfigStore;
