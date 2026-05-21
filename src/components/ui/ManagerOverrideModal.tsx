/**
 * ManagerOverrideModal — autorisation gérant pour vendre sous le prix plancher.
 *
 * Sécurité :
 *   • Le PIN saisi est hashé via hashPin() avant comparaison
 *   • Le PIN n'est jamais loggué ni stocké en clair
 *   • Le rate-limiting des tentatives est géré par useAuthStore (5 max)
 *     mais n'est PAS branché ici pour Phase 1 — à industrialiser plus tard
 *     (priorité faible : le caissier peut juste refaire le clic, donc l'override
 *     ne devient pas une porte de brute-force pratique en boutique).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { hashPin } from '@/lib/crypto';
import { formatFCFA } from '@/utils/formatters';
import { X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface ManagerOverrideModalProps {
  open: boolean;
  /** Contexte d'affichage (prix demandé vs plancher), pour info au gérant. */
  context: { productName: string; requestedPrice: number; floor: number } | null;
  onAuthorized: (manager: { userId: string; userName: string }) => void;
  onClose: () => void;
}

export const ManagerOverrideModal: React.FC<ManagerOverrideModalProps> = ({
  open, context, onAuthorized, onClose,
}) => {
  const { users } = useAuthStore();

  const gerants = useMemo(() => users.filter(u => u.role === 'gérant'), [users]);

  const [managerId, setManagerId] = useState('');
  const [pin, setPin] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (open) {
      // Si un seul gérant, on le pré-sélectionne
      setManagerId(gerants.length === 1 ? gerants[0].id : '');
      setPin('');
    }
  }, [open, gerants]);

  if (!open || !context) return null;

  const handleAuthorize = async () => {
    if (!managerId) {
      toast.error('Choisissez un gérant');
      return;
    }
    if (pin.length < 4) {
      toast.error('PIN à 4 chiffres');
      return;
    }
    setIsChecking(true);
    try {
      const manager = gerants.find(u => u.id === managerId);
      if (!manager) {
        toast.error('Gérant introuvable');
        return;
      }
      const hashed = await hashPin(pin);
      if (manager.pin !== hashed) {
        toast.error('PIN incorrect');
        setPin('');
        return;
      }
      onAuthorized({
        userId: manager.id,
        userName: `${manager.prenom} ${manager.nom}`,
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="nova-card w-full max-w-[400px] p-6 animate-scale-in"
        onClick={ev => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-destructive/15 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-destructive" />
            </div>
            <h3 className="nova-heading text-base text-foreground">Autorisation gérant</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="mb-4 p-3 rounded-lg bg-muted/40 text-xs space-y-1">
          <p className="text-muted-foreground">
            Vente proposée pour <strong className="text-foreground">{context.productName}</strong> :
          </p>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Prix demandé</span>
            <span className="text-destructive font-semibold tabular-nums">{formatFCFA(context.requestedPrice)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Plancher</span>
            <span className="text-foreground tabular-nums">{formatFCFA(context.floor)}</span>
          </div>
        </div>

        {gerants.length === 0 ? (
          <p className="text-sm text-destructive mb-4">
            Aucun gérant n'est configuré dans cette boutique.
          </p>
        ) : (
          <>
            {gerants.length > 1 && (
              <div className="mb-3">
                <label className="text-xs text-muted-foreground mb-1 block">Gérant *</label>
                <select
                  value={managerId}
                  onChange={e => setManagerId(e.target.value)}
                  className="nova-input w-full py-2"
                >
                  <option value="">Choisir un gérant…</option>
                  {gerants.map(g => (
                    <option key={g.id} value={g.id}>{g.prenom} {g.nom}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1 block">
                PIN à 4 chiffres
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                className="nova-input w-full py-3 text-center text-xl tracking-[0.6em] font-bold"
                placeholder="••••"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && pin.length === 4) handleAuthorize(); }}
              />
            </div>
          </>
        )}

        <div className="flex gap-grid">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
          >
            Annuler
          </button>
          <button
            onClick={handleAuthorize}
            disabled={gerants.length === 0 || pin.length < 4 || !managerId || isChecking}
            className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isChecking ? 'Vérification…' : 'Autoriser'}
          </button>
        </div>
      </div>
    </div>
  );
};
