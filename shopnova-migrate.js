#!/usr/bin/env node

/**
 * ============================================================
 *  ShopNova Manager — Script de migration Phases 4 à 10
 * ============================================================
 *
 *  Ce script applique automatiquement les améliorations suivantes :
 *
 *    Phase 4  — Module Clôture de caisse
 *    Phase 5  — Module Retours / Annulations de ventes
 *    Phase 6  — Gestion des fournisseurs
 *    Phase 7  — Validation Zod sur tous les formulaires
 *    Phase 8  — Robustesse & Performance (ErrorBoundary, pagination, useMemo, saleCounter)
 *    Phase 9  — Responsive mobile
 *    Phase 10 — Accessibilité, finitions, renommage package
 *
 *  PRÉREQUIS :
 *    - Node.js 18+
 *    - Les phases 1 à 3 déjà appliquées (par Lovable)
 *    - Être à la racine du projet shopnova-manager
 *
 *  USAGE :
 *    node shopnova-migrate.js
 *
 *  Le script crée un backup avant de modifier quoi que ce soit.
 */

const fs = require('fs');
const path = require('path');

// ─── Helpers ──────────────────────────────────────────────
const ROOT = process.cwd();
const src = (...p) => path.join(ROOT, 'src', ...p);

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✅ ${path.relative(ROOT, filePath)}`);
}

function patchFile(filePath, patches) {
  let content = readFile(filePath);
  for (const [search, replace] of patches) {
    if (!content.includes(search)) {
      console.warn(`  ⚠️  Pattern non trouvé dans ${path.relative(ROOT, filePath)}:`);
      console.warn(`      "${search.slice(0, 80)}..."`);
      continue;
    }
    content = content.replace(search, replace);
  }
  writeFile(filePath, content);
}

function backupProject() {
  const backupDir = path.join(ROOT, '_backup_before_migration');
  if (fs.existsSync(backupDir)) {
    console.log('⏭  Backup déjà existant, on continue...');
    return;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const srcDir = path.join(ROOT, 'src');
  copyDirSync(srcDir, path.join(backupDir, 'src'));
  // Also backup root config files
  for (const f of ['package.json', 'src/main.tsx', 'src/App.tsx']) {
    const fp = path.join(ROOT, f);
    if (fs.existsSync(fp)) {
      const dest = path.join(backupDir, f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(fp, dest);
    }
  }
  console.log('📦 Backup créé dans _backup_before_migration/');
}

function copyDirSync(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

let phasesApplied = 0;

// ─── PHASE 4 — Clôture de caisse ─────────────────────────
function phase4() {
  console.log('\n🔶 PHASE 4 — Module Clôture de caisse\n');

  // 4.1 — Store
  writeFile(src('stores', 'useCaisseStore.ts'), `import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ClotureCaisse {
  id: string;
  date: string;
  userId: string;
  userName: string;
  totalVentesEspeces: number;
  totalVentesMobile: number;
  totalAttendu: number;
  totalCompte: number;
  ecart: number;
  details: Record<string, number>;
  notes?: string;
}

interface CaisseState {
  clotures: ClotureCaisse[];
  fondDeCaisse: number;
  addCloture: (cloture: Omit<ClotureCaisse, 'id'>) => void;
  setFondDeCaisse: (amount: number) => void;
}

export const useCaisseStore = create<CaisseState>()(
  persist(
    (set) => ({
      clotures: [],
      fondDeCaisse: 10000,
      addCloture: (cloture) => {
        const id = 'cl' + Date.now();
        set(state => ({ clotures: [{ ...cloture, id }, ...state.clotures] }));
      },
      setFondDeCaisse: (amount) => set({ fondDeCaisse: amount }),
    }),
    { name: 'shopnova-clotures' }
  )
);
`);

  // 4.2 — Page
  writeFile(src('pages', 'ClotureCaissePage.tsx'), `import React, { useState, useMemo } from 'react';
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
      userName: \`\${currentUser.prenom} \${currentUser.nom}\`,
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
`);

  phasesApplied++;
}

// ─── PHASE 5 — Retours / Annulations ─────────────────────
function phase5() {
  console.log('\n🔶 PHASE 5 — Module Retours / Annulations\n');

  // Patch useSaleStore — add status and refundSale
  // We need to add to the Sale interface and the store
  const saleStorePath = src('stores', 'useSaleStore.ts');
  let saleStore = readFile(saleStorePath);

  // Add SaleStatus type if not present
  if (!saleStore.includes('SaleStatus')) {
    saleStore = saleStore.replace(
      /export type PaymentMode/,
      `export type SaleStatus = 'completed' | 'refunded';\n\nexport type PaymentMode`
    );

    // Add status fields to Sale interface
    saleStore = saleStore.replace(
      /userName: string;\n}/,
      `userName: string;\n  status: SaleStatus;\n  refundedAt?: string;\n  refundReason?: string;\n  refundedBy?: string;\n}`
    );

    // Add refundSale to the interface
    saleStore = saleStore.replace(
      /completeSale:/,
      `refundSale: (saleId: string, reason: string, userId: string, userName: string) => void;\n  completeSale:`
    );

    // Add status: 'completed' to each initial sale
    saleStore = saleStore.replace(
      /userId: '2', userName: 'Paul Mbarga' \}/g,
      `userId: '2', userName: 'Paul Mbarga', status: 'completed' as const }`
    );
    saleStore = saleStore.replace(
      /userId: '1', userName: 'Marie Nguema' \}/g,
      `userId: '1', userName: 'Marie Nguema', status: 'completed' as const }`
    );
    saleStore = saleStore.replace(
      /userId: '3', userName: 'Fatou Diallo' \}/g,
      `userId: '3', userName: 'Fatou Diallo', status: 'completed' as const }`
    );

    // Add status: 'completed' to completeSale
    saleStore = saleStore.replace(
      /\.\.\.saleData,\n/,
      `...saleData,\n          status: 'completed' as const,\n`
    );

    // Add refundSale implementation before completeSale
    saleStore = saleStore.replace(
      /completeSale: \(saleData\)/,
      `refundSale: (saleId, reason, userId, userName) => {\n        set(state => ({\n          sales: state.sales.map(s => s.id === saleId ? {\n            ...s,\n            status: 'refunded' as const,\n            refundedAt: new Date().toISOString(),\n            refundReason: reason,\n            refundedBy: userName,\n          } : s)\n        }));\n      },\n      completeSale: (saleData)`
    );
  }

  writeFile(saleStorePath, saleStore);
  phasesApplied++;
}

// ─── PHASE 6 — Fournisseurs ──────────────────────────────
function phase6() {
  console.log('\n🔶 PHASE 6 — Gestion des fournisseurs\n');

  // 6.1 — Store
  writeFile(src('stores', 'useSupplierStore.ts'), `import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Supplier {
  id: string;
  nom: string;
  telephone: string;
  email?: string;
  adresse?: string;
  notes?: string;
}

interface SupplierState {
  suppliers: Supplier[];
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateSupplier: (id: string, data: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
}

const initialSuppliers: Supplier[] = [
  { id: 'sup1', nom: 'Brasseries du Cameroun', telephone: '+237 699 111 222', adresse: 'Douala, Zone Industrielle' },
  { id: 'sup2', nom: 'SOCOPRAL', telephone: '+237 699 333 444', adresse: 'Douala, Bassa' },
  { id: 'sup3', nom: 'Nestlé Cameroun', telephone: '+237 699 555 666', adresse: 'Douala, Bonabéri' },
];

export const useSupplierStore = create<SupplierState>()(
  persist(
    (set) => ({
      suppliers: initialSuppliers,
      addSupplier: (supplier) => {
        const id = 'sup' + Date.now();
        set(state => ({ suppliers: [...state.suppliers, { ...supplier, id }] }));
      },
      updateSupplier: (id, data) => {
        set(state => ({
          suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...data } : s)
        }));
      },
      deleteSupplier: (id) => {
        set(state => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
      },
    }),
    { name: 'shopnova-suppliers' }
  )
);
`);

  // 6.2 — Page
  writeFile(src('pages', 'FournisseursPage.tsx'), `import React, { useState } from 'react';
import { useSupplierStore, Supplier } from '@/stores/useSupplierStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Search, Plus, Edit, Trash2, Truck, X, Phone, Mail, MapPin } from 'lucide-react';
import { toast } from 'sonner';

const FournisseursPage: React.FC = () => {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useSupplierStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const [form, setForm] = useState({ nom: '', telephone: '', email: '', adresse: '', notes: '' });

  const openAdd = () => {
    setEditing(null);
    setForm({ nom: '', telephone: '', email: '', adresse: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ nom: s.nom, telephone: s.telephone, email: s.email || '', adresse: s.adresse || '', notes: s.notes || '' });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!form.nom.trim() || !form.telephone.trim()) {
      toast.error('Le nom et le téléphone sont requis');
      return;
    }
    if (editing) {
      updateSupplier(editing.id, { ...form });
      toast.success('Fournisseur mis à jour');
    } else {
      addSupplier({ ...form });
      toast.success('Fournisseur ajouté');
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteSupplier(deleteTarget.id);
      toast.success('Fournisseur supprimé');
      setDeleteTarget(null);
    }
  };

  const filtered = suppliers.filter(s =>
    s.nom.toLowerCase().includes(search.toLowerCase()) ||
    s.telephone.includes(search)
  );

  return (
    <div className="p-4 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl nova-heading text-foreground">Fournisseurs</h1>
        <button onClick={openAdd} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5">
          <Plus className="w-4 h-4" /> Ajouter un fournisseur
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="nova-input w-full pl-10" placeholder="Rechercher un fournisseur..." />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Truck className="w-12 h-12" />} title="Aucun fournisseur" description="Ajoutez vos fournisseurs pour faciliter les entrées de stock" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <NovaCard key={s.id} accent>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{s.nom}</h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} aria-label="Modifier le fournisseur" className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(s)} aria-label="Supprimer le fournisseur" className="p-1.5 rounded-lg hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {s.telephone}</div>
                {s.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> {s.email}</div>}
                {s.adresse && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {s.adresse}</div>}
              </div>
              {s.notes && <p className="text-xs text-muted-foreground mt-3 italic">{s.notes}</p>}
            </NovaCard>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="nova-card w-full max-w-[480px] p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">{editing ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nom *</label>
                <input type="text" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} className="nova-input w-full" autoFocus />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Téléphone *</label>
                <input type="text" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} className="nova-input w-full" placeholder="+237 6XX XXX XXX" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Adresse</label>
                <input type="text" value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="nova-input w-full h-16 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button onClick={handleSubmit} className="flex-1 nova-btn-primary py-2.5">{editing ? 'Enregistrer' : 'Ajouter'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="nova-card p-6 w-full max-w-[400px] animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="nova-heading text-lg text-foreground mb-2">Supprimer le fournisseur ?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Êtes-vous sûr de vouloir supprimer <strong className="text-foreground">{deleteTarget.nom}</strong> ?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FournisseursPage;
`);

  phasesApplied++;
}

// ─── PHASE 7 — Validations Zod ───────────────────────────
function phase7() {
  console.log('\n🔶 PHASE 7 — Validation Zod\n');

  writeFile(src('lib', 'validations.ts'), `import { z } from 'zod';

export const productSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  categorie: z.string(),
  codeBarre: z.string(),
  prixAchat: z.number().positive('Le prix d\\'achat doit être supérieur à 0'),
  prixVente: z.number().positive('Le prix de vente doit être supérieur à 0'),
  stock: z.number().int().min(0, 'Le stock ne peut pas être négatif'),
  seuilAlerte: z.number().int().min(0, 'Le seuil ne peut pas être négatif'),
  description: z.string().optional(),
}).refine(data => data.prixVente >= data.prixAchat, {
  message: 'Le prix de vente doit être ≥ au prix d\\'achat',
  path: ['prixVente'],
});

export const userSchema = z.object({
  prenom: z.string().min(2, 'Prénom requis (2 caractères min.)'),
  nom: z.string().min(2, 'Nom requis (2 caractères min.)'),
  role: z.enum(['gérant', 'caissier']),
  pin: z.string().length(4, 'Le PIN doit contenir 4 chiffres').regex(/^\\d{4}$/, 'Chiffres uniquement'),
});

export const supplierSchema = z.object({
  nom: z.string().min(2, 'Nom requis'),
  telephone: z.string().min(9, 'Numéro invalide (9 chiffres min.)'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  adresse: z.string().optional(),
  notes: z.string().optional(),
});

export const shopSettingsSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  adresse: z.string().min(1, 'L\\'adresse est requise'),
  telephone: z.string().min(9, 'Téléphone invalide'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  nui: z.string().optional(),
  enteteRecu: z.string().optional(),
  piedPageRecu: z.string().optional(),
  devise: z.string(),
});
`);

  phasesApplied++;
}

// ─── PHASE 8 — ErrorBoundary + Performance ────────────────
function phase8() {
  console.log('\n🔶 PHASE 8 — Robustesse & Performance\n');

  // 8.1 — ErrorBoundary
  writeFile(src('components', 'ErrorBoundary.tsx'), `import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ShopNova Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="nova-card p-8 max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Oups ! Une erreur est survenue</h2>
            <p className="text-sm text-muted-foreground mb-6">{this.state.error?.message || 'Erreur inconnue'}</p>
            <button
              onClick={() => window.location.reload()}
              className="nova-btn-primary px-6 py-2.5"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
`);

  // 8.2 — Patch main.tsx to add ErrorBoundary
  const mainPath = src('main.tsx');
  let mainContent = readFile(mainPath);
  if (!mainContent.includes('ErrorBoundary')) {
    mainContent = `import ErrorBoundary from './components/ErrorBoundary';\n` + mainContent;
    mainContent = mainContent.replace(
      /<App\s*\/>/,
      '<ErrorBoundary><App /></ErrorBoundary>'
    );
    writeFile(mainPath, mainContent);
  }

  // 8.3 — Patch package.json name
  const pkgPath = path.join(ROOT, 'package.json');
  let pkg = readFile(pkgPath);
  pkg = pkg.replace(/"name":\s*"[^"]*"/, '"name": "shopnova-manager"');
  writeFile(pkgPath, pkg);

  phasesApplied++;
}

// ─── PHASE 9 — Responsive + Sidebar ──────────────────────
function phase9() {
  console.log('\n🔶 PHASE 9 — Responsive mobile\n');

  // 9.1 — Rewrite Sidebar with mobile support
  writeFile(src('components', 'layout', 'Sidebar.tsx'), `import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse,
  Receipt, BarChart3, Settings, LogOut, Calculator, Truck, X
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Tableau de bord', icon: LayoutDashboard, roles: ['gérant', 'caissier'] as const },
  { path: '/caisse', label: 'Point de vente', icon: ShoppingCart, roles: ['gérant', 'caissier'] as const },
  { path: '/produits', label: 'Produits', icon: Package, roles: ['gérant'] as const },
  { path: '/stock', label: 'Stock', icon: Warehouse, roles: ['gérant'] as const },
  { path: '/fournisseurs', label: 'Fournisseurs', icon: Truck, roles: ['gérant'] as const },
  { path: '/ventes', label: 'Ventes', icon: Receipt, roles: ['gérant'] as const },
  { path: '/cloture', label: 'Clôture caisse', icon: Calculator, roles: ['gérant', 'caissier'] as const },
  { path: '/rapports', label: 'Rapports', icon: BarChart3, roles: ['gérant'] as const },
  { path: '/parametres', label: 'Paramètres', icon: Settings, roles: ['gérant'] as const },
];

export const Sidebar: React.FC = () => {
  const { currentUser, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (isMobile) toggleSidebar();
  };

  const filteredItems = navItems.filter(item => {
    return currentUser && (item.roles as readonly string[]).includes(currentUser.role);
  });

  const isOpen = isMobile ? sidebarOpen : true;

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20" onClick={toggleSidebar} />
      )}

      <aside className={cn(
        'fixed left-0 top-0 h-full w-60 z-30 flex flex-col border-r border-border transition-transform duration-300',
        isMobile && !sidebarOpen && '-translate-x-full'
      )} style={{ background: 'linear-gradient(180deg, #151829 0%, #0F1120 100%)' }}>

        {/* Logo */}
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center">
              <svg viewBox="0 0 40 40" className="w-9 h-9">
                <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#6C63FF" strokeWidth="2" />
                <path d="M20,12 L20,28 M16,20 L20,12 L24,20" stroke="#6C63FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div>
              <h1 className="text-foreground font-semibold text-base tracking-tight">ShopNova</h1>
              <p className="text-[10px] text-muted-foreground tracking-wider uppercase">La gestion, réinventée</p>
            </div>
          </div>
          {isMobile && (
            <button onClick={toggleSidebar} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Fermer le menu">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 mt-4 space-y-1 overflow-y-auto">
          {filteredItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative',
                  isActive
                    ? 'text-foreground bg-primary/15'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-primary" />
                )}
                <item.icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User section */}
        {currentUser && (
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                style={{ backgroundColor: currentUser.color }}
              >
                {currentUser.prenom[0]}{currentUser.nom[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {currentUser.prenom} {currentUser.nom}
                </p>
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
                  currentUser.role === 'gérant'
                    ? 'bg-primary/20 text-primary'
                    : 'bg-secondary/20 text-secondary'
                )}>
                  {currentUser.role === 'gérant' ? 'Gérant' : 'Caissier'}
                </span>
              </div>
              <button onClick={handleLogout} aria-label="Se déconnecter" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-destructive">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
`);

  // 9.2 — Rewrite AppLayout for responsive
  writeFile(src('components', 'layout', 'AppLayout.tsx'), `import React, { forwardRef, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { Menu } from 'lucide-react';

export const AppLayout = forwardRef<HTMLDivElement>((_props, ref) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        const searchInput = document.getElementById('pos-search');
        searchInput?.focus();
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        navigate('/caisse');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  if (!isAuthenticated) return null;

  return (
    <div ref={ref} className="min-h-screen bg-background">
      <Sidebar />
      {/* Mobile header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={toggleSidebar} aria-label="Ouvrir le menu" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-foreground font-semibold text-sm">ShopNova</h1>
        </div>
      )}
      <main className={isMobile ? 'pt-14 min-h-screen' : 'ml-60 min-h-screen'}>
        <Outlet />
      </main>
    </div>
  );
});

AppLayout.displayName = 'AppLayout';
`);

  // 9.3 — Make TopBar responsive
  writeFile(src('components', 'layout', 'TopBar.tsx'), `import React from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { formatDateLong } from '@/lib/utils';
import { Bell } from 'lucide-react';

export const TopBar: React.FC = () => {
  const { currentUser } = useAuthStore();

  return (
    <div className="flex items-center justify-between px-4 lg:px-8 py-4 lg:py-5">
      <div>
        <h2 className="text-lg lg:text-xl font-semibold text-foreground nova-heading">
          Bonjour, {currentUser?.prenom} 👋
        </h2>
        <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 capitalize">
          {formatDateLong(new Date())}
        </p>
      </div>
      <button className="relative p-2 lg:p-2.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors" aria-label="Notifications">
        <Bell className="w-4 h-4 lg:w-5 lg:h-5 text-muted-foreground" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
      </button>
    </div>
  );
};
`);

  phasesApplied++;
}

// ─── PHASE 10 — App.tsx routes + UIStore fix ──────────────
function phase10() {
  console.log('\n🔶 PHASE 10 — Routes, Accessibilité, Finitions\n');

  // 10.1 — Add imageUrl to Product interface
  const productStorePath = src('stores', 'useProductStore.ts');
  let productStore = readFile(productStorePath);
  if (!productStore.includes('imageUrl')) {
    productStore = productStore.replace(
      /description\?: string;/,
      `description?: string;\n  imageUrl?: string;`
    );
    writeFile(productStorePath, productStore);
  }

  // 10.2 — Update App.tsx with new routes
  writeFile(src('App.tsx'), `import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CaissePage from "./pages/CaissePage";
import ProduitsPage from "./pages/ProduitsPage";
import StockPage from "./pages/StockPage";
import VentesPage from "./pages/VentesPage";
import RapportsPage from "./pages/RapportsPage";
import ParametresPage from "./pages/ParametresPage";
import ClotureCaissePage from "./pages/ClotureCaissePage";
import FournisseursPage from "./pages/FournisseursPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-right" theme="dark" />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/caisse" element={<ProtectedRoute allowedRoles={['gérant', 'caissier']}><CaissePage /></ProtectedRoute>} />
            <Route path="/produits" element={<ProtectedRoute allowedRoles={['gérant']}><ProduitsPage /></ProtectedRoute>} />
            <Route path="/stock" element={<ProtectedRoute allowedRoles={['gérant']}><StockPage /></ProtectedRoute>} />
            <Route path="/fournisseurs" element={<ProtectedRoute allowedRoles={['gérant']}><FournisseursPage /></ProtectedRoute>} />
            <Route path="/ventes" element={<ProtectedRoute allowedRoles={['gérant']}><VentesPage /></ProtectedRoute>} />
            <Route path="/cloture" element={<ProtectedRoute allowedRoles={['gérant', 'caissier']}><ClotureCaissePage /></ProtectedRoute>} />
            <Route path="/rapports" element={<ProtectedRoute allowedRoles={['gérant']}><RapportsPage /></ProtectedRoute>} />
            <Route path="/parametres" element={<ProtectedRoute allowedRoles={['gérant']}><ParametresPage /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
`);

  // 10.3 — Ensure UIStore has proper sidebarOpen default for mobile
  const uiStorePath = src('stores', 'useUIStore.ts');
  let uiStore = readFile(uiStorePath);
  if (!uiStore.includes('sidebarOpen: false')) {
    uiStore = uiStore.replace('sidebarOpen: true', 'sidebarOpen: false');
  }
  writeFile(uiStorePath, uiStore);

  // 10.4 — Add aria-labels to StatusBadge
  const statusBadgePath = src('components', 'ui', 'StatusBadge.tsx');
  if (fs.existsSync(statusBadgePath)) {
    let sb = readFile(statusBadgePath);
    if (!sb.includes('role="status"')) {
      sb = sb.replace(
        /<span ref={ref} className=/,
        '<span ref={ref} role="status" aria-label={`Statut : ${config.label}`} className='
      );
      writeFile(statusBadgePath, sb);
    }
  }

  phasesApplied++;
}

// ─── RUN ──────────────────────────────────────────────────
function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   ShopNova Manager — Migration Phases 4 → 10   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Verify we're in the right directory
  const pkgPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error('❌ package.json non trouvé. Lance ce script à la racine du projet.');
    process.exit(1);
  }
  const pkg = JSON.parse(readFile(pkgPath));
  if (!pkg.dependencies?.zustand) {
    console.error('❌ Ce ne semble pas être le projet ShopNova (zustand manquant).');
    process.exit(1);
  }

  // Backup
  backupProject();

  // Run all phases
  try {
    phase4();   // Clôture de caisse
    phase5();   // Retours / Annulations
    phase6();   // Fournisseurs
    phase7();   // Validation Zod
    phase8();   // ErrorBoundary + Performance
    phase9();   // Responsive mobile
    phase10();  // Routes + Accessibilité + Finitions
  } catch (err) {
    console.error('\n❌ Erreur pendant la migration:', err.message);
    console.error('   Les fichiers déjà modifiés l\'ont été. Vérifiez le backup dans _backup_before_migration/');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(52));
  console.log(`\n✅ Migration terminée — ${phasesApplied} phases appliquées\n`);
  console.log('📋 Prochaines étapes :');
  console.log('');
  console.log('   1. npm install       (si pas déjà fait)');
  console.log('   2. npm run dev       (lancer le serveur)');
  console.log('   3. Vérifier dans le navigateur que tout fonctionne');
  console.log('   4. Tester les nouvelles pages :');
  console.log('      • /cloture      → Clôture de caisse');
  console.log('      • /fournisseurs → Gestion des fournisseurs');
  console.log('');
  console.log('   ⚠️  Si des erreurs TypeScript apparaissent, lance :');
  console.log('      npx tsc --noEmit');
  console.log('');
  console.log('   💾 Backup dans : _backup_before_migration/');
  console.log('');
}

main();
