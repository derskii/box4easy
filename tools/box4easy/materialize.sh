#!/bin/sh
set -eu
cd "$(dirname "$0")"
cat source/main.go.part.* source/v1/*.part > main.go
# 1.0 parser: keep the legacy parser as fallback, but route subscription calls
# through the broader JSON/Happ-compatible parser.
sed -i 's/parseJSONSubscription(decodedBody, id)/parseJSONSubscriptionV1(decodedBody, id)/g' main.go
sed -i 's/parseJSONSubscription(d2, id)/parseJSONSubscriptionV1(d2, id)/g' main.go
# Prefer a Happ/sing-box style response from panels; this is format negotiation,
# not entitlement/device identity spoofing.
sed -i 's/sing-box Box4Easy\/0.2/Happ\/1.0 (sing-box; Box4Easy)/g' main.go
sed -i 's/v2rayNG\/1.10 Box4Easy\/0.2/v2rayNG\/Box4Easy-1.0/g' main.go
sed -i 's/Clash.Meta\/1.19.8 Mihomo/Clash.Meta\/Box4Easy-1.0/g' main.go
gofmt -w main.go
