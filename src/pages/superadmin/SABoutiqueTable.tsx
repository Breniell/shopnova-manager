import React, { useState } from 'react';
import type { RegistryEntry } from '@/services/registryService';
import { getBoutiqueStatus, STATUS_COLORS, STATUS_LABELS } from '@/stores/useSuperAdminStore';
import { useTranslation } from '@/i18n';
import { getCurrentBcp47 } from '@/utils/formatters';
import { Search, ArrowUpDown, Download, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SABoutiqueDetail } from './SABoutiqueDetail';

interface Props {
  boutiques: RegistryEntry[];
}

function toDate(v: unknown): Date {
  if (v && typeof (v as Record<string, unknown>).toDate === 'function')
    return (v as { toDate(): Date }).toDate();
  if (v instanceof Date) return v;
  return new Date(0);
}

function fmtDate(d: Date): string {
  return d.getTime() === 0
    ? '—'
    : d.toLocaleString(getCurrentBcp47(), { dateStyle: 'short', timeStyle: 'short' });
}

type SortKey     = 'nom' | 'lastSeen' | 'usersCount' | 'version';
type StatusFilter = 'all' | 'active' | 'recent' | 'inactive';

const PLATFORM_LABELS: Record<string, string> = {
  windows: 'Windows',
  macos:   'macOS',
  linux:   'Linux',
  web:     'Web',
  unknown: '?',
};

export const SABoutiqueTable: React.FC<Props> = ({ boutiques }) => {
  const { t } = useTranslation();
  const [search,         setSearch]         = useState('');
  const [sortKey,        setSortKey]        = useState<SortKey>('lastSeen');
  const [sortAsc,        setSortAsc]        = useState(false);
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [selected,       setSelected]       = useState<RegistryEntry | null>(null);

  const platforms = [
    'all',
    ...new Set(boutiques.map(b => b.platform?.toLowerCase() ?? 'unknown')),
  ];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const filtered = boutiques
    .filter(b => {
      if (statusFilter !== 'all' && getBoutiqueStatus(toDate(b.lastSeen)) !== statusFilter) return false;
      if (platformFilter !== 'all' && (b.platform?.toLowerCase() ?? 'unknown') !== platformFilter) return false;
      const q = search.toLowerCase();
      return !q || (
        b.nom?.toLowerCase().includes(q) ||
        b.adresse?.toLowerCase().includes(q) ||
        b.telephone?.includes(q) ||
        b.version?.includes(q) ||
        b.location?.city?.toLowerCase().includes(q) ||
        b.location?.country?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case 'nom':        av = a.nom ?? '';                     bv = b.nom ?? '';                    break;
        case 'lastSeen':   av = toDate(a.lastSeen).getTime();    bv = toDate(b.lastSeen).getTime();   break;
        case 'usersCount': av = a.health?.usersCount ?? 0;       bv = b.health?.usersCount ?? 0;      break;
        case 'version':    av = a.version ?? '';                 bv = b.version ?? '';                break;
        default:           av = 0; bv = 0;
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });

  const statusCounts = {
    all:      boutiques.length,
    active:   boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'active').length,
    recent:   boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'recent').length,
    inactive: boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'inactive').length,
  };

  const exportCSV = () => {
    const headers = [
      t('superadmin.csvNom'), t('superadmin.csvPhone'), t('superadmin.csvAddress'), t('superadmin.csvStatus'),
      t('superadmin.tableColUsers'), t('superadmin.tableColActive30j'),
      t('superadmin.csvVersion'), t('superadmin.csvPlatform'), t('superadmin.csvLastSeen'), t('superadmin.csvRegistered'),
    ];
    const rows = filtered.map(b => {
      const lastSeen = toDate(b.lastSeen);
      const reg      = toDate(b.registeredAt);
      return [
        b.nom ?? '', b.telephone ?? '', b.adresse ?? '',
        STATUS_LABELS[getBoutiqueStatus(lastSeen)],
        b.health?.usersCount ?? 0,
        b.health?.isActive ? '1' : '0',
        b.version ?? '',
        b.platform ?? '',
        fmtDate(lastSeen),
        fmtDate(reg),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `legwan-boutiques-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={cn(
        'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
        sortKey === k ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <>
      <div className="nova-card overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="nova-input pl-9 w-full text-sm"
                placeholder={t('superadmin.tableSearch')}
              />
            </div>

            {/* Platform filter */}
            {platforms.length > 2 && (
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <select
                  value={platformFilter}
                  onChange={e => setPlatformFilter(e.target.value)}
                  className="text-xs bg-muted text-foreground rounded-lg px-2 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="all">{t('superadmin.tableAllPlatforms')}</option>
                  {platforms.filter(p => p !== 'all').map(p => (
                    <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {filtered.length} / {boutiques.length}
              </span>
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs hover:bg-muted/80 transition-colors"
                title={t('superadmin.tableExportCsvTitle')}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('superadmin.tableExportCsv')}</span>
              </button>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'active', 'recent', 'inactive'] as StatusFilter[]).map(s => {
              const label    = s === 'all' ? t('superadmin.tableFilterAll') : STATUS_LABELS[s];
              const count    = statusCounts[s];
              const isSelected = statusFilter === s;
              const dotColor = s !== 'all' ? STATUS_COLORS[s] : undefined;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  {dotColor && (
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: isSelected ? 'currentColor' : dotColor }}
                    />
                  )}
                  {label}
                  <span className={cn(
                    'text-[10px] rounded px-1 tabular-nums',
                    isSelected ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="nova-table-header">
              <tr>
                <th className="px-4 py-3 text-left"><SortBtn k="nom" label={t('superadmin.tableColShop')} /></th>
                <th className="px-4 py-3 text-left hidden md:table-cell">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('superadmin.tableColAddress')}
                  </span>
                </th>
                <th className="px-4 py-3 text-left"><SortBtn k="lastSeen" label={t('superadmin.tableColSeen')} /></th>
                <th className="px-4 py-3 text-center"><SortBtn k="usersCount" label={t('superadmin.tableColUsers')} /></th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('superadmin.tableColActive30j')}
                  </span>
                </th>
                <th className="px-4 py-3 text-center hidden xl:table-cell">
                  <SortBtn k="version" label="Version" />
                </th>
                <th className="px-4 py-3 text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('superadmin.tableColStatus')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {t('superadmin.tableEmpty')}
                  </td>
                </tr>
              ) : (
                filtered.map(b => {
                  const lastSeen = toDate(b.lastSeen);
                  const status   = getBoutiqueStatus(lastSeen);
                  const color    = STATUS_COLORS[status];
                  const location = b.location?.city ?? b.location?.country ?? b.adresse ?? '—';
                  const isActive30j = b.health?.isActive ?? false;
                  return (
                    <tr
                      key={b.boutiqueId}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelected(b)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: color + '20' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 80 80" fill="none">
                              <path
                                d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42"
                                stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                              />
                              <line x1="20" y1="13" x2="20" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                              <line x1="20" y1="60" x2="34" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm leading-tight">
                              {b.nom || '—'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{b.telephone || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[160px] truncate">
                        {location}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(lastSeen)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-medium text-foreground">
                        {b.health?.usersCount ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          isActive30j
                            ? 'bg-secondary/15 text-secondary'
                            : 'bg-muted text-muted-foreground',
                        )}>
                          {isActive30j ? '✓' : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        <span className="text-[10px] font-mono bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground">
                          v{b.version || '?'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ color, backgroundColor: color + '20' }}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <SABoutiqueDetail boutique={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
};
