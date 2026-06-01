/**
 * Custom Vuetify icon aliases — only the icons actually used by
 * components in this extension (v-data-table, v-checkbox, v-select,
 * v-radio, v-text-field, v-alert).
 *
 * Replaces the default `aliases` from 'vuetify/iconsets/mdi-svg' which
 * imports all ~7,000 MDI icons (~1.6 MB combined JS+CSS).
 */
import {
  mdiCheckboxMarked,
  mdiCheckboxBlankOutline,
  mdiMinusBox,
  mdiMenuDown,
  mdiRadioboxMarked,
  mdiRadioboxBlank,
  mdiArrowUp,
  mdiArrowDown,
  mdiClose,
  mdiChevronDown,
  mdiChevronUp,
  mdiCheckCircle,
  mdiInformation,
  mdiAlert,
  mdiAlertCircle,
  mdiMenuRight,
  mdiLoading,
  mdiCloseCircle,
} from '@mdi/js';

export const customAliases = {
  checkboxOn: mdiCheckboxMarked,
  checkboxOff: mdiCheckboxBlankOutline,
  checkboxIndeterminate: mdiMinusBox,
  dropdown: mdiMenuDown,
  radioOn: mdiRadioboxMarked,
  radioOff: mdiRadioboxBlank,
  sortAsc: mdiArrowUp,
  sortDesc: mdiArrowDown,
  clear: mdiCloseCircle,
  close: mdiClose,
  expand: mdiChevronDown,
  collapse: mdiChevronUp,
  success: mdiCheckCircle,
  info: mdiInformation,
  warning: mdiAlert,
  error: mdiAlertCircle,
  menu: mdiMenuRight,
  subgroup: mdiMenuDown,
  loading: mdiLoading,
};
