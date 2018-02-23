'use strict';

import Vue from 'vue';
import VeeValidate from 'vee-validate';
import Options from './vue-templates/Options.vue';

Vue.use(VeeValidate);

document.addEventListener('DOMContentLoaded', () => {
    new Vue({
        el: '#app',
        render: c => c(Options)
    })
})
