'use strict';

import Vue from 'vue';
import Vuetify from 'vuetify'
import Options from './vue-templates/Options.vue';
require('material-design-icons-iconfont/dist/fonts/material-icons.css')

Vue.use(Vuetify)

document.addEventListener('DOMContentLoaded', () => {
    new Vue({
        el: '#app',
        render: c => c(Options)
    })
})
