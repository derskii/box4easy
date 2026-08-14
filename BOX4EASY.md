# Box4Easy v1.0 RC1

Box4Easy is a root transparent-proxy layer for Magisk/KernelSU/APatch with a Material You WebUI. The normal flow is sing-box-first and does not depend on the old Clash/Mihomo node page.

## What changed after the alpha

The alpha was not safe enough: importing could trigger core/network changes too early, the WebUI could wait on long downloads, and the node list depended on Clash API. RC1 replaces that flow.

- Subscription import is transactional: download and parse first; TPROXY is touched only after a supported payload exists and the generated core config validates.
- A failed core start triggers a fail-safe that stops TPROXY, so Wi-Fi/mobile traffic is not intentionally left pointed at a dead listener.
- Nodes and latency tests come from Box4Easy state, not the legacy Clash page.
- WebUI is Russian Material You: Home, Servers, Routing, Apps, Settings.
- `sing-box` and Xray are installed directly from their official release repositories. V2Ray is installed independently as well. Mihomo is only the legacy Clash/YAML fallback.

## Subscription formats

- VLESS, VMess, Trojan, Hysteria2/Hy2, Shadowsocks and SOCKS URIs.
- Plain and Base64 URI subscriptions.
- sing-box JSON, including `outbounds`.
- Xray/V2Ray JSON, including `outbounds`.
- JSON arrays/wrappers containing proxy objects or URI strings.
- Clash/Mihomo YAML only when Mihomo is explicitly selected.
- Happ-compatible routing metadata: `routing` header and `happ://routing/add/...`, `happ://routing/onadd/...`, `happ://routing/off` in subscription bodies.
- Common subscription metadata such as profile title, traffic/expiry info, announcement, support URL, update interval and ping-on-open hints.

Format negotiation tries Happ/sing-box/V2Ray-style User-Agents before the legacy Clash fallback. For providers that require device metadata, Box4Easy may send the device's real stable Android ID/model/OS as compatibility headers. It does not randomize or rotate identity to evade provider device limits.

## Servers and latency

The Servers tab is independent of Clash API. Every imported node is visible in its subscription group. The UI can test one server or all servers using a short TCP-connect latency probe and select a concrete node for the active core.

## Cores

- **sing-box** — default and recommended; JSON, Hysteria2, selector/urltest and multi-hop `detour`.
- **Xray** — VLESS/VMess/Trojan/Shadowsocks/SOCKS, Reality and Xray JSON; chains use `proxySettings`.
- **V2Ray** — V2Fly compatibility for common Xray-style generated configs.
- **Mihomo** — legacy Clash/YAML compatibility only.

Unsupported nodes are shown but disabled for the selected core instead of silently disappearing.

## Root networking

The default transparent mode is TPROXY on port 1536, with DNS interception configurable separately. REDIRECT remains available as a fallback. Box4Easy does not need Android `VpnService` for the normal root flow.

The queued service launcher starts the core before applying TPROXY and performs a second health check after startup. If the core dies immediately, it removes TPROXY and stops the service.

## Multi-hop

The Routing tab can create `device -> A -> B -> Internet`, including nodes from different subscriptions. sing-box uses `detour`; Xray/V2Ray use `proxySettings`.

## Validation

Local development checks for RC1:

- `go test ./...`
- `go vet ./...`
- static cross-build for arm64, armv7, x86_64 and x86
- strict TypeScript check for the rewritten Material You UI

GitHub Actions additionally builds the real WebUI/module and verifies the flashable ZIP contents. RC1 still requires a rooted-device smoke test before promotion to stable v1.0.0.
