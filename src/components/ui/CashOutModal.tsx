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
      toast.error('Montant invalide');
      return;
    }
    if (!motif.trim()) {
      toast.error('Motif requis');
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
      toast.success(`Sortie de ${formatFCFA(a)} enregistrée`);
      onCreated?.(co.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
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
            <h3 className="nova-heading text-base text-foreground">Sortie de caisse</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type *</label>
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
            <label className="text-xs text-muted-foreground mb-1 block">Montant (FCFA) *</label>
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
            <label className="text-xs text-muted-foreground mb-1 block">Bénéficiaire</label>
            <input
              type="text"
              value={beneficiaire}
              onChange={e => setBeneficiaire(e.target.value)}
              className="nova-input w-full py-2"
              placeholder={
                type === 'avance_salaire' ? 'Nom du caissier'
                : type === 'pret' ? 'Nom du gérant/patron'
                : type === 'remboursement' ? 'Nom du client'
                : 'Bénéficiaire (optionnel)'
              }
              maxLength={100}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Motif *</label>
            <textarea
              value={motif}
              onChange={e => setMotif(e.target.value)}
              className="nova-input w-full h-16 resize-none text-sm"
              placeholder="Description courte de la sortie..."
              maxLength={200}
            />
          </div>
        </div>

        <div className="mt-4 p-2.5 rounded-lg bg-muted/40 text-[11px] text-muted-foreground">
          Cette sortie sera déduite du total attendu en caisse à la clôture
          de votre session.
        </div>

        <div className="flex gap-grid mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 nova-btn-primary py-2.5 text-sm"
          >
            Enregistrer la sortie
          </button>
        </div>
      </div>
    </div>
  );
};
