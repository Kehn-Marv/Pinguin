import { BrowserWindow } from "electron";
import logger from "electron-log";
import * as path from "path";
import * as fs from "fs";

const log = logger.log;

/**
 * SplashWindow manages the splash screen during application startup
 * Displays loading status and progress to the user
 */
class SplashWindow {
  private window: BrowserWindow | null = null;

  /**
   * Create and show splash window
   */
  public create(): BrowserWindow {
    log("Creating splash window");

    this.window = new BrowserWindow({
      width: 400,
      height: 350,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      center: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load splash HTML
    const splashHtml = this.generateSplashHTML();
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

    log("Splash window created");
    return this.window;
  }

  /**
   * Close splash window
   */
  public close(): void {
    if (this.window && !this.window.isDestroyed()) {
      log("Closing splash window");
      this.window.close();
      this.window = null;
    }
  }

  /**
   * Get splash window instance
   */
  public getWindow(): BrowserWindow | null {
    return this.window;
  }

  /**
   * Generate splash screen HTML
   */
  private generateSplashHTML(): string {
    // Load icon as base64 - try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, "../../../public/icon.png"),
      path.join(process.cwd(), "public/icon.png"),
      path.join(__dirname, "../../public/icon.png"),
    ];
    
    let iconBase64 = "";
    for (const iconPath of possiblePaths) {
      try {
        if (fs.existsSync(iconPath)) {
          const iconBuffer = fs.readFileSync(iconPath);
          iconBase64 = `data:image/png;base64,${iconBuffer.toString("base64")}`;
          log(`Successfully loaded icon from: ${iconPath}`);
          break;
        }
      } catch (error) {
        log(`Failed to load icon from ${iconPath}:`, error);
      }
    }
    
    if (!iconBase64) {
      log("Warning: Could not load icon from any path");
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pinguin - Loading</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }

    .splash-container {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border-radius: 16px;
      padding: 35px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    }

    .logo-container {
      margin-bottom: 16px;
    }

    .logo {
      width: 150px;
      height: 150px;
    }

    .app-name {
      font-size: 36px;
      font-weight: 600;
      color: #1a252f;
      margin-bottom: 40px;
      letter-spacing: -0.5px;
    }

    .status-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #e0e0e0;
      border-top-color: #3498db;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .status-text {
      font-size: 16px;
      color: #7f8c8d;
      font-weight: 400;
    }

    .loading-dots::after {
      content: '';
      animation: dots 1.5s steps(4, end) infinite;
    }

    @keyframes dots {
      0%, 20% { content: ''; }
      40% { content: '.'; }
      60% { content: '..'; }
      80%, 100% { content: '...'; }
    }

    .error-container {
      display: none;
      background: #fee;
      border: 1px solid #fcc;
      border-radius: 8px;
      padding: 16px;
      margin-top: 30px;
      max-width: 400px;
    }

    .error-container.visible {
      display: block;
    }

    .error-title {
      font-size: 14px;
      font-weight: 600;
      color: #c33;
      margin-bottom: 8px;
    }

    .error-message {
      font-size: 12px;
      color: #666;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="splash-container">
    <div class="logo-container">
      <img class="logo" src="${iconBase64}" alt="Pinguin Logo" />
    </div>
    
    <div class="app-name">Pinguin</div>
    
    <div class="status-container">
      <div class="spinner"></div>
      <div class="status-text">
        <span id="status-text">Initializing<span class="loading-dots"></span></span>
      </div>
    </div>

    <div class="error-container" id="error-container">
      <div class="error-title">Startup Error</div>
      <div class="error-message" id="error-message"></div>
    </div>
  </div>

  <script>
    // Listen for startup progress updates
    if (window.electronAPI && window.electronAPI.onStartupProgress) {
      window.electronAPI.onStartupProgress((progress) => {
        updateProgress(progress);
      });
    }

    function updateProgress(progress) {
      const statusText = document.getElementById('status-text');
      const errorContainer = document.getElementById('error-container');
      const errorMessage = document.getElementById('error-message');

      // Update status message
      if (statusText) {
        if (progress.status === 'error') {
          statusText.innerHTML = 'Startup Failed';
        } else {
          statusText.innerHTML = progress.message + '<span class="loading-dots"></span>';
        }
      }

      // Show error if present
      if (progress.error && errorContainer && errorMessage) {
        errorMessage.textContent = progress.error;
        errorContainer.classList.add('visible');
      }
    }

    // Simulate initial progress for testing
    let simulatedProgress = 0;
    const simulateInterval = setInterval(() => {
      if (simulatedProgress < 10) {
        simulatedProgress += 1;
        updateProgress({
          status: 'initializing',
          message: 'Initializing',
          progress: simulatedProgress,
        });
      } else {
        clearInterval(simulateInterval);
      }
    }, 100);
  </script>
</body>
</html>
    `;
  }
}

export default SplashWindow;
