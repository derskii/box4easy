import type { ReactNode } from 'react';
import type { EasyCore, EasyNode, LatencyResult } from '@/lib/easy';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[28px] bg-white shadow-sm dark:bg-[#211f26] ${className}`}>{children}</section>;
}

export function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={() => onChange(!value)} className={`relative h-8 w-14 rounded-full p-1 transition disabled:opacity-40 ${value ? 'bg-[#6750a4]' : 'bg-[#79747e]'}`}><span className={`block h-6 w-6 rounded-full bg-white shadow transition ${value ? 'translate-x-6' : ''}`} /></button>;
}

export function compatibleNode(node: EasyNode, core: EasyCore) {
  if (core === 'sing-box') return node.server.rawKind !== 'xray';
  if (core === 'xray' || core === 'v2ray') return node.server.rawKind !== 'sing-box' && String(node.server.proxy?.type || '').toLowerCase() !== 'hysteria2';
  return !node.server.rawKind;
}

export function latencyText(value?: LatencyResult) {
  if (!value) return '—';
  if (value.error || !value.latencyMs) return 'ERR';
  return `${value.latencyMs} ms`;
}

export function latencyClass(value?: LatencyResult) {
  if (!value || value.error || !value.latencyMs) return 'bg-[#f3edf7] text-[#79747e] dark:bg-[#2b2930]';
  if (value.latencyMs < 120) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (value.latencyMs < 260) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
}
