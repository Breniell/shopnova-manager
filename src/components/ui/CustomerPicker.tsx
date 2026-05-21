/**
 * CustomerPicker — sélecteur de client pour la page Caisse.
 *
 * UX :
 *   • Bouton compact affiché en haut du panier
 *   • Au clic, ouvre une fiche déroulante avec :
 *       - input de recherche (téléphone ou nom)
 *       - liste des 5 clients qui matchent
 *       - bouton "+ Nouveau client" → mini-modal nom + téléphone
 *       - bouton "Retirer" si un client est déjà sélectionné
 *   • Une fois un client choisi, le bouton affiche son nom
 */
import React, { useState, useRef, useEffect } from 'react';
import { useCustomerStore, Customer } from '@/stores/useCustomerStore';
import { UserCircle, Search, Plus, X, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CustomerPickerProps {
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer | null) => void;
  className?: string;
}

export const CustomerPicker: React.FC<CustomerPickerProps> = ({
  selectedCustomer,
  onSelect,
  className,
}) => {
  const { searchCustomers, addCustomer } = useCustomerStore();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ prenom: '', nom: '', telephone: '' });
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fermeture au clic en dehors
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus automatique sur l'input quand on ouvre
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = open ? searchCustomers(query).slice(0, 5) : [];

  const handleSelect = (customer: Customer) => {
    onSelect(customer);
    setOpen(false);
    setQuery('');
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setOpen(false);
  };

  const handleCreateNew = () => {
    if (!newForm.prenom.trim() || !newForm.nom.trim() || !newForm.telephone.trim()) {
      toast.error('Prénom, nom et téléphone sont requis');
      return;
    }
    if (newForm.telephone.replace(/\D/g, '').length < 9) {
      toast.error('Numéro de téléphone invalide (9 chiffres minimum)');
      return;
    }
    try {
      const created = addCustomer({
        prenom: newForm.prenom.trim(),
        nom: newForm.nom.trim(),
        telephone: newForm.telephone.trim(),
      });
      toast.success(`${created.prenom} ${created.nom} ajouté`);
      onSelect(created);
      setShowNewModal(false);
      setOpen(false);
      setNewForm({ prenom: '', nom: '', telephone: '' });
      setQuery('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la création');
    }
  };

  return (
    <>
      <div ref={containerRef} className={cn('relative', className)}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium border transition-all',
            selectedCustomer
              ? 'bg-secondary/15 border-secondary/40 text-secondary hover:bg-secondary/20'
              : 'bg-muted border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <UserCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left truncate">
            {selectedCustomer
              ? `${selectedCustomer.prenom} ${selectedCustomer.nom}`
              : 'Aucun client sélectionné'}
          </span>
          {selectedCustomer && (
            <span
              onClick={handleRemove}
              role="button"
              tabIndex={0}
              aria-label="Retirer le client"
              className="p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-fade-in">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="nova-input w-full pl-8 py-1.5 text-xs"
                  placeholder="Rechercher par nom ou téléphone..."
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {results.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  {query ? 'Aucun client trouvé' : 'Tapez pour rechercher un client'}
                </div>
              ) : (
                results.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.prenom[0]}{c.nom[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {c.prenom} {c.nom}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {c.telephone}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="border-t border-border p-2 flex gap-1">
              <button
                type="button"
                onClick={() => {
                  // Pré-remplir le téléphone si la recherche ressemble à un numéro
                  if (query && /^[0-9+\s\-.()]+$/.test(query)) {
                    setNewForm(f => ({ ...f, telephone: query }));
                  }
                  setShowNewModal(true);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Nouveau client
              </button>
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-muted text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mini-modal de création rapide */}
      {showNewModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="nova-card w-full max-w-[400px] p-6 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="nova-heading text-base text-foreground">Nouveau client</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1.5 rounded-lg hover:bg-muted"
                aria-label="Fermer"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Prénom *</label>
                <input
                  type="text"
                  value={newForm.prenom}
                  onChange={e => setNewForm(f => ({ ...f, prenom: e.target.value }))}
                  className="nova-input w-full py-2"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nom *</label>
                <input
                  type="text"
                  value={newForm.nom}
                  onChange={e => setNewForm(f => ({ ...f, nom: e.target.value }))}
                  className="nova-input w-full py-2"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Téléphone *</label>
                <input
                  type="tel"
                  value={newForm.telephone}
                  onChange={e => setNewForm(f => ({ ...f, telephone: e.target.value }))}
                  className="nova-input w-full py-2"
                  placeholder="+237 6XX XXX XXX"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateNew();
                  }}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Plus de détails (email, adresse, plafond) peuvent être ajoutés depuis la page Clients.
            </p>
            <div className="flex gap-grid mt-5">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateNew}
                className="flex-1 nova-btn-primary py-2 text-sm"
              >
                Créer et sélectionner
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
