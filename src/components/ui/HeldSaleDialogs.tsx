/**
 * Dialogues des ventes en attente : mise en attente (étiquette), liste
 * (reprendre / supprimer) et confirmation quand le panier courant n'est pas
 * vide au moment de reprendre. La logique vit dans useHeldSaleStore et
 * CaissePage ; ces composants ne font qu'afficher et remonter les choix.
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PauseCircle, Play, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { formatFCFA, formatTime } from '@/utils/formatters';
import { heldSaleItemCount, heldSaleTotal } from '@/stores/useHeldSaleStore';
import type { HeldSale } from '@/stores/useHeldSaleStore';

interface HoldSaleDialogProps {
  open: boolean;
  /** Étiquette proposée (nom du client choisi), modifiable. */
  defaultLabel: string;
  onConfirm: (label: string) => void;
  onClose: () => void;
}

export const HoldSaleDialog: React.FC<HoldSaleDialogProps> = ({ open, defaultLabel, onConfirm, onClose }) => {
  const { t } = useTranslation();
  const [label, setLabel] = useState(defaultLabel);

  useEffect(() => { if (open) setLabel(defaultLabel); }, [open, defaultLabel]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(label.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <PauseCircle className="w-5 h-5 text-primary" />
            {t('caisse.holdTitle')}
          </DialogTitle>
          <DialogDescription>{t('caisse.holdDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="held-sale-label" className="text-xs text-muted-foreground font-medium block mb-1">
              {t('caisse.holdLabel')}
            </label>
            <input
              id="held-sale-label"
              type="text"
              autoFocus
              maxLength={80}
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="nova-input w-full"
              placeholder={t('caisse.holdLabelPlaceholder')}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
              {t('common.cancel')}
            </button>
            <button type="submit" className="nova-btn-primary px-4 py-2 text-sm">
              {t('caisse.holdSale')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface HeldSalesListDialogProps {
  open: boolean;
  heldSales: HeldSale[];
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const HeldSalesListDialog: React.FC<HeldSalesListDialogProps> = ({ open, heldSales, onResume, onDelete, onClose }) => {
  const { t } = useTranslation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => { if (!open) setPendingDeleteId(null); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <PauseCircle className="w-5 h-5 text-primary" />
            {t('caisse.heldListTitle')}
          </DialogTitle>
        </DialogHeader>
        {heldSales.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('caisse.heldListEmpty')}</p>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto" aria-label={t('caisse.heldListTitle')}>
            {heldSales.map(held => (
              <li key={held.id} className="rounded-lg border border-border bg-muted/30 p-3" data-testid="held-sale">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {held.label || t('caisse.heldUnnamed')}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('caisse.heldMeta')
                        .replace('{n}', String(heldSaleItemCount(held)))
                        .replace('{time}', formatTime(held.heldAt))
                        .replace('{user}', held.heldByUserName)}
                    </p>
                  </div>
                  <p className="money text-sm text-primary shrink-0">{formatFCFA(heldSaleTotal(held))}</p>
                </div>
                {pendingDeleteId === held.id ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-destructive">{t('caisse.heldDeleteConfirm')}</p>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" onClick={() => setPendingDeleteId(null)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted">
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { onDelete(held.id); setPendingDeleteId(null); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive text-destructive-foreground"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(held.id)}
                      className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t('common.delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onResume(held.id)}
                      className="nova-btn-primary px-3 py-1.5 text-xs inline-flex items-center gap-1"
                    >
                      <Play className="w-3.5 h-3.5" /> {t('caisse.heldResume')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

interface ReplaceCartDialogProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Le panier courant n'est pas vide : on propose de le mettre en attente, jamais de l'écraser. */
export const ReplaceCartDialog: React.FC<ReplaceCartDialogProps> = ({ open, onConfirm, onClose }) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t('caisse.heldReplaceTitle')}</DialogTitle>
          <DialogDescription>{t('caisse.heldReplaceDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={onConfirm} className="nova-btn-primary px-4 py-2 text-sm">
            {t('caisse.heldReplaceConfirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
