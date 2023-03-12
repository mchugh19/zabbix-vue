import "vuetify/dist/vuetify.min.css";
import "material-design-icons-iconfont/dist/material-design-icons.css"; // md
import Vue from "vue";
import Vuetify from "vuetify";
import Popup from "./App.vue";
import i18n from "vue-plugin-webextension-i18n";

Vue.use(i18n);
Vue.use(Vuetify);

const vuetifyOpts = {
  icons: {
    iconfont: "md",
  },
};

new Vue({
  vuetify: new Vuetify(vuetifyOpts),
  el: "#app",
  render: (c) => c(Popup),
});
