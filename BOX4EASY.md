# Box4Easy v0.2 alpha

Box4Easy is a simplified WebUI and profile layer on top of Box4Magisk/Box4KernelSU.

## Main flow

1. Pick a core. `sing-box` is the default and recommended option.
2. Paste a subscription URL or one/more server URIs.
3. Press **Съесть и применить**.
4. Pick a subscription group/node, routing profile, or build a multi-hop chain.
5. Advanced Box4Magisk settings remain available in the existing tabs.

## Subscription formats

The helper currently recognizes:

- URI lists and base64 URI lists: VLESS, VMess, Trojan, Hysteria2, Shadowsocks, SOCKS.
- sing-box JSON profiles (`outbounds`).
- Xray/V2Ray JSON profiles (`outbounds`).
- Mihomo/Clash YAML as a legacy fallback.
- Happ `happ://routing/add/...` and `happ://routing/onadd/...` metadata in headers or subscription bodies.

The importer tries sing-box/V2Ray-style User-Agents before falling back to Clash YAML, because many panels change the returned format based on the client UA.

## Core selection

- **sing-box** — default. Supports generated selector/urltest groups, Clash API, Hysteria2 and multi-hop `detour` chains.
- **Xray** — VLESS/VMess/Trojan/Shadowsocks/SOCKS and native Xray JSON outbounds. Chains use `proxySettings`.
- **V2Ray** — uses the V2Fly core and Xray-compatible generated JSON for common protocols. The helper can install the latest Android V2Ray release if missing.
- **Mihomo** — retained for Clash/YAML subscriptions and compatibility. It is not the primary Easy Mode path.

A subscription can contain nodes that are only compatible with one core. The UI filters chain choices by the active core; unsupported nodes are skipped by the generator.

## Multi-hop chains

The Easy tab can build:

`device -> A -> B -> Internet`

where A and B may come from different subscriptions. For sing-box, hop B gets `detour: A`. For Xray/V2Ray, hop B gets `proxySettings.tag = A`.

## Source layout

`tools/box4easy/source/main.go.part.*` contains the helper source in transport-friendly chunks. `tools/box4easy/materialize.sh` concatenates them into the ignored generated `main.go` before tests/builds. CI then runs `go test`, `go vet` and cross-builds static helpers for arm64, armv7, x86_64 and x86.

## Safety / entitlement boundary

Box4Easy does not spoof or rotate provider HWID/device identifiers to evade device limits or unlock paid entitlements. Compatibility metadata such as User-Agent can be varied for format negotiation, but not to bypass subscription authorization.

## Validation

- Local `go test ./...` passes.
- Local `go vet ./...` passes.
- Helper cross-build succeeds for arm64, armv7, x86_64 and x86.
- Tests cover common URI parsing, base64 subscriptions, Happ routing, sing-box JSON import, sing-box config generation and a two-hop detour chain.

A rooted Android smoke test is still required before calling this stable: startup, TPROXY/DNS behavior, core-specific config validation and real provider responses need on-device testing.
