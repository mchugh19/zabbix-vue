<template>
    <div class="popup">
        <div id="menu">
            <!-- <input type="search" id="filter" placeholder="Filter Results"> -->
        </div>
        <div id="triggerTable">
            <table>
                <thead>
                    <tr>
                        <td v-for="item, key in triggerTableData[0]">
                            {{ key | capitalize }}
                        </td>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="triggerItem in triggerTableData" >
                        <td v-for="item in triggerItem" :class="triggerItem['priority'] | priority_class">
                            {{ item | priority_name_filter | date_filter }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script>
var browser = browser || chrome;
var triggerTable = [];

function requestTableRefresh(groupids) {
    browser.runtime.sendMessage({
        method: 'refreshTriggers',
        data: groupids}, function(response) {
            //console.log('Requested trigger refresh for ' + JSON.stringify(groupids));
            //console.log('got response: ' + JSON.stringify(response));
            var activeTriggers = response;
            var newTable = [];
            triggerTable.splice(0, triggerTable.length)

            for(var i = 0; i < activeTriggers.length; i++) {
                var system = activeTriggers[i]['hosts'][0]['host'];
                var description = activeTriggers[i]['description']
                var priority = Number(activeTriggers[i]['priority'])
                var age = Number(activeTriggers[i]['lastchange'])
                newTable.push({'system': system,
                        'description': description,
                        'priority': priority,
                        'age': age})
            }
            triggerTable.push.apply(triggerTable, newTable);
            console.log('triggerTable is now: ' + JSON.stringify(triggerTable));
    })
}


document.addEventListener('DOMContentLoaded', function () {
    requestTableRefresh();
});

export default {
    data () {
        return {
            'triggerTableData': triggerTable
        }
    },
    filters: {
        capitalize: function (value) {
            if (!value) return '';
            value = value.toString();
            return value.charAt(0).toUpperCase() + value.slice(1);
        },
        priority_class: function(value) {
            var PRIORITIES = {
                0: 'notclassified',
                1: 'information',
                2: 'warning',
                3: 'average',
                4: 'high',
                5: 'disaster',
                9: 'normal'
            }
            return PRIORITIES[value];
        },
        priority_name_filter: function(value) {
            if (typeof value == "number" && value < 10) {
                var PRIORITY_NAMES = {
                    0: 'Not Classified',
                    1: 'Information',
                    2: 'Warning',
                    3: 'Average',
                    4: 'High',
                    5: 'Disaster',
                    9: 'Normal'
                }
                return PRIORITY_NAMES[value];
            } else {
                return value;
            }
        },
        date_filter: function(value) {
            if (typeof value == "number" && value > 10000) {
                var curtime = new Date().getTime();
                var diff = curtime - (value * 1000);

                var seconds = parseInt(diff / 1000);
                var minutes = parseInt(seconds / 60);
                var hours = parseInt(minutes / 60);
                var days = parseInt(hours / 24);

                var result = '';
                if (days > 0) {
                    result += days + 'd, ';
                }
                if (hours > 0) {
                    result += (hours % 24) + 'h, ';
                }
                result += (minutes % 60) + 'm';

                return result;
            } else {
                return value;
            }
        }
    },
    methods: {
        updateTriggerData: function(newTriggers) {
            this.triggers = newTriggers;
        }
    }
}
</script>
