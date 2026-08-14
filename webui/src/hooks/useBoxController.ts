import { useEffect, useMemo, useState } from 'react';
import { boxBridge, discoverPackages, notify } from '@/lib/bridge';
import type { AppInfo, BoxConfig, BoxControllerState, BoxStatus } from '@/types/box';

function normalizeStatus(raw?: Partial<BoxStatus> | null): BoxStatus {
  const auto = raw?.autostart_enabled;
  return {
    running: false,
    pid: '',
    bin_name: 'sing-box',
    clash_api_port: '9090',
    clash_api_secret: '',
    ...raw,
    autoStart: auto === true || auto === 1 || auto === '1' || auto === 'true',
  };
}

const TOGGLES = new Set(['PROXY_MOBILE','PROXY_WIFI','PROXY_HOTSPOT','PROXY_USB','PROXY_TCP','PROXY_UDP','APP_PROXY_ENABLE','BYPASS_CN_IP','BLOCK_QUIC','MAC_FILTER_ENABLE','FORCE_MARK_BYPASS','PERFORMANCE_MODE']);
const NUMBERS = new Set(['PROXY_MODE','PROXY_IPV6','DNS_HIJACK_ENABLE','PROXY_TCP_PORT','PROXY_UDP_PORT','DNS_PORT','clash_api_port','MARK_VALUE','MARK_VALUE6','TABLE_ID']);

export function useBoxController(): BoxControllerState {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<BoxStatus>(normalizeStatus());
  const [originalConfig, setOriginalConfig] = useState<BoxConfig>({});
  const [config, setConfig] = useState<BoxConfig>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [appList, setAppList] = useState<AppInfo[]>([]);
  const hasChanges = useMemo(() => JSON.stringify(originalConfig) !== JSON.stringify(config), [originalConfig, config]);

  useEffect(() => {
    void (async () => {
      const [s, c] = await Promise.allSettled([boxBridge.status(), boxBridge.getConfig()]);
      if (s.status === 'fulfilled') setStatus(normalizeStatus(s.value));
      if (c.status === 'fulfilled') { setConfig(c.value as BoxConfig); setOriginalConfig(c.value as BoxConfig); }
      if (s.status === 'rejected') notify(`Не удалось прочитать состояние: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
      if (c.status === 'rejected') notify(`Не удалось прочитать настройки: ${c.reason instanceof Error ? c.reason.message : String(c.reason)}`);
      setLoading(false);
      setTimeout(() => setAppList(discoverPackages()), 80);
    })();
  }, []);

  const waitForStatus = async (running: boolean, attempts = 16) => {
    let latest = normalizeStatus(await boxBridge.status());
    for (let i = 0; i < attempts && latest.running !== running; i++) {
      await new Promise(r => setTimeout(r, 350));
      latest = normalizeStatus(await boxBridge.status());
    }
    return latest;
  };

  const emergencyNetworkCleanup = async () => {
    await Promise.allSettled([boxBridge.service('stop'), boxBridge.tproxy('stop')]);
    try { setStatus(normalizeStatus(await boxBridge.status())); } catch { /* ignore */ }
  };

  const handleServiceAction = async (action: string) => {
    setActionLoading(action);
    try {
      if (action === 'start' || action === 'stop' || action === 'restart') await boxBridge.service(action);
      const expected = action === 'stop' ? false : true;
      const next = action === 'status' ? normalizeStatus(await boxBridge.status()) : await waitForStatus(expected);
      if ((action === 'start' || action === 'restart') && !next.running) {
        await emergencyNetworkCleanup();
        throw new Error('ядро не запустилось; TPROXY автоматически отключён');
      }
      setStatus(next);
      notify(action === 'stop' ? 'Прокси остановлен' : 'Прокси работает');
    } catch (e) {
      if (action === 'start' || action === 'restart') await emergencyNetworkCleanup();
      notify(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally { setActionLoading(null); }
  };

  const handleToggle = (key: string, value: boolean) => setConfig(prev => ({ ...prev, [key]: value ? 1 : 0 }));
  const handleChange = <K extends keyof BoxConfig>(key: K, value: BoxConfig[K]) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleSaveAndApply = async () => {
    setActionLoading('save');
    try {
      const next = { ...config };
      let appsChanged = false;
      for (const key of Object.keys(next)) {
        if (next[key] === originalConfig[key]) continue;
        if (['APP_PROXY_ENABLE','APP_PROXY_MODE','PROXY_APPS_LIST','BYPASS_APPS_LIST'].includes(key)) { appsChanged = true; continue; }
        const value = next[key];
        if (TOGGLES.has(key)) await boxBridge.toggle(key, value as 0 | 1);
        else if (NUMBERS.has(key)) await boxBridge.setNumber(key, value as string | number);
        else await boxBridge.setConfig(key, String(value ?? ''));
      }
      if (appsChanged) {
        const mode = next.APP_PROXY_ENABLE === 1 ? (next.APP_PROXY_MODE || 'blacklist') : 'disable';
        const list = next.APP_PROXY_MODE === 'whitelist' ? (next.PROXY_APPS_LIST || '') : (next.BYPASS_APPS_LIST || '');
        await boxBridge.setApps(mode, String(list));
      }
      setOriginalConfig(next);
      if (status.running) await handleServiceAction('restart');
      notify('Настройки сохранены');
    } catch (e) {
      notify(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally { setActionLoading(null); }
  };

  const handleToggleAutoStart = async (value: boolean) => {
    await boxBridge.manualMode(value ? 'disable' : 'enable');
    setStatus(prev => ({ ...prev, autoStart: value }));
  };

  return { loading, status, config, appList, actionLoading, hasChanges, handleServiceAction, handleToggle, handleChange, handleSaveAndApply, handleToggleAutoStart };
}
