import React, { useState, useMemo } from 'react';
import { useSaleStore } from '@/stores/useSaleStore';
import { useCaisseStore } from '@/stores/useCaisseStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatFCFA, formatDateShort, formatTime, cn } from '@/lib/utils';
import { Calculator, Check, DollarSign, Smartphone, History, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const denominations = [
  { label: '10 000', value: 10000, type: 'billet' },
  { label: '5 000', value: 5000, type: 'billet' },
  { label: '2 000', value: 2000, type: 'billet' },
  { label: '1 000', value: 1000, type: 'billet' },
  { label: '500', value: 500, type: 'billet' },
  { label: '100', value: 100, type: 'piece' },
  { label: '50', value: 50, type: 'piece' },
  { label: '25', value: 25, type: 'piece' },
  { label: '10', value: 10, type: 'piece' },
  { label: '5', value: 5, type: 'piece' },
];

const ClotureCaissePage: React.FC = () => {
  const { sales } = useSaleStore();
  const { clotures, fondDeCaisse, addCloture } = useCaisseStore();
  const { currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'cloture' | 'historique'>('cloture');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [isDone, setIsDone] = useState(false);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const todaySales = useMemo(() =>
    sales.filter(s => {
      const sd = new Date(s.date);
      return sd >= today && (!('status' in s) || (s as any).status !== 'refunded');
    }),
    [sales, today]
  );

  const totalEspeces = todaySales
    .filter(s => s.paymentMode === 'especes')
    .reduce((sum, s) => sum + s.total, 0);

  const totalMobile = todaySales
    .filter(s => s.paymentMode === 'mobile_money')
    .reduce((sum, s) => sum + s.total, 0);

  const totalAttendu = totalEspeces + fondDeCaisse;

  const totalCompte = useMemo(() => {
    return denominations.reduce((sum, d) => {
      const qty = parseInt(counts[d.value] || '0', 10) || 0;
      return sum + qty * d.value;
    }, 0);
  }, [counts]);

  const ecart = totalCompte - totalAttendu;

  const handleCountChange = (denomination: number, value: string) => {
    setCounts(prev => ({ ...prev, [denomination]: value }));
  };

  const handleValidate = () => {
    if (!currentUser) return;
    if (totalCompte === 0) {
      toast.error('Veuillez compter la caisse avant de valider');
      return;
    }

    const details: Record<string, number> = {};
    denominations.forEach(d => {
      const qty = parseInt(counts[d.value] || '0', 10) || 0;
      if (qty > 0) details[String(d.value)] = qty;
    });

    addCloture({
      date: new Date().toISOString(),
      userId: currentUser.id,
      userName: `${currentUser.prenom} ${currentUser.nom}`,
      totalVentesEspeces: totalEspeces,
      totalVentesMobile: totalMobile,
      totalAttendu,
      totalCompte,
      ecart,
      details,
      notes: notes || undefined,
    });

    setIsDone(true);
    toast.success('Clôture de caisse validée !');
    setTimeout(() => {
      setIsDone(false);
      setCounts({});
      setNotes('');
    }, 2000);
  };

  return (
    <div className="p-4 lg:p-8 animate-fade-in">
      <h1 className="text-2xl nova-heading text-foreground mb-6">Clôture de caisse</h1>

      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('cloture')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2', activeTab === 'cloture' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
          <Calculator className="w-4 h-4" /> Clôture du jour
        </button>
        <button onClick={() => setActiveTab('historique')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2', activeTab === 'historique' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
          <History className="w-4 h-4" /> Historique
        </button>
      </div>

      {activeTab === 'cloture' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={<DollarSign className="w-4 h-4 text-primary" />} iconBg="bg-primary/20" value={formatFCFA(totalEspeces)} label="Ventes espèces" />
            <StatCard icon={<Smartphone className="w-4 h-4 text-secondary" />} iconBg="bg-secondary/20" value={formatFCFA(totalMobile)} label="Ventes Mobile Money" />
            <StatCard icon={<Calculator className="w-4 h-4 text-amber-400" />} iconBg="bg-amber-500/20" value={formatFCFA(fondDeCaisse)} label="Fond de caisse" />
            <StatCard icon={<DollarSign className="w-4 h-4 text-emerald-400" />} iconBg="bg-emerald-500/20" value={formatFCFA(totalAttendu)} label="Total attendu en caisse" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Comptage */}
            <NovaCard accent title="Comptage physique de la caisse" className="lg:col-span-3">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-4">Saisissez le nombre de chaque coupure/pièce comptée</p>
                <div className="grid grid-cols-2 gap-3">
                  {denominations.map(d => (
                    <div key={d.value} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                      <span className={cn('text-sm font-medium w-20', d.type === 'billet' ? 'text-emerald-400' : 'text-amber-400')}>
                        {d.label} F
                      </span>
                      <span className="text-xs text-muted-foreground">×</span>
                      <input
                        type="number"
                        min="0"
                        value={counts[d.value] || ''}
                        onChange={e => handleCountChange(d.value, e.target.value)}
                        className="nova-input w-20 py-1 px-2 text-center text-sm"
                        placeholder="0"
                      />
                      <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                        = {formatFCFA((parseInt(counts[d.value] || '0', 10) || 0) * d.value)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <label className="text-xs text-muted-foreground mb-1 block">Notes (optionnel)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} className="nova-input w-full h-16 resize-none" placeholder="Observations..." />
                </div>
              </div>
            </NovaCard>

            {/* Résultat */}
            <NovaCard accent title="Résultat" className="lg:col-span-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Montant compté</span>
                    <span className="text-foreground font-medium tabular-nums">{formatFCFA(totalCompte)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Montant attendu</span>
                    <span className="text-foreground font-medium tabular-nums">{formatFCFA(totalAttendu)}</span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-foreground">Écart</span>
                      <span className={cn(
                        'text-2xl font-bold tabular-nums',
                        ecart === 0 ? 'text-emerald-400' : ecart > 0 ? 'text-amber-400' : 'text-destructive'
                      )}>
                        {ecart >= 0 ? '+' : ''}{formatFCFA(ecart)}
                      </span>
                    </div>
                    <p className={cn('text-sm mt-1', ecart === 0 ? 'text-emerald-400' : ecart > 0 ? 'text-amber-400' : 'text-destructive')}>
                      {ecart === 0 ? '✓ Caisse exacte' : ecart > 0 ? '⚠ Excédent en caisse' : '⚠ Manque en caisse'}
                    </p>
                  </div>
                </div>

                {ecart < -500 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-xs text-destructive">Écart important détecté. Vérifiez le comptage ou signalez l'anomalie.</p>
                  </div>
                )}

                <div className="pt-4 space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {todaySales.length} vente{todaySales.length > 1 ? 's' : ''} aujourd'hui • Caissier : {currentUser?.prenom} {currentUser?.nom}
                  </div>
                  <button
                    onClick={handleValidate}
                    disabled={isDone}
                    className={cn(
                      'w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
                      isDone ? 'bg-secondary text-secondary-foreground' : 'nova-btn-primary'
                    )}
                  >
                    {isDone ? <><Check className="w-4 h-4" /> Clôture enregistrée</> : 'Valider la clôture'}
                  </button>
                </div>
              </div>
            </NovaCard>
          </div>
        </>
      )}

      {activeTab === 'historique' && (
        <NovaCard accent>
          {clotures.length === 0 ? (
            <EmptyState icon={<History className="w-12 h-12" />} title="Aucune clôture" description="Les clôtures de caisse apparaîtront ici" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="nova-table-header">
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Caissier</th>
                    <th className="text-right p-3">Espèces</th>
                    <th className="text-right p-3">Mobile</th>
                    <th className="text-right p-3">Attendu</th>
                    <th className="text-right p-3">Compté</th>
                    <th className="text-right p-3">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {clotures.map(c => (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-sm text-muted-foreground">{formatDateShort(new Date(c.date))} {formatTime(new Date(c.date))}</td>
                      <td className="p-3 text-sm text-foreground">{c.userName}</td>
                      <td className="p-3 text-sm text-right text-foreground tabular-nums">{formatFCFA(c.totalVentesEspeces)}</td>
                      <td className="p-3 text-sm text-right text-foreground tabular-nums">{formatFCFA(c.totalVentesMobile)}</td>
                      <td className="p-3 text-sm text-right text-foreground tabular-nums">{formatFCFA(c.totalAttendu)}</td>
                      <td className="p-3 text-sm text-right font-medium text-foreground tabular-nums">{formatFCFA(c.totalCompte)}</td>
                      <td className={cn('p-3 text-sm text-right font-medium tabular-nums', c.ecart === 0 ? 'text-emerald-400' : c.ecart > 0 ? 'text-amber-400' : 'text-destructive')}>
                        {c.ecart >= 0 ? '+' : ''}{formatFCFA(c.ecart)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NovaCard>
      )}
    </div>
  );
};

export default ClotureCaissePage;
