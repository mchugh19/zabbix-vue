import { createApp } from 'vue';
import popup from "./popup.vue";
import i18n from "vue-plugin-webextension-i18n";
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

// Create Vue application
const app = createApp(popup);

// Use Vuetify and i18n plugins
app.use(vuetify);
app.use(i18n);

// Mount the app
app.mount("body");
