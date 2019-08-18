# Zabbix Vue
A browser extension to display problems from a Zabbix monitoring server. The browser icon's color is updated with the severity and number of detected problems.

Firefox: [https://addons.mozilla.org/en-US/firefox/addon/zabbix-vue/](https://addons.mozilla.org/en-US/firefox/addon/zabbix-vue/)

Chrome: [https://chrome.google.com/webstore/detail/goinajfhamfchlmkddedkncmlgfcieac/](https://chrome.google.com/webstore/detail/goinajfhamfchlmkddedkncmlgfcieac/)



## Features
Badge display with popup showing current issues along with maintenance and acknowledgement icons<br>
<img width="803" alt="badge and popup" src="https://user-images.githubusercontent.com/1360357/37271220-d75a6580-25c9-11e8-8dc0-0ffdf4a10a17.png">

Clicking a problem displays a row of actions<br>
<img width="803" alt="popup with buttons" src="https://user-images.githubusercontent.com/1360357/37271229-dd188876-25c9-11e8-8917-1ee0b9094d99.png">

Filter input allows for quick filtering of results. Both system and description fields are searchable<br>
<img width="802" alt="filtered popup" src="https://user-images.githubusercontent.com/1360357/37271618-7a53580e-25cb-11e8-8280-d1efd22c9524.png">

Popup table also reorders from clicking on headers<br>
<img width="801" alt="sorted age popup" src="https://user-images.githubusercontent.com/1360357/37271650-a58b2e48-25cb-11e8-8a52-212b97445439.png">

Browser notifications display the system and newly detected problem<br>
<img width="351" alt="notification" src="https://user-images.githubusercontent.com/1360357/37272605-09fc40e4-25cf-11e8-99d9-5bd970b2e809.png">


Options screen displays many settings including the ability to only show problems for certain host groups<br>
<img width="393" alt="options hostgroup" src="https://user-images.githubusercontent.com/1360357/37271231-e011c646-25c9-11e8-9436-9b728afe3438.png">


## Build
`npm install`
`gulp clean && gulp build && gulp package`

Then test package/*.zip in Firefox Developer Edition or load the dist/ directory in Chrome.

## Attribution
Includes notification from freesound.org:
["Drip Echo"](https://freesound.org/people/SpiceProgram/sounds/399191/) by [SpiceProgram](https://spiceprogram.org/)