import { describe, it, expect, beforeEach } from 'vitest';
import { useCaisseStore } from '@/stores/useCaisseStore';

const INITIAL_STATE = useCaisseStore.getState();

beforeEach(() => {
  localStorage.clear();
  useCaisseStore.setState({ ...INITIAL_STATE, clotures: [] });
});

const makeCloture = (overrides = {}) => ({
  date: new Date().toISOString(),
  userId: '1',
  userName: 'Marie Nguema',
  totalVentesEspeces: 45000,
  totalVentesMobile: 12000,
  totalAttendu: 55000,  // especes + fondDeCaisse
  totalCompte: 54500,
  ecart: -500,
  details: { '10000': 5, '1000': 4, '500': 1 },
  ...overrides,
});

describe('useCaisseStore — initial state', () => {
  it('starts with an empty clotures list', () => {
    expect(useCaisseStore.getState().clotures).toHaveLength(0);
  });

  it('has a default fond de caisse of 10 000 FCFA', () => {
    expect(useCaisseStore.getState().fondDeCaisse).toBe(10000);
  });
});

describe('useCaisseStore — addCloture', () => {
  it('adds a clôture to the list', () => {
    useCaisseStore.getState().addCloture(makeCloture());
    expect(useCaisseStore.getState().clotures).toHaveLength(1);
  });

  it('assigns a unique id starting with "cl"', () => {
    useCaisseStore.getState().addCloture(makeCloture());
    expect(useCaisseStore.getState().clotures[0].id).toMatch(/^cl\d+$/);
  });

  it('stores all financial fields correctly', () => {
    useCaisseStore.getState().addCloture(makeCloture());
    const cl = useCaisseStore.getState().clotures[0];
    expect(cl.totalVentesEspeces).toBe(45000);
    expect(cl.totalVentesMobile).toBe(12000);
    expect(cl.totalAttendu).toBe(55000);
    expect(cl.totalCompte).toBe(54500);
    expect(cl.ecart).toBe(-500);
  });

  it('stores denomination details', () => {
    useCaisseStore.getState().addCloture(makeCloture());
    const cl = useCaisseStore.getState().clotures[0];
    expect(cl.details['10000']).toBe(5);
    expect(cl.details['1000']).toBe(4);
  });

  it('stores optional notes when provided', () => {
    useCaisseStore.getState().addCloture(makeCloture({ notes: 'Caisse OK' }));
    expect(useCaisseStore.getState().clotures[0].notes).toBe('Caisse OK');
  });

  it('prepends new clôtures (most recent first)', () => {
    useCaisseStore.getState().addCloture(makeCloture({ userName: 'First' }));
    useCaisseStore.getState().addCloture(makeCloture({ userName: 'Second' }));
    expect(useCaisseStore.getState().clotures[0].userName).toBe('Second');
  });

  it('handles zero écart (perfect balance)', () => {
    useCaisseStore.getState().addCloture(makeCloture({ totalCompte: 55000, ecart: 0 }));
    expect(useCaisseStore.getState().clotures[0].ecart).toBe(0);
  });

  it('handles positive écart (surplus)', () => {
    useCaisseStore.getState().addCloture(makeCloture({ totalCompte: 55500, ecart: 500 }));
    expect(useCaisseStore.getState().clotures[0].ecart).toBe(500);
  });
});

describe('useCaisseStore — setFondDeCaisse', () => {
  it('updates the fond de caisse', () => {
    useCaisseStore.getState().setFondDeCaisse(25000);
    expect(useCaisseStore.getState().fondDeCaisse).toBe(25000);
  });

  it('can set to zero', () => {
    useCaisseStore.getState().setFondDeCaisse(0);
    expect(useCaisseStore.getState().fondDeCaisse).toBe(0);
  });
});
