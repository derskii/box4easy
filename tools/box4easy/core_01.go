package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func saveState(dir string, st State) error {
	st.Version = stateVersion
	st.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	b, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := statePath(dir) + ".tmp"
	if err := os.WriteFile(tmp, append(b, '\n'), 0644); err != nil {
		return err
	}
	return os.Rename(tmp, statePath(dir))
}

func saveAndRebuild(dir string, st State) error {
	if st.EasyEnabled {
		if err := rebuildConfig(dir, st); err != nil {
			return err
		}
	}
	return saveState(dir, st)
}

func boxRoot() string {
	if v := strings.TrimSpace(os.Getenv("BOX4EASY_BOX_ROOT")); v != "" {
		return filepath.Clean(v)
	}
	return "/data/adb/box"
}

func mihomoConfigPath() string { return filepath.Join(boxRoot(), "mihomo", "config.yaml") }

func singBoxConfigPath() string { return filepath.Join(boxRoot(), "sing-box", "config.json") }

func xrayConfigPath(core string) string { return filepath.Join(boxRoot(), core, "config.json") }

func advancedBackupPath(dir, core string) string {
	return filepath.Join(dir, "config.advanced."+safeID(core))
}

func coreConfigPath(core string) string {
	switch normalizeCore(core) {
	case "sing-box":
		return singBoxConfigPath()
	case "xray", "v2ray":
		return xrayConfigPath(normalizeCore(core))
	case "mihomo":
		return mihomoConfigPath()
	default:
		return ""
	}
}

func backupAdvancedConfig(dir string) error {
	for _, core := range []string{"sing-box", "xray", "v2ray", "mihomo"} {
		dst := advancedBackupPath(dir, core)
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		path := coreConfigPath(core)
		b, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			if err := os.WriteFile(dst, []byte{}, 0644); err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if err := os.WriteFile(dst, b, 0644); err != nil {
			return err
		}
	}
	return nil
}

func restoreAdvancedConfig(dir string) error {
	for _, core := range []string{"sing-box", "xray", "v2ray", "mihomo"} {
		b, err := os.ReadFile(advancedBackupPath(dir, core))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		if len(b) == 0 {
			continue
		}
		if err := atomicWrite(coreConfigPath(core), b, 0644); err != nil {
			return err
		}
	}
	return nil
}

func importSubscription(dir, name, rawURL, forceID string) (Subscription, *RoutingEntry, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return Subscription{}, nil, errors.New("subscription URL must be http(s)")
	}
	id := forceID
	if id == "" {
		id = newID("sub")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	uas := []string{
		"Happ/Android Box4Easy/1.0",
		"sing-box/1.13 Box4Easy/1.0",
		"v2rayNG/1.10 Box4Easy/1.0",
		"Clash.Meta/1.19 Mihomo",
	}

	var chosen fetchResult
	var chosenUA string
	var chosenFormat string
	var chosenKind string
	var chosenBody []byte
	var chosenLinks []string
	var chosenNodes []ServerEntry
	var lastErr error

	for _, ua := range uas {
		if ctx.Err() != nil {
			break
		}
		fr, e := fetchSubscriptionCtx(ctx, rawURL, ua)
		if e != nil {
			lastErr = e
			continue
		}
		decoded, links, count := normalizeSubscriptionBody(fr.Body)
		if count > 0 {
			chosen, chosenUA, chosenFormat, chosenKind, chosenBody, chosenLinks = fr, ua, "uri-list", "file", decoded, links
			break
		}
		if format, nodes, ok := parseJSONSubscription(decoded, id); ok && len(nodes) > 0 {
			chosen, chosenUA, chosenFormat, chosenKind, chosenBody, chosenNodes = fr, ua, format, "json", decoded, nodes
			break
		}
		if looksLikeClashYAML(decoded) {
			chosen, chosenUA, chosenFormat, chosenKind, chosenBody = fr, ua, "mihomo-yaml", "http", decoded
			// Keep trying for a richer JSON/URI representation while the same 10s budget remains.
			continue
		}
		lastErr = errors.New("unrecognized response")
	}
	if chosenFormat == "" {
		if ctx.Err() == context.DeadlineExceeded {
			return Subscription{}, nil, errors.New("timeout while adding subscription (10s)")
		}
		if lastErr != nil {
			return Subscription{}, nil, fmt.Errorf("subscription import failed: %w", lastErr)
		}
		return Subscription{}, nil, errors.New("subscription format is not recognized")
	}

	meta := parseSubscriptionMetadata(chosen.Headers, chosenBody)
	if strings.TrimSpace(name) == "" {
		name = firstNonEmpty(meta["profile-title"], u.Hostname(), "Подписка")
	}
	name = strings.TrimSpace(name)

	routing := parseRoutingLink(chosen.RoutingLink)
	if routing == nil {
		routing = parseRoutingLink(findRoutingInBody(chosen.Body))
	}

	providerPath := ""
	nodes := chosenNodes
	if chosenFormat == "uri-list" {
		providerPath = filepath.Join(dir, "providers", safeID(id)+".yaml")
		if err := writeProviderFromLinks(providerPath, chosenLinks); err != nil {
			return Subscription{}, routing, err
		}
		for i, link := range chosenLinks {
			proxy, e := parseProxyURI(link)
			if e != nil {
				continue
			}
			n := stringValue(proxy["name"])
			if n == "" {
				n = fmt.Sprintf("Сервер %d", i+1)
			}
			nodes = append(nodes, ServerEntry{ID: fmt.Sprintf("%s-n%d", safeID(id), i+1), Name: n, URI: link, SourceSub: id, Proxy: proxy})
		}
	} else if chosenKind == "json" {
		providerPath = filepath.Join(dir, "providers", safeID(id)+".json")
		if err := atomicWrite(providerPath, chosenBody, 0644); err != nil {
			return Subscription{}, routing, err
		}
	}
	if len(nodes) == 0 && chosenFormat != "mihomo-yaml" {
		return Subscription{}, routing, errors.New("subscription parsed but contains no supported servers")
	}

	updateHours, _ := strconv.Atoi(strings.TrimSpace(meta["profile-update-interval"]))
	sub := Subscription{
		ID: id, Name: name, URL: rawURL, ProviderKind: chosenKind, ProviderPath: providerPath,
		SourceFormat: chosenFormat, UserAgent: chosenUA, LastUpdate: time.Now().UTC().Format(time.RFC3339),
		NodeCountHint: len(nodes), Nodes: nodes, UserInfo: meta["subscription-userinfo"],
		SupportURL: meta["support-url"], WebURL: meta["profile-web-page-url"], Announcement: decodeMetaText(meta["announce"]),
		UpdateHours: updateHours, AutoPing: truthyString(meta["subscription-ping-onopen-enabled"]),
		AutoConnect: truthyString(meta["subscription-autoconnect"]), AutoConnectBy: meta["subscription-autoconnect-type"],
	}
	if routing != nil {
		sub.RoutingID = routing.ID
	}
	return sub, routing, nil
}

func parseSubscriptionMetadata(headers http.Header, body []byte) map[string]string {
	keys := []string{"profile-title", "subscription-userinfo", "profile-update-interval", "support-url", "profile-web-page-url", "announce", "subscription-ping-onopen-enabled", "subscription-autoconnect", "subscription-autoconnect-type", "change-user-agent"}
	out := map[string]string{}
	for _, k := range keys {
		if v := strings.TrimSpace(headers.Get(k)); v != "" {
			out[k] = v
		}
	}
	s := bufio.NewScanner(bytes.NewReader(body))
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if !strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimSpace(strings.TrimPrefix(line, "#"))
		for _, sep := range []string{":", " "} {
			if i := strings.Index(line, sep); i > 0 {
				k := strings.ToLower(strings.TrimSpace(line[:i]))
				v := strings.TrimSpace(line[i+len(sep):])
				for _, allowed := range keys {
					if k == allowed && v != "" {
						out[k] = v
					}
				}
				break
			}
		}
	}
	return out
}

func truthyString(v string) bool {
	v = strings.ToLower(strings.TrimSpace(v))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func decodeMetaText(v string) string {
	v = strings.TrimSpace(v)
	if strings.HasPrefix(strings.ToLower(v), "base64:") {
		b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(v[len("base64:"):]))
		if err == nil {
			return string(b)
		}
	}
	return v
}

func parseJSONSubscription(body []byte, subID string) (string, []ServerEntry, bool) {
	var root interface{}
	if json.Unmarshal(bytes.TrimSpace(body), &root) != nil {
		return "", nil, false
	}
	var items []interface{}
	format := "json-array"
	switch v := root.(type) {
	case []interface{}:
		items = v
	case map[string]interface{}:
		for _, key := range []string{"outbounds", "configs", "servers", "proxies", "data", "items"} {
			if a, ok := v[key].([]interface{}); ok && len(a) > 0 {
				items = a
				break
			}
		}
		if len(items) == 0 {
			if data, ok := v["data"].(string); ok {
				decoded, links, count := normalizeSubscriptionBody([]byte(data))
				_ = decoded
				if count > 0 {
					for _, link := range links {
						items = append(items, link)
					}
				}
			}
		}
	default:
		return "", nil, false
	}
	if len(items) == 0 {
		return "", nil, false
	}

	var nodes []ServerEntry
	seenSing, seenXray := false, false
	for i, item := range items {
		id := fmt.Sprintf("%s-j%d", safeID(subID), i+1)
		switch v := item.(type) {
		case string:
			links := extractLinks(v)
			if len(links) == 0 {
				links = []string{strings.TrimSpace(v)}
			}
			for _, link := range links {
				if !linkRE.MatchString(link) {
					continue
				}
				p, err := parseProxyURI(link)
				if err != nil {
					continue
				}
				name := firstNonEmpty(stringValue(p["name"]), fmt.Sprintf("Сервер %d", i+1))
				nodes = append(nodes, ServerEntry{ID: id, Name: name, URI: link, SourceSub: subID, Proxy: p})
			}
		case map[string]interface{}:
			for _, key := range []string{"uri", "link", "url"} {
				if link := strings.TrimSpace(stringValue(v[key])); linkRE.MatchString(link) {
					p, err := parseProxyURI(link)
					if err == nil {
						name := firstNonEmpty(stringValue(v["name"]), stringValue(p["name"]), fmt.Sprintf("Сервер %d", i+1))
						p["name"] = name
						nodes = append(nodes, ServerEntry{ID: id, Name: name, URI: link, SourceSub: subID, Proxy: p})
					}
					goto nextItem
				}
			}
			if protocol := strings.ToLower(stringValue(v["protocol"])); protocol != "" {
				if protocol == "freedom" || protocol == "blackhole" || protocol == "dns" {
					goto nextItem
				}
				name := firstNonEmpty(stringValue(v["tag"]), stringValue(v["name"]), fmt.Sprintf("%s %d", protocol, i+1))
				nodes = append(nodes, ServerEntry{ID: id, Name: name, SourceSub: subID, RawKind: "xray", Raw: cloneMap(v)})
				seenXray = true
				goto nextItem
			}
			typ := strings.ToLower(stringValue(v["type"]))
			if typ != "" {
				if typ == "direct" || typ == "block" || typ == "selector" || typ == "urltest" || typ == "dns" {
					goto nextItem
				}
				name := firstNonEmpty(stringValue(v["tag"]), stringValue(v["name"]), fmt.Sprintf("%s %d", typ, i+1))
				// sing-box uses server_port/snake_case; Clash-style JSON uses port and is
				// easier to keep in the canonical proxy representation.
				if _, ok := v["server_port"]; ok {
					nodes = append(nodes, ServerEntry{ID: id, Name: name, SourceSub: subID, RawKind: "sing-box", Raw: cloneMap(v)})
					seenSing = true
				} else if stringValue(v["server"]) != "" && intValue(v["port"]) > 0 {
					p := cloneMap(v)
					p["name"] = name
					nodes = append(nodes, ServerEntry{ID: id, Name: name, SourceSub: subID, Proxy: p})
				}
			}
		}
	nextItem:
	}
	if len(nodes) == 0 {
		return "", nil, false
	}
	if seenSing && !seenXray {
		format = "sing-box-json"
	}
	if seenXray && !seenSing {
		format = "xray-json"
	}
	return format, nodes, true
}

func fetchSubscriptionCtx(ctx context.Context, rawURL, ua string) (fetchResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return fetchResult{}, err
	}
	applySubscriptionHeaders(req, ua)
	client := &http.Client{Transport: androidAwareTransport(), CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		applySubscriptionHeaders(req, ua)
		return nil
	}}
	resp, err := client.Do(req)
	if err != nil {
		return fetchResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fetchResult{}, fmt.Errorf("subscription HTTP status %d", resp.StatusCode)
	}
	lr := io.LimitReader(resp.Body, maxBodyBytes+1)
	body, err := io.ReadAll(lr)
	if err != nil {
		return fetchResult{}, err
	}
	if len(body) > maxBodyBytes {
		return fetchResult{}, errors.New("subscription response is too large")
	}
	routing := strings.TrimSpace(resp.Header.Get("routing"))
	return fetchResult{Body: body, RoutingLink: routing, FinalURL: resp.Request.URL.String(), ContentType: resp.Header.Get("Content-Type"), Headers: resp.Header.Clone()}, nil
}
