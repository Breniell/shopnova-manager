import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { StatCard } from '@/components/ui/StatCard';
import { NovaCard } from '@/components/ui/NovaCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PaymentBadge } from '@/components/ui/PaymentBadge';
import { useProductStore } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { getStockStatus } from '@/lib/utils';
import { productImages } from '@/assets/productImages';
import { DollarSign, ShoppingCart, AlertTriangle, Package, Plus, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import { formatPrice, formatFCFA, formatTime } from '@/utils/formatters';

const DashboardPage: React.FC = () => {
  const { products } = useProductStore();
  const { sales } = useSaleStore();
  const navigate = useNavigate();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Exclude refunded sales from all calculations
  const activeSales = sales.filter(s => s.status !== 'refunded');

  const todaySales = activeSales.filter(s => new Date(s.date) >= today);
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const outOfStock = products.filter(p => p.stock <= 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.seuilAlerte);
  const totalStockValue = products.reduce((sum, p) => sum + p.prixVente * p.stock, 0);

  // Dynamic trends vs yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayEnd = new Date(today);
  const yesterdaySales = activeSales.filter(s => {
    const sd = new Date(s.date);
    return sd >= yesterday && sd < yesterdayEnd;
  });
  const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + s.total, 0);

  const revenueTrend = yesterdayRevenue > 0
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100).toFixed(0)
    : null;

  const salesTrend = yesterdaySales.length > 0
    ? ((todaySales.length - yesterdaySales.length) / yesterdaySales.length * 100).toFixed(0)
    : null;

  // Last 7 days chart data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const daySales = activeSales.filter(s => {
      const sd = new Date(s.date);
      return sd >= dayStart && sd < dayEnd;
    });
    return {
      name: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
      total: daySales.reduce((sum, s) => sum + s.total, 0),
    };
  });

  // Top 5 products (exclude refunded)
  const productSalesMap = new Map<string, { nom: string; qty: number }>();
  activeSales.forEach(s => {
    s.items.forEach(item => {
      const existing = productSalesMap.get(item.productId);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        productSalesMap.set(item.productId, { nom: item.nom, qty: item.quantity });
      }
    });
  });
  const top5 = Array.from(productSalesMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const lastSales = activeSales.slice(0, 5);
  const alertProducts = [...outOfStock, ...lowStock].slice(0, 5);

  return (
    <div className="animate-fade-in">
      <TopBar />

      <div className="px-4 sm:px-6 lg:px-8 pb-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <StatCard
            icon={<DollarSign className="w-4 h-4 text-primary" />}
            iconBg="bg-primary/20"
            value={formatFCFA(todayRevenue)}
            label="Chiffre d'affaires du jour"
            trend={revenueTrend !== null ? {
              value: `${Number(revenueTrend) >= 0 ? '+' : ''}${revenueTrend}% vs hier`,
              positive: Number(revenueTrend) >= 0
            } : undefined}
          />
          <StatCard
            icon={<ShoppingCart className="w-4 h-4 text-secondary" />}
            iconBg="bg-secondary/20"
            value={String(todaySales.length)}
            label="Ventes aujourd'hui"
            trend={salesTrend !== null ? {
              value: `${Number(salesTrend) >= 0 ? '+' : ''}${salesTrend}% vs hier`,
              positive: Number(salesTrend) >= 0
            } : undefined}
          />
          <StatCard
            icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
            iconBg="bg-destructive/20"
            value={String(outOfStock.length)}
            label="Produits en rupture"
          />
          <StatCard
            icon={<Package className="w-4 h-4 text-amber-400" />}
            iconBg="bg-amber-500/20"
            value={formatFCFA(totalStockValue)}
            label="Valeur du stock total"
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <NovaCard accent title="Ventes des 7 derniers jours" className="col-span-1 lg:col-span-3">
            <div className="h-[180px] sm:h-[220px] lg:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={last7Days}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A93200" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#A93200" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" stroke="#8B8FA8" fontSize={12} />
                  <YAxis stroke="#8B8FA8" fontSize={12} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5ddd8', borderRadius: '8px', color: '#1a1c1c' }}
                    formatter={(value: number) => [formatFCFA(value), 'Total']}
                  />
                  <Area type="monotone" dataKey="total" stroke="#A93200" strokeWidth={2} fill="url(#areaGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </NovaCard>

          <NovaCard accent title="Top 5 produits vendus" className="col-span-1 lg:col-span-2">
            <div className="h-[180px] sm:h-[220px] lg:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5} layout="vertical">
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#A93200" />
                      <stop offset="100%" stopColor="#2B6954" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis type="number" stroke="#8B8FA8" fontSize={11} />
                  <YAxis type="category" dataKey="nom" stroke="#8B8FA8" fontSize={11} width={120} tick={{ fill: '#8B8FA8' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5ddd8', borderRadius: '8px', color: '#1a1c1c' }}
                    formatter={(value: number) => [`${value} unités`, 'Vendus']}
                  />
                  <Bar dataKey="qty" fill="url(#barGrad)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </NovaCard>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <NovaCard accent title="Alertes stock" className="col-span-1 lg:col-span-3">
            {alertProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucune alerte</p>
            ) : (
              <div className="space-y-2">
                {alertProducts.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="shrink-0">
                      {productImages[p.id] ? (
                        <img src={productImages[p.id]} alt={p.nom} className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.nom}</p>
                      <StatusBadge status={getStockStatus(p.stock, p.seuilAlerte)} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs tabular-nums text-destructive whitespace-nowrap">{p.stock}/{p.seuilAlerte}</span>
                      <button className="text-xs nova-btn-primary px-2.5 py-1.5 hidden sm:block" onClick={() => navigate('/stock')}>Commander</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </NovaCard>

          <NovaCard accent title="Dernières ventes" className="col-span-1 lg:col-span-2">
            {lastSales.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucune vente</p>
            ) : (
              <div className="space-y-2">
                {lastSales.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <span className="text-xs text-muted-foreground">{formatTime(new Date(s.date))}</span>
                      <span className="text-sm text-foreground ml-3">{s.items.length} article{s.items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(s.total)}</span>
                      <PaymentBadge mode={s.paymentMode} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </NovaCard>
        </div>

        {/* Quick action bar */}
        <div className="fixed left-1/2 -translate-x-1/2 lg:ml-[120px] flex flex-wrap justify-center gap-2 z-20 px-4"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          <button onClick={() => navigate('/caisse')} className="nova-btn-primary flex items-center gap-2 px-5 lg:px-6 py-3 rounded-full text-sm font-medium shadow-lg">
            <Plus className="w-4 h-4" /> Nouvelle vente
          </button>
          <button onClick={() => navigate('/produits')} className="hidden lg:flex nova-btn-primary items-center gap-2 px-6 py-3 rounded-full text-sm font-medium shadow-lg">
            <Package className="w-4 h-4" /> Ajouter produit
          </button>
          <button onClick={() => navigate('/stock')} className="hidden lg:flex nova-btn-primary items-center gap-2 px-6 py-3 rounded-full text-sm font-medium shadow-lg">
            <ArrowRight className="w-4 h-4" /> Entrée stock
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
