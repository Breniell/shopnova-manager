import React, { useState } from 'react';
import type { RegistryEntry } from '@/services/registryService';
import { getBoutiqueStatus, STATUS_COLORS, STATUS_LABELS } from '@/stores/useSuperAdminStore';
import { Search, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  boutiques: RegistryEntry[];
}

function toDate(v: unknown): Date {
  if (v && typeof (v as Record<string, unknown>).toDate === 'function') {
    return (v as { toDate(): Date }).toDate();
  }
  if (v instanceof Date) return v;
  return new Date(0);
}

function fmtDate(d: Date): string {
  return d.getTime() === 0
    ? '—'
    : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtFCFA(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

type SortKey = 'nom' | 'lastSeen' | 'totalRevenue' | 'totalVentes' | 'version';

export const SABoutiqueTable: React.FC<Props> = ({ boutiques }) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastSeen');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const filtered = boutiques
    .filter(b => {
      const q = search.toLowerCase();
      return (
        b.nom?.toLowerCase().includes(q) ||
        b.adresse?.toLowerCase().includes(q) ||
        b.telephone?.includes(q) ||
        b.version?.includes(q)
      );
    })
    .sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case 'nom':          av = a.nom ?? '';             bv = b.nom ?? '';           break;
        case 'lastSeen':     av = toDate(a.lastSeen).getTime(); bv = toDate(b.lastSeen).getTime(); break;
        case 'totalRevenue': av = a.stats?.totalRevenue ?? 0; bv = b.stats?.totalRevenue ?? 0; break;
        case 'totalVentes':  av = a.stats?.totalVentes ?? 0;  bv = b.stats?.totalVentes ?? 0;  break;
        case 'version':      av = a.version ?? '';         bv = b.version ?? '';       break;
        default:             av = 0; bv = 0;
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={cn(
        'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
        sortKey === k ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="nova-card overflow-hidden">
      {/* Search bar */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="nova-input pl-9 w-full text-sm"
            placeholder="Rechercher…"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} / {boutiques.length} boutiques
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="nova-table-header">
            <tr>
              <th className="px-4 py-3 text-left"><SortBtn k="nom" label="Boutique" /></th>
              <th className="px-4 py-3 text-left hidden md:table-cell">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Adresse</span>
              </th>
              <th className="px-4 py-3 text-left"><SortBtn k="lastSeen" label="Vu" /></th>
              <th className="px-4 py-3 text-right"><SortBtn k="totalRevenue" label="CA (FCFA)" /></th>
              <th className="px-4 py-3 text-right hidden sm:table-cell"><SortBtn k="totalVentes" label="Ventes" /></th>
              <th className="px-4 py-3 text-center hidden lg:table-cell">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Utilisateurs</span>
              </th>
              <th className="px-4 py-3 text-center hidden lg:table-cell">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Produits</span>
              </th>
              <th className="px-4 py-3 text-center hidden xl:table-cell"><SortBtn k="version" label="Version" /></th>
              <th className="px-4 py-3 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Statut</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Aucune boutique trouvée
                </td>
              </tr>
            )}
            {filtered.map(b => {
              const lastSeen = toDate(b.lastSeen);
              const status = getBoutiqueStatus(lastSeen);
              const color = STATUS_COLORS[status];
              return (
                <tr key={b.boutiqueId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: color + '20' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 80 80" fill="none">
                          <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
                          <line x1="20" y1="13" x2="20" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                          <line x1="20" y1="60" x2="34" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm leading-tight">{b.nom || '—'}</p>
                        <p className="text-[10px] text-muted-foreground">{b.telephone || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[160px] truncate">
                    {b.adresse || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(lastSeen)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-medium text-foreground">
                    {fmtFCFA(b.stats?.totalRevenue ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden sm:table-cell">
                    {(b.stats?.totalVentes ?? 0).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground hidden lg:table-cell">
                    {b.stats?.totalUsers ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground hidden lg:table-cell">
                    {b.stats?.totalProducts ?? '—'}
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
