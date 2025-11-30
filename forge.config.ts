import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";
import path from "path";
import "dotenv/config";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: "Pinguin",
    icon: path.join(process.cwd(), "public", "icon"),
    // Architecture can be set via CLI: --arch=x64,arm64
    // Or will default to host architecture
    extraResource: [
      path.join(process.cwd(), "public", "icon.png"),
      "./extraResources/ollama",
      "./extraResources/tesseract",
      "./extraResources/poppler",
      "./backend",
    ],
    // Removed custom ignore - webpack plugin handles this automatically
    // Backend files are already in extraResource, so they'll be packaged separately
  },
  rebuildConfig: {},
  makers: [
    // Windows-only build - Squirrel installer for both x64 and ARM64
    new MakerSquirrel({
      setupIcon: path.join(process.cwd(), "public", "icon.ico"),
      authors: "Kehn Marv",
      description: "Pinguin - Offline AI Assistant for Students",
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./src/renderer/index.html",
            js: "./src/renderer/renderer.ts",
            name: "main_window",
            preload: {
              js: "./src/renderer/preload.ts",
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "Kehn-Marv",
          name: "Pinguin",
          token: process.env.GITHUB_TOKEN,
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
};

export default config;
