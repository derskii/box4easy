package main

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseCommonProxyURIs(t *testing.T) {
	cases := []struct {
		name string
		uri  string
		typ  string
	}{
		{"vless", "vless://11111111-1111-1111-1111-111111111111@example.com:443?encryption=none&security=tls&sni=example.com&type=ws&path=%2Fws#VLESS", "vless"},
		{"trojan", "trojan://secret@example.com:443?sni=example.com#Trojan", "trojan"},
		{"hy2", "hysteria2://password@example.com:443?sni=example.com#HY2", "hysteria2"},
		{"socks", "socks5://user:pass@example.com:1080#Socks", "socks5"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, err := parseProxyURI(tc.uri)
			if err != nil { t.Fatal(err) }
			if got := stringValue(p["type"]); got != tc.typ { t.Fatalf("type=%q want %q", got, tc.typ) }
			if stringValue(p["name"]) == "" { t.Fatal("empty name") }
		})
	}
}

func TestParseVMess(t *testing.T) {
	raw, _ := json.Marshal(map[string]interface{}{"v":"2","ps":"VM","add":"example.com","port":"443","id":"11111111-1111-1111-1111-111111111111","aid":"0","net":"ws","path":"/ws","host":"cdn.example.com","tls":"tls","sni":"example.com"})
	p, err := parseProxyURI("vmess://" + base64.RawStdEncoding.EncodeToString(raw))
	if err != nil { t.Fatal(err) }
	if stringValue(p["type"]) != "vmess" || stringValue(p["name"]) != "VM" { t.Fatalf("unexpected proxy: %#v", p) }
}

func TestParseShadowsocks(t *testing.T) {
	auth := base64.RawURLEncoding.EncodeToString([]byte("aes-128-gcm:secret"))
	p, err := parseProxyURI("ss://" + auth + "@example.com:8388#SS")
	if err != nil { t.Fatal(err) }
	if stringValue(p["cipher"]) != "aes-128-gcm" { t.Fatalf("unexpected cipher: %#v", p) }
}

func TestNormalizeBase64Subscription(t *testing.T) {
	body := "vless://11111111-1111-1111-1111-111111111111@example.com:443?security=tls#A\n" + "trojan://secret@example.com:443#B\n"
	_, links, count := normalizeSubscriptionBody([]byte(base64.StdEncoding.EncodeToString([]byte(body))))
	if count != 2 || len(links) != 2 { t.Fatalf("count=%d links=%v", count, links) }
}

func TestParseHappRouting(t *testing.T) {
	raw := []byte(`{"Name":"RU split","GlobalProxy":true,"RouteOrder":"block-proxy-direct","DirectSites":["geosite:ru","+.local"],"ProxySites":["geosite:geolocation-!ru"],"BlockSites":["ads.example"]}`)
	r := parseRoutingLink("happ://routing/onadd/" + base64.RawURLEncoding.EncodeToString(raw))
	if r == nil || r.Name != "RU split" || !r.AutoEnable { t.Fatalf("unexpected routing: %#v", r) }
	var b strings.Builder
	appendRules(&b, State{Mode:"routing", ActiveRouting:r.ID, Routings:[]RoutingEntry{*r}})
	out := b.String()
	for _, want := range []string{"GEOSITE,ru,DIRECT","GEOSITE,geolocation-!ru,PROXY","DOMAIN-SUFFIX,ads.example,REJECT","MATCH,PROXY"} {
		if !strings.Contains(out, want) { t.Fatalf("missing %q in:\n%s", want, out) }
	}
}

func TestRebuildMihomoInTempRoot(t *testing.T) {
	root := t.TempDir(); _ = os.Setenv("BOX4EASY_BOX_ROOT", root); t.Cleanup(func(){ _ = os.Unsetenv("BOX4EASY_BOX_ROOT") })
	if err := os.MkdirAll(filepath.Join(root,"scripts"),0755); err != nil { t.Fatal(err) }
	if err := os.WriteFile(filepath.Join(root,"scripts","box.config"), []byte("clash_api_port=9099\nclash_api_secret='x'\n"),0644); err != nil { t.Fatal(err) }
	dir := filepath.Join(root,"easy"); if err := ensureDir(dir); err != nil { t.Fatal(err) }
	st := State{Version:2, EasyEnabled:true, Core:"mihomo", Mode:"global", Servers:[]ServerEntry{{ID:"srv",Name:"T",Proxy:map[string]interface{}{"name":"T","type":"trojan","server":"example.com","port":443,"password":"secret"}}}}
	if err := rebuildConfig(dir,st); err != nil { t.Fatal(err) }
	b, err := os.ReadFile(filepath.Join(root,"mihomo","config.yaml")); if err != nil { t.Fatal(err) }
	for _, want := range []string{"external-controller: 127.0.0.1:9099","secret: \"x\"","[Local] T","MATCH,PROXY"} { if !strings.Contains(string(b),want) { t.Fatalf("missing %q",want) } }
}

func TestSingBoxCoreAndChain(t *testing.T) {
	root := t.TempDir(); _ = os.Setenv("BOX4EASY_BOX_ROOT", root); t.Cleanup(func(){ _ = os.Unsetenv("BOX4EASY_BOX_ROOT") })
	if err := os.MkdirAll(filepath.Join(root,"scripts"),0755); err != nil { t.Fatal(err) }
	if err := os.WriteFile(filepath.Join(root,"scripts","box.config"), []byte("clash_api_port=9090\nclash_api_secret='s'\n"),0644); err != nil { t.Fatal(err) }
	dir := filepath.Join(root,"easy"); if err := ensureDir(dir); err != nil { t.Fatal(err) }
	a,_ := parseProxyURI("vless://11111111-1111-1111-1111-111111111111@a.example:443?security=tls&sni=a.example#A")
	b,_ := parseProxyURI("trojan://pw@b.example:443?sni=b.example#B")
	st := State{Version:2, EasyEnabled:true, Core:"sing-box", Mode:"global", Servers:[]ServerEntry{{ID:"a",Name:"A",Proxy:a},{ID:"b",Name:"B",Proxy:b}}, Chains:[]ChainEntry{{ID:"c",Name:"AB",Hops:[]string{"local:a","local:b"},Enabled:true}}}
	if err := rebuildConfig(dir,st); err != nil { t.Fatal(err) }
	data, err := os.ReadFile(filepath.Join(root,"sing-box","config.json")); if err != nil { t.Fatal(err) }
	var cfg map[string]interface{}; if err := json.Unmarshal(data,&cfg); err != nil { t.Fatal(err) }
	foundDetour, foundAPI := false,false
	for _, v := range cfg["outbounds"].([]interface{}) { m := v.(map[string]interface{}); if strings.Contains(stringValue(m["tag"]),"CHAIN · AB · 2") && stringValue(m["detour"]) != "" { foundDetour=true } }
	if exp,ok := cfg["experimental"].(map[string]interface{}); ok { if api,ok := exp["clash_api"].(map[string]interface{}); ok && stringValue(api["external_controller"])=="127.0.0.1:9090" { foundAPI=true } }
	if !foundDetour { t.Fatal("chain detour not generated") }; if !foundAPI { t.Fatal("clash api not generated") }
}

func TestParseSingBoxJSONSubscription(t *testing.T) {
	body := []byte(`{"outbounds":[{"type":"direct","tag":"direct"},{"type":"vless","tag":"A","server":"example.com","server_port":443,"uuid":"11111111-1111-1111-1111-111111111111"}]}`)
	format,nodes,ok := parseJSONSubscription(body,"sub")
	if !ok || format!="sing-box-json" || len(nodes)!=1 || nodes[0].RawKind!="sing-box" { t.Fatalf("format=%s nodes=%#v ok=%v",format,nodes,ok) }
}
