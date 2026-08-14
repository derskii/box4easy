#!/bin/sh
set -eu
cd "$(dirname "$0")"
: > main.go
for part in source/main.go.part.* source/v1/*.part; do
  cat "$part" >> main.go
  printf '\n' >> main.go
done
# 1.0 parser: keep the legacy parser as fallback, but route subscription calls
# through the broader JSON/Happ-compatible parser.
sed -i 's/parseJSONSubscription(decodedBody, id)/parseJSONSubscriptionV1(decodedBody, id)/g' main.go
sed -i 's/parseJSONSubscription(d2, id)/parseJSONSubscriptionV1(d2, id)/g' main.go
# Prefer a Happ/sing-box style response from panels; this is format negotiation,
# not entitlement/device identity spoofing.
sed -i 's/sing-box Box4Easy\/0.2/Happ\/1.0 (sing-box; Box4Easy)/g' main.go
sed -i 's/v2rayNG\/1.10 Box4Easy\/0.2/v2rayNG\/Box4Easy-1.0/g' main.go
sed -i 's/Clash.Meta\/1.19.8 Mihomo/Clash.Meta\/Box4Easy-1.0/g' main.go

# Legacy stringValue used fmt.Sprint(nil), which returns "<nil>". That made
# absent JSON fields look non-empty and could misclassify Xray JSON as sing-box.
python3 - <<'PY'
from pathlib import Path
p = Path('main.go')
s = p.read_text()
old = '''func stringValue(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}'''
new = '''func stringValue(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case json.Number:
		return x.String()
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(x), 'f', -1, 32)
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case int32:
		return strconv.FormatInt(int64(x), 10)
	case uint:
		return strconv.FormatUint(uint64(x), 10)
	case uint64:
		return strconv.FormatUint(x, 10)
	default:
		return fmt.Sprint(v)
	}
}'''
if old not in s:
    raise SystemExit('legacy stringValue function not found')
p.write_text(s.replace(old, new, 1))
PY

gofmt -w main.go
