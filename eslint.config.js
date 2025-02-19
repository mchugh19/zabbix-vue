import globals from "globals";
import pluginJs from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import vuetify from 'eslint-plugin-vuetify'

/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.{js,mjs,cjs,vue}"]},
  {languageOptions: { globals: {...globals.browser, ...globals.node} }},
  pluginJs.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  ...vuetify.configs['flat/base'],
  {
    rules: {
        'vue/multi-word-component-names': 'off',
        'vue/no-deprecated-v-bind-sync': 'off',
    }
  }
];
