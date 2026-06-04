#!/usr/bin/env bash
# Test the deployed Alexa Skill Edge Function.
# Requires SKIP_SIGNATURE_VERIFICATION=true in Supabase secrets.
#
# Usage (variable must be exported to the subprocess — not just assigned):
#
#   # Option 1: inline (one-shot, recommended)
#   ALEXA_SKILL_ID=amzn1.ask.skill.xxxx ./scripts/test-alexa-skill.sh
#
#   # Option 2: export first
#   export ALEXA_SKILL_ID=amzn1.ask.skill.xxxx
#   ./scripts/test-alexa-skill.sh
#
#   # Option 3: .env.local (gitignored) — add: export ALEXA_SKILL_ID=...
#   source .env.local && ./scripts/test-alexa-skill.sh

set -euo pipefail

ENDPOINT="${ALEXA_ENDPOINT:-https://fjtgddxoumiszriqmpux.supabase.co/functions/v1/alexa-skill}"
SKILL_ID="${ALEXA_SKILL_ID:?Error: ALEXA_SKILL_ID is not set. Export it before running this script.}"

CERT_URL="https://s3.amazonaws.com/echo.api/echo-api-cert-11.pem"
SIG="dGVzdA=="

run_test() {
  local label="$1"
  local intent="$2"
  local slot_name="$3"
  local slot_value="$4"

  local TS
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local body
  if [[ "$intent" == "LaunchRequest" ]]; then
    body=$(jq -nc \
      --arg skillId "$SKILL_ID" \
      --arg ts "$TS" \
      '{version:"1.0",session:{sessionId:"test",application:{applicationId:$skillId},attributes:{},user:{userId:"test"},new:true},request:{type:"LaunchRequest",requestId:"test",timestamp:$ts,locale:"ja-JP"}}')
  else
    body=$(jq -nc \
      --arg skillId "$SKILL_ID" \
      --arg ts "$TS" \
      --arg intent "$intent" \
      --arg slotName "$slot_name" \
      --arg slotVal "$slot_value" \
      '{version:"1.0",session:{sessionId:"test",application:{applicationId:$skillId},attributes:{},user:{userId:"test"},new:true},request:{type:"IntentRequest",requestId:"test",timestamp:$ts,locale:"ja-JP",intent:{name:$intent,confirmationStatus:"NONE",slots:{($slotName):{name:$slotName,value:$slotVal,confirmationStatus:"NONE"}}}}}')
  fi

  printf "%-42s " "[$label]"
  local result
  result=$(curl -s -w "\n%{http_code} %{time_total}" \
    -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "SignatureCertChainUrl: $CERT_URL" \
    -H "Signature: $SIG" \
    -d "$body")

  local body_part status_time
  body_part=$(echo "$result" | head -n -1)
  status_time=$(echo "$result" | tail -n1)
  local status time_s
  status=$(echo "$status_time" | awk '{print $1}')
  time_s=$(echo "$status_time" | awk '{print $2}')

  local speech
  speech=$(echo "$body_part" | jq -r '.response.outputSpeech.text // .error // .' 2>/dev/null || echo "$body_part")

  printf "HTTP %-3s | %ss | %s\n" "$status" "$time_s" "$speech"
}

echo "=== Alexa Skill Edge Function Test ==="
echo "Endpoint : $ENDPOINT"
echo ""

run_test "LaunchRequest"           "LaunchRequest"        ""               ""
run_test "CheckInventory: 牛乳"    "CheckInventoryIntent" "ItemQuery"      "牛乳"
run_test "CheckInventory: もずく"  "CheckInventoryIntent" "ItemQuery"      "もずく"
run_test "CheckInventory: 醤油"    "CheckInventoryIntent" "ItemQuery"      "醤油"
run_test "CheckExpiry: 牛乳"       "CheckExpiryIntent"    "ItemQuery"      "牛乳"
run_test "CheckRemaining: 牛乳"    "CheckRemainingIntent" "ItemQuery"      "牛乳"
run_test "ListByLocation: 冷蔵庫"  "ListByLocationIntent" "LocationQuery"  "冷蔵庫"

echo ""
echo "Done. Alexa's hard limit is 8s — any Gemini path should complete within 7s."
