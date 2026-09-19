/**
 * VariantPicker - choisir une déclinaison avant de l'ajouter au panier.
 *
 * Pourquoi une fenêtre plutôt qu'une tuile par déclinaison : une perruque en
 * 5 longueurs × 4 couleurs × 3 modèles fait 60 combinaisons. Soixante tuiles
 * rendent la grille du point de vente inutilisable - c'est exactement le
 * problème que les déclinaisons corrigent.
 *
 * Le caissier choisit axe par axe. Une valeur dont aucune déclinaison en stock
 * ne dépend est grisée, pour qu'il ne s'engage pas dans un chemin sans issue
 * devant le client.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { type Product } from '@/stores/useProductStore';
import { formatFCFA } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { X, Package } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface VariantPickerProps {
  /** Le produit parent, ou null quand la fenêtre est fermée. */
  parent: Product | null;
  /** Les déclinaisons de ce parent. */
  variants: Product[];
  onPick: (variant: Product) => void;
  onClose: () => void;
}

export const VariantPicker: React.FC<VariantPickerProps> = ({
  parent, variants, onPick, onClose,
}) => {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<Record<string, string>>({});

  const axes = useMemo(() => parent?.variantAxes ?? [], [parent]);

  // Repartir de zéro à chaque ouverture : sans cela, le choix du client
  // précédent resterait sélectionné pour le suivant.
  useEffect(() => { setChosen({}); }, [parent?.id]);

  if (!parent) return null;

  /** Déclinaisons encore compatibles avec ce qui a déjà été choisi. */
  const matching = (upTo: number): Product[] =>
    variants.filter(variant =>
      axes.slice(0, upTo).every(axis => (variant.variantValues?.[axis] ?? '') === chosen[axis])
    );

  /** Valeurs proposées pour un axe, compte tenu des axes précédents. */
  const optionsFor = (axisIndex: number): string[] => {
    const axis = axes[axisIndex];
    const seen = new Set<string>();
    for (const variant of matching(axisIndex)) {
      const value = variant.variantValues?.[axis];
      if (value) seen.add(value);
    }
    return [...seen];
  };

  /** Vrai si aucune déclinaison en stock ne reste accessible par cette valeur. */
  const isDeadEnd = (axisIndex: number, value: string): boolean => {
    const axis = axes[axisIndex];
    return !matching(axisIndex).some(variant =>
      variant.variantValues?.[axis] === value && variant.stock > 0
    );
  };

  const selected = axes.every(axis => chosen[axis])
    ? matching(axes.length)[0] ?? null
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="nova-card w-full max-w-[460px] max-h-[90vh] overflow-y-auto p-5 lg:p-6 animate-scale-in"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            {parent.imageUrl ? (
              <img src={parent.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="nova-heading text-base text-foreground truncate">{parent.nom}</h3>
              <p className="text-xs text-muted-foreground">{t('caisse.variantPickTitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted shrink-0"
            aria-label={t('caisse.variantClose')}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          {axes.map((axis, axisIndex) => {
            // Un axe ne s'ouvre qu'une fois les précédents renseignés : sinon
            // on proposerait des combinaisons qui n'existent pas.
            const locked = axes.slice(0, axisIndex).some(previous => !chosen[previous]);
            const options = locked ? [] : optionsFor(axisIndex);
            return (
              <div key={axis} className={cn(locked && 'opacity-40')}>
                <label className="text-xs text-muted-foreground mb-1.5 block">{axis}</label>
                <div className="flex flex-wrap gap-2">
                  {options.map(value => {
                    const deadEnd = isDeadEnd(axisIndex, value);
                    const active = chosen[axis] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={deadEnd}
                        onClick={() => setChosen(previous => {
                          // Changer un axe invalide les suivants, dont les
                          // valeurs dépendent de celui-ci.
                          const next: Record<string, string> = { ...previous, [axis]: value };
                          for (const later of axes.slice(axisIndex + 1)) delete next[later];
                          return next;
                        })}
                        className={cn(
                          'px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                          deadEnd
                            ? 'border-border bg-muted text-muted-foreground/50 line-through cursor-not-allowed'
                            : active
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-muted text-foreground hover:border-primary/40',
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                  {!locked && options.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('caisse.variantNone')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selected && (
          <div className="mt-5 p-3 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="money text-xl text-primary">{formatFCFA(selected.prixVente)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selected.stock > 0
                  ? t('caisse.variantInStock').replace('{n}', String(selected.stock))
                  : t('caisse.outOfStock')}
              </p>
            </div>
            <button
              onClick={() => onPick(selected)}
              disabled={selected.stock <= 0}
              className="nova-btn-primary px-5 py-2.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('caisse.variantAdd')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
