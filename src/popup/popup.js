import { createApp } from 'vue';
import popup from "./popup.vue";
import i18n from "vue-plugin-webextension-i18n";
import "vuetify/styles";
import { createVuetify } from 'vuetify';
import { VAlert } from 'vuetify/components/VAlert'
import { VApp } from 'vuetify/components/VApp'
import { VBtn } from 'vuetify/components/VBtn'
import { VCard } from 'vuetify/components/VCard'
import { VCol, VContainer, VRow } from 'vuetify/components/VGrid'
import { VDataTable } from 'vuetify/components/VDataTable'
import { VIcon } from 'vuetify/components/VIcon'
import { VSheet } from 'vuetify/components/VSheet'
import { VTextField } from 'vuetify/components/VTextField'
import { mdi } from 'vuetify/iconsets/mdi-svg'
import { customAliases } from '../vuetify-icons'


const vuetify = createVuetify({
  components: {
    VAlert, VApp, VBtn, VCard,
    VCol, VContainer, VRow,
    VDataTable, VIcon, VSheet, VTextField,
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
