import React, { useState, useMemo } from 'react';
import { useSaleStore } from '@/stores/useSaleStore';
import { useProductStore } from '@/stores/useProductStore';
import { StatCard } from '@/components/ui/StatCard';
import { NovaCard } from '@/components/ui/NovaCard';
import { getStockStatus, cn } from '@/lib/utils';
import { DollarSign, ShoppingCart, TrendingUp, Percent, Download } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { exportCSV, exportPDF } from '@/lib/export';
import { toast } from 'sonner';
import { formatPrice, formatDate, formatTime } from '@/utils/formatters';

type Period = 'today' | 'week' | 'month';

const RapportsPage: React.FC = () => {
  const { sales } = useSaleStore();
  const { products } = useProductStore();
  const [period, setPeriod] = useState<Period>('week');

  const now = new Date();
  const periodStart = useMemo(() => {
    const d = new Date(now);
    if (period === 'today') { d.setHours(0, 0, 0, 0); }
    else if (period === 'week') { d.setDate(d.getDate() - 7); }
    else { d.setMonth(d.getMonth() - 1); }
    return d;
  }, [period]);

  const periodSales = sales.filter(s => new Date(s.date) >= periodStart);
  const totalRevenue = periodSales.reduce((sum, s) => sum + s.total, 0);
  const avgCart = periodSales.length > 0 ? Math.round(totalRevenue / periodSales.length) : 0;
  const totalCost = periodSales.reduce((sum, s) => sum + s.items.reduce((isum, item) => {
    const product = products.find(p => p.id === item.productId);
    return isum + (product ? product.prixAchat * item.quantity : 0);
  }, 0), 0);
  const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0;

  // Daily chart
  const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
  const chartData = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const daySales = sales.filter(s => { const sd = new Date(s.date); return sd >= dayStart && sd < dayEnd; });
    return { name: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), total: daySales.reduce((sum, s) => sum + s.total, 0) };
  });

  // Top 10 products
  const productMap = new Map<string, { nom: string; qty: number; revenue: number }>();
  periodSales.forEach(s => s.items.forEach(item => {
    const e = productMap.get(item.productId);
    const rev = item.quantity * item.prixVente;
    if (e) { e.qty += item.quantity; e.revenue += rev; }
    else { productMap.set(item.productId, { nom: item.nom, qty: item.quantity, revenue: rev }); }
  }));
  const top10 = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Payment distribution (no credit)
  const paymentDist = [
    { name: 'Espèces', value: periodSales.filter(s => s.paymentMode === 'especes').reduce((sum, s) => sum + s.total, 0), color: '#2B6954' },
    { name: 'Mobile Money', value: periodSales.filter(s => s.paymentMode === 'mobile_money').reduce((sum, s) => sum + s.total, 0), color: '#A93200' },
  ].filter(d => d.value > 0);

  // Critical stock
  const criticalProducts = products.filter(p => getStockStatus(p.stock, p.seuilAlerte) !== 'ok')
    .map(p => ({ ...p, recommended: Math.max(0, p.seuilAlerte * 3 - p.stock) }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-headline-lg nova-heading text-foreground">Rapports</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            <button onClick={() => {
              const headers = ['#', 'Produit', 'Quantité', 'Revenu', '% du total'];
              const rows = top10.map((p, i) => [String(i + 1), p.nom, String(p.qty), formatPrice(p.revenue), totalRevenue > 0 ? (p.revenue / totalRevenue * 100).toFixed(1) + '%' : '0%']);
              exportCSV('rapport-ventes', headers, rows);
              toast.success('Export CSV téléchargé');
            }} className="nova-btn-secondary flex items-center gap-2 px-3 py-2 text-sm">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={() => {
              const headers = ['#', 'Produit', 'Quantité', 'Revenu', '% du total'];
              const rows = top10.map((p, i) => [String(i + 1), p.nom, String(p.qty), formatPrice(p.revenue), totalRevenue > 0 ? (p.revenue / totalRevenue * 100).toFixed(1) + '%' : '0%']);
              const summary = [`<strong>${formatPrice(totalRevenue)}</strong>Revenu total`, `<strong>${periodSales.length}</strong>Ventes`, `<strong>${formatPrice(avgCart)}</strong>Panier moyen`, `<strong>${margin.toFixed(1)}%</strong>Marge`];
              exportPDF('Rapport des ventes — Legwan', headers, rows, summary);
            }} className="nova-btn-secondary flex items-center gap-2 px-3 py-2 text-sm">
              <Download className="w-4 h-4" /> PDF
            </button>
          </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([['today', "Aujourd'hui"], ['week', 'Cette semaine'], ['month', 'Ce mois']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setPeriod(k)} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all', period === k ? 'bg-card text-foreground ' : 'text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        <StatCard icon={<DollarSign className="w-4 h-4 text-primary" />} iconBg="bg-primary/20" value={formatPrice(totalRevenue)} label="Revenu total" />
        <StatCard icon={<ShoppingCart className="w-4 h-4 text-secondary" />} iconBg="bg-secondary/20" value={String(periodSales.length)} label="Nombre de ventes" />
        <StatCard icon={<TrendingUp className="w-4 h-4 text-amber-400" />} iconBg="bg-amber-500/20" value={formatPrice(avgCart)} label="Panier moyen" />
        <StatCard icon={<Percent className="w-4 h-4 text-emerald-400" />} iconBg="bg-emerald-500/20" value={`${margin.toFixed(1)}%`} label="Marge bénéficiaire" />
      </div>

      {/* Chart */}
      <NovaCard accent title="Évolution des ventes" className="mb-6">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="rapportGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A93200" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#A93200" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" stroke="#8B8FA8" fontSize={11} />
              <YAxis stroke="#8B8FA8" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5ddd8', borderRadius: '8px', color: '#1a1c1c' }} formatter={(value: number) => [formatPrice(value), 'Total']} />
              <Area type="monotone" dataKey="total" stroke="#A93200" strokeWidth={2} fill="url(#rapportGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </NovaCard>

      {/* Top products + Payment pie */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <NovaCard accent title="Top 10 produits" className="col-span-1 lg:col-span-3">
          <div className="overflow-x-auto"><table className="w-full">
            <thead>
              <tr className="nova-table-header">
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Produit</th>
                <th className="text-right p-2">Qté</th>
                <th className="text-right p-2">Revenu</th>
                <th className="text-right p-2">%</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((p, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2 text-sm text-muted-foreground">{i + 1}</td>
                  <td className="p-2 text-sm text-foreground">{p.nom}</td>
                  <td className="p-2 text-sm text-right text-foreground tabular-nums">{p.qty}</td>
                  <td className="p-2 text-sm text-right font-medium text-foreground tabular-nums">{formatPrice(p.revenue)}</td>
                  <td className="p-2 text-sm text-right text-muted-foreground tabular-nums">{totalRevenue > 0 ? (p.revenue / totalRevenue * 100).toFixed(1) : '0'}%</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </NovaCard>

        <NovaCard accent title="Répartition par paiement" className="col-span-1 lg:col-span-2">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                  {paymentDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5ddd8', borderRadius: '8px', color: '#1a1c1c' }} formatter={(value: number) => [formatPrice(value)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2 mt-2">
            {paymentDist.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-lg" style={{ backgroundColor: d.color }} />
                <span className="text-muted-foreground flex-1">{d.name}</span>
                <span className="text-foreground tabular-nums">{formatPrice(d.value)}</span>
              </div>
            ))}
          </div>
        </NovaCard>
      </div>

      {/* Critical stock */}
      <NovaCard accent title="Stock critique — Commandes recommandées">
        {criticalProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun produit en stock critique</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead>
              <tr className="nova-table-header">
                <th className="text-left p-2">Produit</th>
                <th className="text-right p-2">Stock actuel</th>
                <th className="text-right p-2">Seuil</th>
                <th className="text-right p-2">Qté recommandée</th>
              </tr>
            </thead>
            <tbody>
              {criticalProducts.map(p => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-2 text-sm text-foreground">{p.nom}</td>
                  <td className={cn('p-2 text-sm text-right tabular-nums', p.stock <= 0 ? 'text-destructive' : 'text-amber-400')}>{p.stock}</td>
                  <td className="p-2 text-sm text-right text-muted-foreground tabular-nums">{p.seuilAlerte}</td>
                  <td className="p-2 text-sm text-right font-medium text-primary tabular-nums">{p.recommended}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </NovaCard>
    </div>
  );
};

export default RapportsPage;
