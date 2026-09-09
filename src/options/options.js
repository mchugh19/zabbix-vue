import { createApp } from 'vue';
import options from "./options.vue";
import i18n from "vue-plugin-webextension-i18n";
import "vuetify/styles";
import { createVuetify } from 'vuetify';
import { VApp } from 'vuetify/components/VApp'
import { VBtn } from 'vuetify/components/VBtn'
import { VCard, VCardTitle } from 'vuetify/components/VCard'
import { VCheckbox } from 'vuetify/components/VCheckbox'
import { VCol, VContainer, VRow, VSpacer } from 'vuetify/components/VGrid'
import { VFooter } from 'vuetify/components/VFooter'
import { VForm } from 'vuetify/components/VForm'
import { VIcon } from 'vuetify/components/VIcon'
import { VMain } from 'vuetify/components/VMain'
import { VRadio } from 'vuetify/components/VRadio'
import { VRadioGroup } from 'vuetify/components/VRadioGroup'
import { VSelect } from 'vuetify/components/VSelect'
import { VTextField } from 'vuetify/components/VTextField'
import { VToolbar, VToolbarTitle } from 'vuetify/components/VToolbar'
import { mdi } from 'vuetify/iconsets/mdi-svg'
import { customAliases } from '../vuetify-icons'


const vuetify = createVuetify({
  components: {
    VApp, VBtn, VCard, VCardTitle, VCheckbox,
    VCol, VContainer, VRow, VSpacer,
    VFooter, VForm, VIcon, VMain,
    VRadio, VRadioGroup, VSelect,
    VTextField, VToolbar, VToolbarTitle,
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
const app = createApp(options);

// Use Vuetify and i18n plugins
app.use(vuetify);
app.use(i18n);

// Mount the app
app.mount('body');
