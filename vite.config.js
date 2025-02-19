import { defineConfig } from "vite";
import { resolve } from 'path';
import vue from "@vitejs/plugin-vue";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";
import { renderSVG } from 'vite-plugin-render-svg'
import eslint from 'vite-plugin-eslint';

const target = process.env.TARGET || "chrome";


function generateManifest() {
  const manifestFile = readJsonFile("src/manifest.json");
  const pkg = readJsonFile("package.json");
  return {
    version: pkg.version,
    ...manifestFile,
  };
}


export default defineConfig({
  root: 'src',
  assetsInclude: ['*.mp3', '*.html'],
  build: {
    minify: false,
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
    renderSVG({
      pattern: 'images/*.svg',
      urlPrefix: 'images/',
      scales: [1],
      outputOriginal: false
    }),
  ],
  define: {
    __BROWSER__: JSON.stringify(target),
  },
});
