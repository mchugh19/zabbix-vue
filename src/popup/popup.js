import { createApp } from 'vue';
import popup from "./popup.vue";
import { initI18n, t } from '../lib/i18n.js';
import "vuetify/styles";
import { createVuetify } from 'vuetify';
import {
  VAlert,
  VApp,
  VBtn,
  VCard, VCardTitle,
  VCol, VContainer, VRow, VSpacer,
  VDataTable,
  VFooter,
  VIcon,
  VMain,
  VSheet,
  VTextField,
  VToolbar, VToolbarTitle,
} from 'vuetify/components';
import { mdi } from 'vuetify/iconsets/mdi-svg'
import { customAliases } from '../vuetify-icons'


const vuetify = createVuetify({
  components: {
    VAlert,
    VApp,
    VBtn,
    VCard, VCardTitle,
    VCol, VContainer, VRow, VSpacer,
    VDataTable,
    VFooter,
    VIcon,
    VMain,
    VSheet,
    VTextField,
    VToolbar, VToolbarTitle,
  },
  icons: {
    defaultSet: 'mdi',
    aliases: customAliases,
    sets: {
      mdi,
    },
  },
});

// Load the user's language preference before rendering so every $i18n()
// call in the component resolves against the selected locale.
await initI18n();

// Create Vue application
const app = createApp(popup);

// Use Vuetify; $i18n is our runtime lookup (honors the language preference),
// replacing the vue-plugin-webextension-i18n binding to chrome.i18n.
app.use(vuetify);
app.config.globalProperties.$i18n = t;

// Mount the app
app.mount("body");
