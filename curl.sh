#!/bin/bash

json="{\"jsonrpc\":\"2.0\",\"method\":\"user.login\",\"id\":1,\"params\":{\"user\":\"Admin\",\"password\":\"zabbix\"}}"
auth=$(curl -X POST -H 'Content-Type: application/json-rpc' -d "$json" http://localhost:9080/zabbix/api_jsonrpc.php | jq .result)

json="{
    \"jsonrpc\": \"2.0\",
    \"method\": \"trigger.get\",
    \"params\": {
        \"output\": \"extend\",
                \"expandDescription\": 1,
                \"selectHosts\": \"extend\",
                \"filter\": {
                    \"value\": 1,
                    \"status\": 0
                },
                \"sortfield\": \"priority\",
                \"sortorder\": \"DESC\"
    },
    \"id\": 2,
    \"auth\": $auth
}"
                #\"groupids\": [\"2\"],
                #\"selectTriggers\": \"extend\",
                #\"selectGroups\": \"extend\",
                #\"withLastEventUnacknowledged\": 1,

echo ""
curl -X POST -H 'Content-Type: application/json-rpc' -d "$json" http://localhost:9080/zabbix/api_jsonrpc.php 
echo ""
