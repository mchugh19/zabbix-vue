import Vue from 'vue';
import Vuetify from 'vuetify'
import Popup from './vue-templates/Popup.vue';

require('material-design-icons-iconfont/dist/fonts/material-icons.css')


document.addEventListener('DOMContentLoaded', () => {
    new Vue({
        el: '#app',
        render: c => c(Popup)
    })
    Vue.use(Vuetify)
})
