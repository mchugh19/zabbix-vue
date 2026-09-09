import { createApp } from 'vue';
import options from "./options.vue";
import i18n from "vue-plugin-webextension-i18n";
import { createVuetify } from 'vuetify';
import { mdi } from 'vuetify/iconsets/mdi-svg'
import { customAliases } from '../vuetify-icons'


const  vuetify = createVuetify({
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
