import Vue from 'vue';
import Vuetify from 'vuetify'
import Popup from './vue-templates/Popup.vue';
import i18n from 'vue-plugin-webextension-i18n';
require('material-design-icons-iconfont/dist/fonts/material-icons.css')


document.addEventListener('DOMContentLoaded', () => {
    Vue.use(Vuetify)
    Vue.use(i18n);

    new Vue({
        el: '#app',
        render: c => c(Popup)
    })
})
