import { createApp } from 'vue';
import options from "./options.vue";
import { initI18n, t } from '../lib/i18n.js';
import "vuetify/styles";
import { createVuetify } from 'vuetify';
import {
  VApp,
  VBtn,
  VCard, VCardTitle,
  VCheckbox,
  VCol, VContainer, VRow, VSpacer,
  VFooter,
  VForm,
  VIcon,
  VMain,
  VRadio, VRadioGroup,
  VSelect,
  VTextField,
  VToolbar, VToolbarTitle,
} from 'vuetify/components';
import { mdi } from 'vuetify/iconsets/mdi-svg'
import { customAliases } from '../vuetify-icons'


const vuetify = createVuetify({
  components: {
    VApp,
    VBtn,
    VCard, VCardTitle,
    VCheckbox,
    VCol, VContainer, VRow, VSpacer,
    VFooter,
    VForm,
    VIcon,
    VMain,
    VRadio, VRadioGroup,
    VSelect,
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
const app = createApp(options);

// Use Vuetify; $i18n is our runtime lookup (honors the language preference),
// replacing the vue-plugin-webextension-i18n binding to chrome.i18n.
app.use(vuetify);
app.config.globalProperties.$i18n = t;

// Mount the app
app.mount('body');
