import Vue from 'vue';
import Popup from './vue-templates/Popup.vue';

document.addEventListener('DOMContentLoaded', () => {
    new Vue({
        el: '#app',
        render: c => c(Popup)
    })
})
