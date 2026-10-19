import { defineConfig } from "vite";
import { resolve } from 'path';
import vue from "@vitejs/plugin-vue";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";
import eslint from 'vite-plugin-eslint2';

const target = process.env.TARGET || "chrome";


function generateManifest() {
  const manifestFile = readJsonFile("src/manifest.json");
  const pkg = readJsonFile("package.json");
  const manifest = {
    version: pkg.version,
    ...manifestFile,
  };
  if (process.env.DEV) {
    // Debug build: own name and gecko id so it can be loaded next to the
    // released extension instead of replacing it
    manifest.name = "Zabbix-Vue (dev)";
    manifest["{{firefox}}.browser_specific_settings"] = {
      ...manifest["{{firefox}}.browser_specific_settings"],
      gecko: {
        ...manifest["{{firefox}}.browser_specific_settings"].gecko,
        id: "zabbix-vue-dev@localhost",
      },
    };
  }
  return manifest;
}


export default defineConfig({
  root: 'src',
  assetsInclude: ['*.mp3', '*.html'],
  build: {
    minify: true,
    target: target === 'firefox' ? 'firefox109' : 'chrome110',
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [
    vue(),
    eslint(),
    webExtension({
      manifest: generateManifest,
      watchFilePaths: ["package.json", "manifest.json"],
      browser: process.env.TARGET || "chrome",
    }),
  ],
  define: {
    __BROWSER__: JSON.stringify(target),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
});
