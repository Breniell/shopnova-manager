import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { formatDateLong } from '@/utils/formatters';
import { useTranslation } from '@/i18n';
import { CloudOff } from 'lucide-react';
import { subscribe, getAll, retryFailed } from '@/lib/outbox';

const ROUTE_TO_KEY: Record<string, string> = {
  '/':             'nav.dashboard',
  '/caisse':       'nav.pos',
  '/clients':      'nav.clients',
  '/credit':       'nav.credit',
  '/produits':     'nav.produits',
  '/stock':        'nav.stock',
  '/inventaire':   'nav.inventaire',
  '/fournisseurs': 'nav.fournisseurs',
  '/ventes':       'nav.ventes',
  '/depenses':     'nav.depenses',
  '/cloture':      'nav.cloture',
  '/rapports':     'nav.rapports',
  '/parametres':   'nav.parametres',
};

export const TopBar: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const shop = useSettingsStore(s => s.shop);
  const initialEntries = getAll();
  const [syncState, setSyncState] = useState(() => ({
    total: initialEntries.length,
    failed: initialEntries.filter(entry => entry.status === 'failed').length,
  }));

  useEffect(() => {
    const unsub = subscribe(entries => setSyncState({
      total: entries.length,
      failed: entries.filter(entry => entry.status === 'failed').length,
    }));
    return unsub;
  }, []);

  const navKey = ROUTE_TO_KEY[location.pathname];
  const pageTitle = navKey ? t(navKey) : shop.nom;

  return (
    <div className="flex items-center justify-between px-4 lg:px-8 py-4 lg:py-5">
      <div>
        <h2 className="text-lg lg:text-xl font-semibold text-foreground nova-heading">
          {pageTitle}
        </h2>
        <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 capitalize">
          {formatDateLong(new Date())}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {syncState.total > 0 && (
          <button
            type="button"
            onClick={() => { if (syncState.failed > 0) void retryFailed(); }}
            disabled={syncState.failed === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700"
            title={syncState.failed > 0
              ? `${syncState.failed} enregistrement(s) en échec — cliquer pour relancer`
              : `${syncState.total} enregistrement(s) en attente de synchronisation`}
          >
            <CloudOff className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold tabular-nums">{syncState.total}</span>
          </button>
        )}
      </div>
    </div>
  );
};
