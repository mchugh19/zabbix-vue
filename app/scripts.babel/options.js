'use strict';

import Vue from 'vue';
import i18n from 'vue-plugin-webextension-i18n';
import Vuetify from 'vuetify';
import Options from './vue-templates/Options.vue';
require('material-design-icons-iconfont/dist/fonts/material-icons.css');

Vue.use(Vuetify);
Vue.use(i18n);

document.addEventListener('DOMContentLoaded', () => {
    new Vue({
        el: '#app',
        render: c => c(Options)
    })
})
