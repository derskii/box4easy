package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func applySubscriptionHeaders(req *http.Request, ua string) {
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Cache-Control", "no-cache")
	// Happ-compatible identification uses the real, stable Android identifier.
	// It is never randomized/rotated to evade provider device limits.
	if id := androidStableID(); id != "" {
		req.Header.Set("HWID", id)
		req.Header.Set("X-HWID", id)
	}
	if model := androidProp("ro.product.model"); model != "" {
		req.Header.Set("Device-Model", model)
		req.Header.Set("X-Device-Model", model)
	}
	if release := androidProp("ro.build.version.release"); release != "" {
		req.Header.Set("X-OS", "Android "+release)
	}
}

func androidProp(name string) string {
	b, err := exec.Command("getprop", name).Output()
	if err != nil { return "" }
	return strings.TrimSpace(string(b))
}
func androidStableID() string {
	if b, err := exec.Command("settings", "get", "secure", "android_id").Output(); err == nil {
		v := strings.TrimSpace(string(b)); if v != "" && v != "null" { return v }
	}
	return ""
}
func androidAwareTransport() *http.Transport {
	servers := androidDNSServers(); resolver := &net.Resolver{PreferGo:true}
	if len(servers)>0 { resolver.Dial=func(ctx context.Context, network,address string)(net.Conn,error){ var last error; for _,server:=range servers{d:=net.Dialer{Timeout:3*time.Second};c,err:=d.DialContext(ctx,"udp",net.JoinHostPort(server,"53"));if err==nil{return c,nil};last=err};return nil,last } }
	dialer:=&net.Dialer{Timeout:8*time.Second,KeepAlive:30*time.Second,Resolver:resolver}
	return &http.Transport{Proxy:http.ProxyFromEnvironment,DialContext:dialer.DialContext,ForceAttemptHTTP2:true,TLSHandshakeTimeout:8*time.Second,ResponseHeaderTimeout:12*time.Second,IdleConnTimeout:30*time.Second}
}
func androidDNSServers() []string { seen:=map[string]bool{};var out []string;add:=func(v string){v=strings.TrimSpace(v);if ip:=net.ParseIP(v);ip!=nil&&!seen[v]{seen[v]=true;out=append(out,v)}};for _,prop:=range []string{"net.dns1","net.dns2","net.dns3","net.dns4"}{if b,err:=exec.Command("getprop",prop).Output();err==nil{add(string(b))}};add("1.1.1.1");add("8.8.8.8");return out }
type githubRelease struct { Assets []struct{Name string `json:"name"`;URL string `json:"browser_download_url"`} `json:"assets"` }
func ensureCore(core string) error { core=normalizeCore(core);if core==""{return errors.New("unknown core")};target:=filepath.Join(boxRoot(),"bin",core);if st,err:=os.Stat(target);err==nil&&st.Mode()&0111!=0&&st.Size()>512*1024{return nil};switch core{case "sing-box":return ensureSingBoxCore();case "xray":return ensureXrayCore();case "v2ray":return ensureV2RayCore();case "mihomo":return ensureMihomoCore();default:return fmt.Errorf("unsupported core: %s",core)} }
func fetchLatestRelease(ctx context.Context,repo string)(githubRelease,error){var rel githubRelease;req,err:=http.NewRequestWithContext(ctx,http.MethodGet,"https://api.github.com/repos/"+repo+"/releases/latest",nil);if err!=nil{return rel,err};req.Header.Set("User-Agent","Box4Easy/1.0");req.Header.Set("Accept","application/vnd.github+json");resp,err:=(&http.Client{Transport:androidAwareTransport(),Timeout:30*time.Second}).Do(req);if err!=nil{return rel,err};defer resp.Body.Close();if resp.StatusCode!=http.StatusOK{return rel,fmt.Errorf("GitHub release API for %s returned %d",repo,resp.StatusCode)};if err:=json.NewDecoder(io.LimitReader(resp.Body,4<<20)).Decode(&rel);err!=nil{return rel,err};return rel,nil}
func downloadReleaseAsset(ctx context.Context,assetURL string,limit int64)([]byte,error){req,err:=http.NewRequestWithContext(ctx,http.MethodGet,assetURL,nil);if err!=nil{return nil,err};req.Header.Set("User-Agent","Box4Easy/1.0");resp,err:=(&http.Client{Transport:androidAwareTransport(),Timeout:90*time.Second}).Do(req);if err!=nil{return nil,err};defer resp.Body.Close();if resp.StatusCode<200||resp.StatusCode>=300{return nil,fmt.Errorf("asset download returned %d",resp.StatusCode)};lr:=io.LimitReader(resp.Body,limit+1);data,err:=io.ReadAll(lr);if err!=nil{return nil,err};if int64(len(data))>limit{return nil,errors.New("core archive is too large")};return data,nil}
func installCoreBinary(target string,bin []byte) error {if len(bin)<512*1024{return errors.New("core binary missing or unexpectedly small")};if err:=os.MkdirAll(filepath.Dir(target),0755);err!=nil{return err};tmp:=target+".new";if err:=os.WriteFile(tmp,bin,0700);err!=nil{return err};if err:=os.Rename(tmp,target);err!=nil{_=os.Remove(tmp);return err};return os.Chmod(target,0700)}
func ensureSingBoxCore() error {target:=filepath.Join(boxRoot(),"bin","sing-box");if st,err:=os.Stat(target);err==nil&&st.Mode()&0111!=0&&st.Size()>512*1024{return nil};ctx,cancel:=context.WithTimeout(context.Background(),90*time.Second);defer cancel();rel,err:=fetchLatestRelease(ctx,"SagerNet/sing-box");if err!=nil{return fmt.Errorf("cannot query sing-box release: %w",err)};arch:=map[string]string{"arm64":"arm64","arm":"arm","amd64":"amd64","386":"386"}[runtime.GOARCH];if arch==""{return fmt.Errorf("unsupported architecture for sing-box: %s",runtime.GOARCH)};needle:="-android-"+arch+".tar.gz";asset:="";for _,a:=range rel.Assets{if strings.HasSuffix(strings.ToLower(a.Name),needle)&&strings.HasPrefix(strings.ToLower(a.Name),"sing-box-"){asset=a.URL;break}};if asset==""{return fmt.Errorf("sing-box Android asset not found for %s",runtime.GOARCH)};data,err:=downloadReleaseAsset(ctx,asset,100<<20);if err!=nil{return fmt.Errorf("cannot download sing-box: %w",err)};gz,err:=gzip.NewReader(bytes.NewReader(data));if err!=nil{return fmt.Errorf("invalid sing-box archive: %w",err)};defer gz.Close();tr:=tar.NewReader(gz);var bin []byte;for{h,e:=tr.Next();if e==io.EOF{break};if e!=nil{return e};if h.Typeflag!=tar.TypeReg||filepath.Base(h.Name)!="sing-box"{continue};bin,e=io.ReadAll(io.LimitReader(tr,80<<20));if e!=nil{return e};break};if err:=installCoreBinary(target,bin);err!=nil{return fmt.Errorf("install sing-box: %w",err)};return nil}
func ensureXrayCore() error {target:=filepath.Join(boxRoot(),"bin","xray");if st,err:=os.Stat(target);err==nil&&st.Mode()&0111!=0&&st.Size()>512*1024{return nil};ctx,cancel:=context.WithTimeout(context.Background(),90*time.Second);defer cancel();rel,err:=fetchLatestRelease(ctx,"XTLS/Xray-core");if err!=nil{return fmt.Errorf("cannot query Xray release: %w",err)};candidates:=map[string][]string{"arm64":{"xray-android-arm64-v8a.zip","xray-linux-arm64-v8a.zip","xray-linux-arm64.zip"},"arm":{"xray-android-arm32-v7a.zip","xray-linux-arm32-v7a.zip","xray-linux-arm32.zip"},"amd64":{"xray-android-x64.zip","xray-linux-64.zip"},"386":{"xray-android-x86.zip","xray-linux-32.zip"}}[runtime.GOARCH];if len(candidates)==0{return fmt.Errorf("unsupported architecture for Xray: %s",runtime.GOARCH)};asset:="";for _,want:=range candidates{for _,a:=range rel.Assets{if strings.EqualFold(a.Name,want){asset=a.URL;break}};if asset!=""{break}};if asset==""{return fmt.Errorf("Xray Android/Linux asset not found for %s",runtime.GOARCH)};data,err:=downloadReleaseAsset(ctx,asset,100<<20);if err!=nil{return fmt.Errorf("cannot download Xray: %w",err)};zr,err:=zip.NewReader(bytes.NewReader(data),int64(len(data)));if err!=nil{return fmt.Errorf("invalid Xray archive: %w",err)};var bin []byte;for _,f:=range zr.File{if !strings.EqualFold(filepath.Base(f.Name),"xray")&&!strings.EqualFold(filepath.Base(f.Name),"xray.exe"){continue};r,e:=f.Open();if e!=nil{return e};bin,e=io.ReadAll(io.LimitReader(r,80<<20));r.Close();if e!=nil{return e};break};if err:=installCoreBinary(target,bin);err!=nil{return fmt.Errorf("install Xray: %w",err)};return nil}
func ensureV2RayCore() error {target:=filepath.Join(boxRoot(),"bin","v2ray");if st,err:=os.Stat(target);err==nil&&st.Mode()&0111!=0&&st.Size()>512*1024{return nil};ctx,cancel:=context.WithTimeout(context.Background(),90*time.Second);defer cancel();req,_:=http.NewRequestWithContext(ctx,http.MethodGet,"https://api.github.com/repos/v2fly/v2ray-core/releases/latest",nil);req.Header.Set("User-Agent","Box4Easy/0.2");resp,err:=(&http.Client{Transport:androidAwareTransport(),Timeout:90*time.Second}).Do(req);if err!=nil{return err};defer resp.Body.Close();if resp.StatusCode!=200{return fmt.Errorf("V2Ray release API returned %d",resp.StatusCode)};var rel githubRelease;if err:=json.NewDecoder(io.LimitReader(resp.Body,4<<20)).Decode(&rel);err!=nil{return err};asset:="";best:=-1;for _,a:=range rel.Assets{name:=strings.ToLower(a.Name);if !strings.HasSuffix(name,".zip")||!strings.Contains(name,"v2ray-android-"){continue};score:=0;switch runtime.GOARCH{case "arm64":if strings.Contains(name,"arm64")||strings.Contains(name,"v8a"){score=10};case "arm":if strings.Contains(name,"arm32")||strings.Contains(name,"v7a"){score=10};case "amd64":if strings.Contains(name,"amd64")||strings.Contains(name,"android-64"){score=10};case "386":if strings.Contains(name,"386")||strings.Contains(name,"android-32"){score=10}};if score>best{best=score;asset=a.URL}};if best<1||asset==""{return fmt.Errorf("V2Ray Android asset not found for %s",runtime.GOARCH)};req2,_:=http.NewRequestWithContext(ctx,http.MethodGet,asset,nil);req2.Header.Set("User-Agent","Box4Easy/0.2");resp2,err:=(&http.Client{Transport:androidAwareTransport(),Timeout:90*time.Second}).Do(req2);if err!=nil{return err};defer resp2.Body.Close();if resp2.StatusCode<200||resp2.StatusCode>=300{return fmt.Errorf("V2Ray download returned %d",resp2.StatusCode)};data,err:=io.ReadAll(io.LimitReader(resp2.Body,100<<20));if err!=nil{return err};zr,err:=zip.NewReader(bytes.NewReader(data),int64(len(data)));if err!=nil{return err};var bin []byte;for _,f:=range zr.File{if strings.EqualFold(filepath.Base(f.Name),"v2ray")||strings.EqualFold(filepath.Base(f.Name),"v2ray.exe"){r,e:=f.Open();if e!=nil{return e};bin,e=io.ReadAll(io.LimitReader(r,80<<20));r.Close();if e!=nil{return e};break}};if len(bin)<512*1024{return errors.New("v2ray binary not found in release archive")};if err:=os.MkdirAll(filepath.Dir(target),0755);err!=nil{return err};tmp:=target+".new";if err:=os.WriteFile(tmp,bin,0700);err!=nil{return err};if err:=os.Rename(tmp,target);err!=nil{_=os.Remove(tmp);return err};return os.Chmod(target,0700)}
