import "material-design-icons-iconfont/dist/material-design-icons.css"; // md
import { createApp } from 'vue';
import Options from "./options.vue";
import i18n from "vue-plugin-webextension-i18n";
import "vuetify/styles";
import { createVuetify } from 'vuetify';

const  vuetify = createVuetify({
  icons: {
    iconfont: "md",
  },
});

// Create Vue application
const app = createApp(Options);

// Use Vuetify and i18n plugins
app.use(vuetify);
app.use(i18n);

// Mount the app
app.mount('#app');