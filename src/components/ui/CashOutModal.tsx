/**
 * CashOutModal — Saisie d'une sortie de caisse pendant la session.
 *
 * Sorties typiques :
 *   • Avance de salaire au caissier
 *   • Prêt patron/gérant
 *   • Remboursement client en espèces
 *   • Achat impulsif auprès d'un fournisseur de passage
 *   • Autre
 *
 * Les "dépenses payées espèces" génèrent automatiquement un CashOut depuis
 * la page Dépenses (relatedExpenseId pointe vers l'Expense). Cette modal-ci
 * n'est utilisée que pour les sorties ad-hoc sans Expense correspondante.
 */
import React, { useState, useEffect } from 'react';
import { useCashSessionStore, CASHOUT_TYPE_LABELS, type CashOutType } from '@/stores/useCashSessionStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { formatFCFA } from '@/utils/formatters';
import { X, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n';

interface CashOutModalProps {
  open: boolean;
  cashSessionId: string;
  onClose: () => void;
  onCreated?: (cashOutId: string) => void;
}

const SELECTABLE_TYPES: CashOutType[] = [
  'avance_salaire', 'pret', 'remboursement', 'achat_impulsif', 'autre',
];

export const CashOutModal: React.FC<CashOutModalProps> = ({
  open, cashSessionId, onClose, onCreated,
}) => {
  const { addCashOut } = useCashSessionStore();
  const { currentUser } = useAuthStore();
  const { t } = useTranslation();

  const [type, setType] = useState<CashOutType>('autre');
  const [amount, setAmount] = useState('');
  const [beneficiaire, setBeneficiaire] = useState('');
  const [motif, setMotif] = useState('');

  useEffect(() => {
    if (open) {
      setType('autre');
      setAmount('');
      setBeneficiaire('');
      setMotif('');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!currentUser) return;
    const a = parseInt(amount, 10);
    if (!Number.isFinite(a) || a <= 0) {
      toast.error(t('cashout.invalidAmount'));
      return;
    }
    if (!motif.trim()) {
      toast.error(t('cashout.motifRequired'));
      return;
    }
    try {
      const co = addCashOut({
        cashSessionId,
        date: new Date(),
        type,
        amount: a,
        beneficiaire: beneficiaire.trim() || undefined,
        motif: motif.trim(),
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`,
      });
      toast.success(t('cashout.successAmount').replace('{n}', formatFCFA(a)));
      onCreated?.(co.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('cashout.error'));
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="nova-card w-full max-w-[440px] p-6 animate-scale-in"
        onClick={ev => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-destructive/15 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-destructive" />
            </div>
            <h3 className="nova-heading text-base text-foreground">{t('cashout.title')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted"
            aria-label={t('cashout.close')}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('cashout.typeLabel')}</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as CashOutType)}
              className="nova-input w-full py-2"
            >
              {SELECTABLE_TYPES.map(t => (
                <option key={t} value={t}>{CASHOUT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('cashout.amountLabel')}</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="nova-input w-full py-2 text-lg font-semibold tabular-nums"
              min="0"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('cashout.beneficiaryLabel')}</label>
            <input
              type="text"
              value={beneficiaire}
              onChange={e => setBeneficiaire(e.target.value)}
              className="nova-input w-full py-2"
              placeholder={
                type === 'avance_salaire' ? t('cashout.beneficiaryAvance')
                : type === 'pret' ? t('cashout.beneficiaryPret')
                : type === 'remboursement' ? t('cashout.beneficiaryRemboursement')
                : t('cashout.beneficiaryOther')
              }
              maxLength={100}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('cashout.motifLabel')}</label>
            <textarea
              value={motif}
              onChange={e => setMotif(e.target.value)}
              className="nova-input w-full h-16 resize-none text-sm"
              placeholder={t('cashout.motifPlaceholder')}
              maxLength={200}
            />
          </div>
        </div>

        <div className="mt-4 p-2.5 rounded-lg bg-muted/40 text-[11px] text-muted-foreground">
          {t('cashout.sessionNote')}
        </div>

        <div className="flex gap-grid mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
          >
            {t('cashout.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 nova-btn-primary py-2.5 text-sm"
          >
            {t('cashout.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};
