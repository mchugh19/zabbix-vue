import { createApp } from 'vue';
import popup from "./popup.vue";
import i18n from "vue-plugin-webextension-i18n";
import "vuetify/styles";
import { createVuetify } from 'vuetify';
import {
  VAlert,
  VApp,
  VBtn,
  VCard,
  VCardTitle,
  VCheckbox,
  VCol,
  VContainer,
  VDataTable,
  VFooter,
  VForm,
  VIcon,
  VMain,
  VRadio,
  VRadioGroup,
  VRow,
  VSelect,
  VSheet,
  VSpacer,
  VTextField,
  VToolbar,
  VToolbarTitle,
} from 'vuetify/components'
import { Ripple, Resize } from 'vuetify/directives'
import { mdi } from 'vuetify/iconsets/mdi-svg'
import { customAliases } from '../vuetify-icons'


const  vuetify = createVuetify({
  components: {
    VAlert, VApp, VBtn, VCard, VCardTitle, VCheckbox, VCol,
    VContainer, VDataTable, VFooter, VForm, VIcon, VMain,
    VRadio, VRadioGroup, VRow, VSelect, VSheet, VSpacer,
    VTextField, VToolbar, VToolbarTitle,
  },
  directives: { Ripple, Resize },
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
