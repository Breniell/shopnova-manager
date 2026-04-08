import { describe, it, expect, beforeEach } from 'vitest';
import { useSupplierStore } from '@/stores/useSupplierStore';

const INITIAL_STATE = useSupplierStore.getState();

beforeEach(() => {
  localStorage.clear();
  useSupplierStore.setState({ ...INITIAL_STATE });
});

describe('useSupplierStore — initial state', () => {
  it('loads 3 default suppliers', () => {
    expect(useSupplierStore.getState().suppliers).toHaveLength(3);
  });

  it('includes Brasseries du Cameroun', () => {
    const found = useSupplierStore.getState().suppliers.find(s => s.nom.includes('Brasseries'));
    expect(found).toBeDefined();
  });
});

describe('useSupplierStore — addSupplier', () => {
  it('adds a new supplier', () => {
    const before = useSupplierStore.getState().suppliers.length;
    useSupplierStore.getState().addSupplier({
      nom: 'Nestlé Cameroun',
      telephone: '+237699555666',
      adresse: 'Douala, Bonabéri',
    });
    expect(useSupplierStore.getState().suppliers).toHaveLength(before + 1);
  });

  it('assigns an id starting with "sup"', () => {
    useSupplierStore.getState().addSupplier({ nom: 'Test', telephone: '699000000' });
    const suppliers = useSupplierStore.getState().suppliers;
    const s = suppliers[suppliers.length - 1];
    expect(s.id).toMatch(/^sup\d+$/);
  });

  it('stores all optional fields', () => {
    useSupplierStore.getState().addSupplier({
      nom: 'Fournisseur Complet',
      telephone: '699000001',
      email: 'contact@fournisseur.cm',
      adresse: 'Yaoundé',
      notes: 'Paiement à 30 jours',
    });
    const s = useSupplierStore.getState().suppliers.find(sup => sup.nom === 'Fournisseur Complet')!;
    expect(s.email).toBe('contact@fournisseur.cm');
    expect(s.adresse).toBe('Yaoundé');
    expect(s.notes).toBe('Paiement à 30 jours');
  });
});

describe('useSupplierStore — updateSupplier', () => {
  it('updates specified fields', () => {
    const { suppliers, updateSupplier } = useSupplierStore.getState();
    const target = suppliers[0];
    updateSupplier(target.id, { telephone: '+237699999999' });
    const updated = useSupplierStore.getState().suppliers.find(s => s.id === target.id)!;
    expect(updated.telephone).toBe('+237699999999');
  });

  it('preserves untouched fields', () => {
    const { suppliers, updateSupplier } = useSupplierStore.getState();
    const target = suppliers[0];
    updateSupplier(target.id, { telephone: '+237699999999' });
    const updated = useSupplierStore.getState().suppliers.find(s => s.id === target.id)!;
    expect(updated.nom).toBe(target.nom);
  });

  it('does not affect other suppliers', () => {
    const { suppliers, updateSupplier } = useSupplierStore.getState();
    updateSupplier(suppliers[0].id, { nom: 'Renamed' });
    const other = useSupplierStore.getState().suppliers.find(s => s.id === suppliers[1].id)!;
    expect(other.nom).toBe(suppliers[1].nom);
  });
});

describe('useSupplierStore — deleteSupplier', () => {
  it('removes the supplier from the list', () => {
    const { suppliers, deleteSupplier } = useSupplierStore.getState();
    const target = suppliers[0];
    deleteSupplier(target.id);
    expect(useSupplierStore.getState().suppliers.find(s => s.id === target.id)).toBeUndefined();
  });

  it('reduces count by 1', () => {
    const before = useSupplierStore.getState().suppliers.length;
    useSupplierStore.getState().deleteSupplier(useSupplierStore.getState().suppliers[0].id);
    expect(useSupplierStore.getState().suppliers).toHaveLength(before - 1);
  });

  it('does nothing for an unknown id', () => {
    const before = useSupplierStore.getState().suppliers.length;
    useSupplierStore.getState().deleteSupplier('nonexistent');
    expect(useSupplierStore.getState().suppliers).toHaveLength(before);
  });
});
