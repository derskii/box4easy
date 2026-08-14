package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseNestedJSONSubscriptionV1(t *testing.T) {
	body := []byte(`{"data":{"nodes":[{"uri":"vless://11111111-1111-1111-1111-111111111111@example.com:443?security=tls&sni=example.com#Nested"}]}}`)
	format, nodes, ok := parseJSONSubscriptionV1(body, "nested")
	if !ok {
		t.Fatal("nested JSON subscription was not recognized")
	}
	if format != "json-nodes" {
		t.Fatalf("format=%q", format)
	}
	if len(nodes) != 1 || nodes[0].Name != "Nested" {
		t.Fatalf("unexpected nodes: %#v", nodes)
	}
}

func TestDisabledEasyStateDoesNotRebuildCoreConfig(t *testing.T) {
	root := t.TempDir()
	if err := os.Setenv("BOX4EASY_BOX_ROOT", root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Unsetenv("BOX4EASY_BOX_ROOT") })

	dir := filepath.Join(root, "easy")
	if err := ensureDir(dir); err != nil {
		t.Fatal(err)
	}
	proxy, err := parseProxyURI("vless://11111111-1111-1111-1111-111111111111@example.com:443?security=tls&sni=example.com#Staged")
	if err != nil {
		t.Fatal(err)
	}
	st := State{
		Version: stateVersion,
		EasyEnabled: false,
		Core: "sing-box",
		Mode: "routing",
		Servers: []ServerEntry{{ID: "staged", Name: "Staged", Proxy: proxy}},
	}
	if err := saveAndRebuild(dir, st); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "sing-box", "config.json")); !os.IsNotExist(err) {
		t.Fatalf("disabled Easy unexpectedly created core config: %v", err)
	}
	if _, err := os.Stat(statePath(dir)); err != nil {
		t.Fatalf("staged state was not saved: %v", err)
	}
}

func TestMarkV1ActivatedRemovesManualGate(t *testing.T) {
	root := t.TempDir()
	if err := os.Setenv("BOX4EASY_BOX_ROOT", root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Unsetenv("BOX4EASY_BOX_ROOT") })

	dir := filepath.Join(root, "easy")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	manual := filepath.Join(root, "manual")
	if err := os.WriteFile(manual, []byte("manual\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := markV1Activated(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(manual); !os.IsNotExist(err) {
		t.Fatalf("manual gate still exists: %v", err)
	}
	if b, err := os.ReadFile(filepath.Join(dir, "v1.activated")); err != nil || string(b) != "ok\n" {
		t.Fatalf("activation marker missing or invalid: %q, %v", b, err)
	}
}
