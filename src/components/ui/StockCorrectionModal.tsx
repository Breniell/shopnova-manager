import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { useStockStore, ADJUSTMENT_REASON_LABELS, type AdjustmentReason } from '@/stores/useStockStore';
import { useInventoryStore } from '@/stores/useInventoryStore';
import type { Product } from '@/stores/useProductStore';

const REASONS = Object.keys(ADJUSTMENT_REASON_LABELS) as AdjustmentReason[];

const TEXT = {
  fr: {
    title: 'Corriger le stock',
    hint: "Indiquez le stock réellement présent. Legwan calcule la différence et la garde dans l'historique des mouvements.",
    product: 'Produit',
    choose: 'Choisir un produit',
    current: 'Stock enregistré',
    actual: 'Stock réel constaté',
    difference: 'Différence',
    reason: 'Motif',
    notes: 'Remarque (facultatif)',
    cancel: 'Annuler',
    validate: 'Corriger le stock',
    needProduct: 'Choisissez un produit',
    invalid: 'Le stock réel doit être un nombre entier, zéro ou plus',
    unchanged: 'Le stock réel est identique au stock enregistré',
    done: 'Stock de « {product} » corrigé : {before} → {after}',
    inInventory: "Ce produit est dans l'inventaire {num}, en cours. Saisissez son stock compté dans l'inventaire : le corriger ici ferait appliquer l'écart deux fois.",
  },
  en: {
    title: 'Correct stock',
    hint: 'Enter the stock actually on the shelf. Legwan works out the difference and keeps it in the movement history.',
    product: 'Product',
    choose: 'Choose a product',
    current: 'Recorded stock',
    actual: 'Actual stock counted',
    difference: 'Difference',
    reason: 'Reason',
    notes: 'Note (optional)',
    cancel: 'Cancel',
    validate: 'Correct stock',
    needProduct: 'Choose a product',
    invalid: 'Actual stock must be a whole number, zero or more',
    unchanged: 'Actual stock is the same as the recorded stock',
    done: 'Stock of "{product}" corrected: {before} → {after}',
    inInventory: 'This product is in inventory {num}, which is in progress. Enter its counted stock in the inventory: correcting it here would apply the gap twice.',
  },
};

interface StockCorrectionModalProps {
  open: boolean;
  onClose: () => void;
  /** Produits proposés : ceux qui portent du stock (jamais un parent de déclinaisons). */
  products: Product[];
  /** Produit présélectionné ; le sélecteur reste proposé s'il est absent. */
  productId?: string;
}

/**
 * Corriger un stock mal saisi, à la hausse comme à la baisse.
 *
 * Le stock n'est jamais écrit directement : la correction passe par un
 * mouvement d'ajustement atomique, avec auteur, motif et stock avant/après,
 * comme une entrée de stock ou un inventaire.
 */
export const StockCorrectionModal: React.FC<StockCorrectionModalProps> = ({ open, onClose, products, productId }) => {
  const { locale } = useTranslation();
  const L = locale === 'fr' ? TEXT.fr : TEXT.en;
  const currentUser = useAuthStore(s => s.currentUser);
  const commitStockChange = useStockStore(s => s.commitStockChange);

  const [selected, setSelected] = useState(productId ?? '');
  const [actual, setActual] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('erreur_saisie');
  const [notes, setNotes] = useState('');

  const product = products.find(p => p.id === selected);
  // Un inventaire ouvert garde le stock « théorique » du jour de sa création :
  // corriger le produit ailleurs en même temps ferait appliquer l'écart deux fois.
  const openSession = useInventoryStore(s => s.sessions.find(
    session => (session.status === 'draft' || session.status === 'in_progress')
      && session.lines.some(line => line.productId === selected),
  ));

  useEffect(() => {
    if (!open) return;
    setSelected(productId ?? '');
    setActual('');
    setReason('erreur_saisie');
    setNotes('');
  }, [open, productId]);

  if (!open) return null;

  const parsed = actual.trim() === '' ? null : Number(actual);
  const valid = parsed !== null && Number.isInteger(parsed) && parsed >= 0;
  const diff = product && valid ? (parsed as number) - product.stock : null;

  const submit = () => {
    if (!product) { toast.error(L.needProduct); return; }
    if (!valid) { toast.error(L.invalid); return; }
    if (!currentUser) return;
    if (openSession) { toast.error(L.inInventory.replace('{num}', openSession.numero)); return; }
    const delta = (parsed as number) - product.stock;
    if (delta === 0) { toast.error(L.unchanged); return; }
    try {
      commitStockChange({
        date: new Date(),
        productId: product.id,
        productName: product.nom,
        type: 'ajustement',
        quantity: delta,
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`,
        reason,
        notes: notes.trim() || undefined,
      });
      toast.success(L.done.replace('{product}', product.nom).replace('{before}', String(product.stock)).replace('{after}', String(parsed)));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="nova-card w-full max-w-[480px] p-5 lg:p-6 animate-scale-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="nova-heading text-lg text-foreground">{L.title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label={L.cancel}>
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">{L.hint}</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{L.product}</label>
            <select value={selected} onChange={e => setSelected(e.target.value)} className="nova-input w-full">
              <option value="">{L.choose}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.stock})</option>)}
            </select>
          </div>

          {openSession && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
              {L.inInventory.replace('{num}', openSession.numero)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{L.current}</label>
              <div className="nova-input w-full text-muted-foreground tabular-nums">{product ? product.stock : '-'}</div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{L.actual}</label>
              <input
                type="number" min={0} step={1} inputMode="numeric" autoFocus
                value={actual} onChange={e => setActual(e.target.value)}
                className="nova-input w-full tabular-nums"
              />
            </div>
          </div>

          {diff !== null && diff !== 0 && (
            <p className={`text-sm font-medium tabular-nums ${diff > 0 ? 'text-emerald-500' : 'text-destructive'}`}>
              {L.difference} : {diff > 0 ? '+' : ''}{diff}
            </p>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{L.reason}</label>
            <select value={reason} onChange={e => setReason(e.target.value as AdjustmentReason)} className="nova-input w-full">
              {REASONS.map(r => <option key={r} value={r}>{ADJUSTMENT_REASON_LABELS[r]}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{L.notes}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="nova-input w-full h-16 resize-none" />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{L.cancel}</button>
          <button onClick={submit} disabled={!!openSession} className="flex-1 nova-btn-primary py-2.5 disabled:opacity-50 disabled:cursor-not-allowed">{L.validate}</button>
        </div>
      </div>
    </div>
  );
};
