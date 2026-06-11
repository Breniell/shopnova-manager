/**
 * PriceEditor — Modal pour négocier le prix unitaire d'une ligne du panier.
 *
 * Fonctionnement :
 *   1. L'utilisateur saisit un nouveau prix
 *   2. checkPrice() évalue : ok / alerte / bloqué
 *   3. Si bloqué pour cause de plancher dépassé → on déclenche l'override gérant
 *      (le composant parent ouvre ManagerOverrideModal)
 *   4. Sinon, on applique directement ou on refuse avec toast
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { Product } from '@/stores/useProductStore';
import {
  checkPrice, getEffectiveFloor, getEffectiveTarget,
  getMarginPercent,
} from '@/lib/pricing';
import { formatFCFA } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { X, AlertTriangle, CheckCircle2, ShieldAlert, Info } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface PriceEditorProps {
  open: boolean;
  product: Product | null;
  currentPrice: number;
  /**
   * Callback quand l'utilisateur valide.
   *   - status='ok' → appliquer directement
   *   - status='override_required' → parent ouvre ManagerOverrideModal
   */
  onApply: (newPrice: number, requiresOverride: boolean) => void;
  onClose: () => void;
}

export const PriceEditor: React.FC<PriceEditorProps> = ({
  open, product, currentPrice, onApply, onClose,
}) => {
  const { t } = useTranslation();
  const [priceInput, setPriceInput] = useState(String(currentPrice));

  // Reset à l'ouverture
  useEffect(() => {
    if (open && product) {
      setPriceInput(String(currentPrice));
    }
  }, [open, product, currentPrice]);

  const requestedPrice = useMemo(() => {
    const n = parseInt(priceInput, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [priceInput]);

  const check = useMemo(() => {
    if (!product) return null;
    return checkPrice(product, requestedPrice);
  }, [product, requestedPrice]);

  if (!open || !product) return null;

  const floor = getEffectiveFloor(product);
  const target = getEffectiveTarget(product);
  const margin = getMarginPercent(product, requestedPrice);

  // Couleur d'état pour l'affichage
  const statusUI = !check ? null
    : check.status === 'ok' && check.level === 'normal' ? {
        icon: <CheckCircle2 className="w-4 h-4" />,
        text: t('priceEditor.statusNormal'),
        color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      }
    : check.status === 'ok' && check.level === 'below_target' ? {
        icon: <AlertTriangle className="w-4 h-4" />,
        text: t('priceEditor.statusBelowTarget'),
        color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      }
    : check.status === 'blocked' && check.reason === 'below_floor' ? {
        icon: <ShieldAlert className="w-4 h-4" />,
        text: t('priceEditor.statusBelowFloor').replace('{floor}', formatFCFA(floor)),
        color: 'bg-destructive/15 text-destructive border-destructive/30',
      }
    : check.status === 'blocked' && check.reason === 'above_display' ? {
        icon: <ShieldAlert className="w-4 h-4" />,
        text: t('priceEditor.statusAboveDisplay').replace('{display}', formatFCFA(check.display)),
        color: 'bg-destructive/15 text-destructive border-destructive/30',
      }
    : {
        icon: <ShieldAlert className="w-4 h-4" />,
        text: t('priceEditor.statusNotNegotiable'),
        color: 'bg-destructive/15 text-destructive border-destructive/30',
      };

  const canApply = check?.status === 'ok' || (check?.status === 'blocked' && check.reason === 'below_floor');
  const requiresOverride = check?.status === 'blocked' && check.reason === 'below_floor';

  const handleApply = () => {
    if (!check || check.status !== 'ok' && !requiresOverride) return;
    onApply(requestedPrice, requiresOverride);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="nova-card w-full max-w-[440px] p-6 animate-scale-in"
        onClick={ev => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="nova-heading text-base text-foreground">{t('priceEditor.title')}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted"
            aria-label={t('priceEditor.close')}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Identité du produit */}
        <div className="mb-4">
          <p className="text-sm font-medium text-foreground">{product.nom}</p>
          <p className="text-[10px] text-muted-foreground">{product.categorie}</p>
        </div>

        {/* Rappel des seuils */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{t('priceEditor.floorLabel')}</p>
            <p className="text-xs font-semibold text-destructive tabular-nums">{formatFCFA(floor)}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{t('priceEditor.targetLabel')}</p>
            <p className="text-xs font-semibold text-amber-400 tabular-nums">{formatFCFA(target)}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{t('priceEditor.displayLabel')}</p>
            <p className="text-xs font-semibold text-emerald-400 tabular-nums">{formatFCFA(product.prixVente)}</p>
          </div>
        </div>

        {/* Input */}
        <div className="mb-3">
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('priceEditor.newPriceLabel')}
          </label>
          <input
            type="number"
            value={priceInput}
            onChange={e => setPriceInput(e.target.value)}
            className="nova-input w-full py-3 text-lg font-semibold tabular-nums"
            min="0"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && canApply) handleApply(); }}
          />
        </div>

        {/* Statut visuel */}
        {statusUI && (
          <div className={cn(
            'mb-3 p-2.5 rounded-lg border flex items-center gap-2 text-xs',
            statusUI.color
          )}>
            {statusUI.icon}
            <span>{statusUI.text}</span>
          </div>
        )}

        {/* Marge en temps réel */}
        <div className="flex items-center justify-between text-xs mb-4 px-1">
          <span className="text-muted-foreground">{t('priceEditor.marginLabel')}</span>
          <span className={cn(
            'font-semibold tabular-nums',
            margin < 0 ? 'text-destructive'
              : margin < 10 ? 'text-amber-400'
              : 'text-emerald-400'
          )}>
            {margin.toFixed(1)} %
          </span>
        </div>

        {/* Note pédagogique sur l'override */}
        {requiresOverride && (
          <div className="mb-4 p-2.5 rounded-lg bg-muted/50 text-[11px] text-muted-foreground flex gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{t('priceEditor.authNote')}</span>
          </div>
        )}

        <div className="flex gap-grid">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
          >
            {t('priceEditor.cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className={cn(
              'flex-1 py-2.5 rounded-lg transition-colors text-sm font-medium',
              canApply
                ? 'nova-btn-primary'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {requiresOverride ? t('priceEditor.requestAuth') : t('priceEditor.apply')}
          </button>
        </div>
      </div>
    </div>
  );
};
