package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	stateVersion = 3
	maxBodyBytes = 8 << 20
	defaultUA    = "Box4Easy/1.0-rc1"
)

type State struct {
	Version       int            `json:"version"`
	EasyEnabled   bool           `json:"easyEnabled"`
	PreviousCore  string         `json:"previousCore,omitempty"`
	Core          string         `json:"core"`
	Mode          string         `json:"mode"`
	ActiveRouting string         `json:"activeRouting,omitempty"`
	SelectedNode  string         `json:"selectedNode,omitempty"`
	Subscriptions []Subscription `json:"subscriptions"`
	Servers       []ServerEntry  `json:"servers"`
	Routings      []RoutingEntry `json:"routings"`
	Chains        []ChainEntry   `json:"chains"`
	UpdatedAt     string         `json:"updatedAt,omitempty"`
}

type Subscription struct {
	ID string `json:"id"`; Name string `json:"name"`; URL string `json:"url"`; ProviderKind string `json:"providerKind"`; ProviderPath string `json:"providerPath,omitempty"`; SourceFormat string `json:"sourceFormat,omitempty"`; UserAgent string `json:"userAgent,omitempty"`; RoutingID string `json:"routingId,omitempty"`; LastUpdate string `json:"lastUpdate,omitempty"`; LastError string `json:"lastError,omitempty"`; NodeCountHint int `json:"nodeCountHint,omitempty"`; Nodes []ServerEntry `json:"nodes,omitempty"`; UserInfo string `json:"userInfo,omitempty"`; SupportURL string `json:"supportUrl,omitempty"`; WebURL string `json:"webUrl,omitempty"`; Announcement string `json:"announcement,omitempty"`; UpdateHours int `json:"updateHours,omitempty"`; AutoPing bool `json:"autoPing,omitempty"`; AutoConnect bool `json:"autoConnect,omitempty"`; AutoConnectBy string `json:"autoConnectBy,omitempty"`
}
type ServerEntry struct { ID string `json:"id"`; Name string `json:"name"`; URI string `json:"uri,omitempty"`; SourceSub string `json:"sourceSubscription,omitempty"`; Proxy map[string]interface{} `json:"proxy,omitempty"`; RawKind string `json:"rawKind,omitempty"`; Raw map[string]interface{} `json:"raw,omitempty"` }
type RoutingEntry struct { ID string `json:"id"`; Name string `json:"name"`; AutoEnable bool `json:"autoEnable"`; SourceSub string `json:"sourceSubscription,omitempty"`; Raw json.RawMessage `json:"raw"` }
type ChainEntry struct { ID string `json:"id"`; Name string `json:"name"`; Hops []string `json:"hops"`; Enabled bool `json:"enabled"` }
type fetchResult struct { Body []byte; RoutingLink string; FinalURL string; ContentType string; Headers http.Header }
type LatencyResult struct { Ref string `json:"ref"`; LatencyMS int64 `json:"latencyMs,omitempty"`; Error string `json:"error,omitempty"` }

func main() {
	if len(os.Args) < 2 { fatal(errors.New("usage: box4easy <state|ensure-core|enable|disable|add-subscription|update-subscription|update-all|remove-subscription|add-server|remove-server|set-routing|set-mode|set-core|select-node|latency|latencies|add-chain|remove-chain|toggle-chain|rebuild>")) }
	cmd:=os.Args[1]; fs:=flag.NewFlagSet(cmd,flag.ContinueOnError); dir:=fs.String("dir","/data/adb/box/easy","state directory"); name:=fs.String("name","","name"); rawURL:=fs.String("url","","subscription url"); id:=fs.String("id","","id"); uri:=fs.String("uri","","server uri"); mode:=fs.String("mode","","mode"); core:=fs.String("core","","core"); hops:=fs.String("hops","","comma-separated node refs"); previousCore:=fs.String("previous-core","","previous core"); if err:=fs.Parse(os.Args[2:]);err!=nil{fatal(err)}; if err:=ensureDir(*dir);err!=nil{fatal(err)}; st,err:=loadState(*dir);if err!=nil{fatal(err)}
	switch cmd {
	case "state": printJSON(st)
	case "ensure-core": target:=normalizeCore(*core);if target==""{target=st.Core};if target==""{target="sing-box"};if err:=ensureCore(target);err!=nil{fatal(err)};printJSON(st)
	case "enable": if !st.EasyEnabled{if err:=backupAdvancedConfig(*dir);err!=nil{fatal(err)}};st.EasyEnabled=true;if *previousCore!=""{st.PreviousCore=*previousCore};if st.Mode==""{st.Mode="routing"};if st.Core==""{st.Core="sing-box"};if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "disable": st.EasyEnabled=false;if err:=saveState(*dir,st);err!=nil{fatal(err)};if err:=restoreAdvancedConfig(*dir);err!=nil{fatal(err)};printJSON(st)
	case "add-subscription": if strings.TrimSpace(*rawURL)==""{fatal(errors.New("--url is required"))};wasEnabled:=st.EasyEnabled;sub,routing,err:=importSubscription(*dir,*name,*rawURL,"");if err!=nil{fatal(err)};st.Subscriptions=append(st.Subscriptions,sub);if routing!=nil{routing.SourceSub=sub.ID;st.Routings=upsertRouting(st.Routings,*routing);st.Subscriptions[len(st.Subscriptions)-1].RoutingID=routing.ID;if routing.AutoEnable||st.ActiveRouting==""{st.ActiveRouting=routing.ID}};if st.Mode==""{st.Mode="routing"};if wasEnabled{if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)}}else if err:=saveState(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "update-subscription": if *id==""{fatal(errors.New("--id is required"))};idx:=findSubscription(st.Subscriptions,*id);if idx<0{fatal(errors.New("subscription not found"))};old:=st.Subscriptions[idx];sub,routing,err:=importSubscription(*dir,old.Name,old.URL,old.ID);if err!=nil{st.Subscriptions[idx].LastError=err.Error();_=saveState(*dir,st);fatal(err)};st.Subscriptions[idx]=sub;if routing!=nil{routing.SourceSub=sub.ID;st.Routings=upsertRouting(st.Routings,*routing);st.Subscriptions[idx].RoutingID=routing.ID;if routing.AutoEnable{st.ActiveRouting=routing.ID}}else{st.Subscriptions[idx].RoutingID=old.RoutingID};if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "update-all": for i:=range st.Subscriptions{old:=st.Subscriptions[i];sub,routing,e:=importSubscription(*dir,old.Name,old.URL,old.ID);if e!=nil{st.Subscriptions[i].LastError=e.Error();continue};st.Subscriptions[i]=sub;if routing!=nil{routing.SourceSub=sub.ID;st.Routings=upsertRouting(st.Routings,*routing);st.Subscriptions[i].RoutingID=routing.ID;if routing.AutoEnable{st.ActiveRouting=routing.ID}}else{st.Subscriptions[i].RoutingID=old.RoutingID}};if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "remove-subscription": if *id==""{fatal(errors.New("--id is required"))};st.Subscriptions=removeSubscription(st.Subscriptions,*id);st.Routings=removeRoutingsBySub(st.Routings,*id);if findRouting(st.Routings,st.ActiveRouting)<0{st.ActiveRouting=""};_=os.Remove(filepath.Join(*dir,"providers",safeID(*id)+".yaml"));if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "add-server": if strings.TrimSpace(*uri)==""{fatal(errors.New("--uri is required"))};wasEnabled:=st.EasyEnabled;proxy,err:=parseProxyURI(strings.TrimSpace(*uri));if err!=nil{fatal(err)};n:=stringValue(proxy["name"]);if *name!=""{n=*name;proxy["name"]=n};st.Servers=append(st.Servers,ServerEntry{ID:newID("srv"),Name:n,URI:strings.TrimSpace(*uri),Proxy:proxy});if st.Mode==""{st.Mode="routing"};if wasEnabled{if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)}}else if err:=saveState(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "remove-server": if *id==""{fatal(errors.New("--id is required"))};st.Servers=removeServer(st.Servers,*id);if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "set-routing": if *id=="off"||*id==""{st.ActiveRouting=""}else if findRouting(st.Routings,*id)<0{fatal(errors.New("routing profile not found"))}else{st.ActiveRouting=*id};if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "set-mode": switch *mode{case "routing","global","direct":st.Mode=*mode;default:fatal(errors.New("--mode must be routing, global or direct"))};if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "set-core": target:=normalizeCore(*core);if target==""{fatal(errors.New("--core must be sing-box, xray, v2ray or mihomo"))};if err:=ensureCore(target);err!=nil{fatal(err)};st.Core=target;if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "select-node": ref:=strings.TrimSpace(*id);if ref!=""&&ref!="auto"{if _,ok:=resolveNodeRef(st,ref);!ok{fatal(fmt.Errorf("unknown node: %s",ref))}};st.SelectedNode=ref;if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "latency": ref:=strings.TrimSpace(*id);if ref==""{fatal(errors.New("--id is required"))};n,ok:=resolveNodeRef(st,ref);if !ok{fatal(fmt.Errorf("unknown node: %s",ref))};printJSON(measureNodeLatency(ref,n))
	case "latencies": items:=allNodes(st);results:=make([]LatencyResult,len(items));sem:=make(chan struct{},8);done:=make(chan int,len(items));for i:=range items{go func(i int){sem<-struct{}{};results[i]=measureNodeLatency(items[i].Ref,items[i].Node);<-sem;done<-i}(i)};for range items{<-done};printJSON(results)
	case "add-chain": parts:=splitNonEmpty(*hops,",");if len(parts)<2{fatal(errors.New("a chain needs at least two hops"))};for _,ref:=range parts{if _,ok:=resolveNodeRef(st,ref);!ok{fatal(fmt.Errorf("unknown chain node: %s",ref))}};chainName:=strings.TrimSpace(*name);if chainName==""{chainName="Chain "+strconv.Itoa(len(st.Chains)+1)};st.Chains=append(st.Chains,ChainEntry{ID:newID("chain"),Name:chainName,Hops:parts,Enabled:true});if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "remove-chain": if *id==""{fatal(errors.New("--id is required"))};st.Chains=removeChain(st.Chains,*id);if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "toggle-chain": if *id==""{fatal(errors.New("--id is required"))};found:=false;for i:=range st.Chains{if st.Chains[i].ID==*id{st.Chains[i].Enabled=!st.Chains[i].Enabled;found=true}};if !found{fatal(errors.New("chain not found"))};if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	case "rebuild": if err:=saveAndRebuild(*dir,st);err!=nil{fatal(err)};printJSON(st)
	default: fatal(fmt.Errorf("unknown command: %s",cmd))
	}
}

func ensureDir(dir string) error { for _,p:=range []string{dir,filepath.Join(dir,"providers")}{if err:=os.MkdirAll(p,0755);err!=nil{return err}};return nil }
func statePath(dir string) string{return filepath.Join(dir,"state.json")}
func loadState(dir string)(State,error){st:=State{Version:stateVersion,Core:"sing-box",Mode:"routing",Subscriptions:[]Subscription{},Servers:[]ServerEntry{},Routings:[]RoutingEntry{},Chains:[]ChainEntry{}};b,err:=os.ReadFile(statePath(dir));if errors.Is(err,os.ErrNotExist){return st,nil};if err!=nil{return st,err};if err:=json.Unmarshal(b,&st);err!=nil{return st,err};if st.Version==0{st.Version=stateVersion};if st.Mode==""{st.Mode="routing"};if st.Core==""{st.Core="sing-box"};if st.Chains==nil{st.Chains=[]ChainEntry{}};return st,nil}
