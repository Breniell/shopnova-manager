import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/useSettingsStore';

const INITIAL_STATE = useSettingsStore.getState();

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ ...INITIAL_STATE });
});

describe('useSettingsStore — initial state', () => {
  it('has a default shop name', () => {
    expect(useSettingsStore.getState().shop.nom).toBe('Legwan Store');
  });

  it('has a default currency of FCFA', () => {
    expect(useSettingsStore.getState().shop.devise).toBe('FCFA');
  });

  it('has all required shop fields', () => {
    const { shop } = useSettingsStore.getState();
    expect(shop.adresse).toBeTruthy();
    expect(shop.telephone).toBeTruthy();
    expect(shop.enteteRecu).toBeTruthy();
    expect(shop.piedPageRecu).toBeTruthy();
  });
});

describe('useSettingsStore — updateShop', () => {
  it('updates a single field', () => {
    useSettingsStore.getState().updateShop({ nom: 'Ma Boutique' });
    expect(useSettingsStore.getState().shop.nom).toBe('Ma Boutique');
  });

  it('does not overwrite untouched fields', () => {
    useSettingsStore.getState().updateShop({ nom: 'Ma Boutique' });
    expect(useSettingsStore.getState().shop.devise).toBe('FCFA');
    expect(useSettingsStore.getState().shop.adresse).toBeTruthy();
  });

  it('updates multiple fields at once', () => {
    useSettingsStore.getState().updateShop({
      nom: 'Nouveau Nom',
      telephone: '+237600000000',
      nui: 'M987654',
    });
    const { shop } = useSettingsStore.getState();
    expect(shop.nom).toBe('Nouveau Nom');
    expect(shop.telephone).toBe('+237600000000');
    expect(shop.nui).toBe('M987654');
  });

  it('can update receipt header and footer', () => {
    useSettingsStore.getState().updateShop({
      enteteRecu: 'Bienvenue chez nous !',
      piedPageRecu: 'Revenez bientôt.',
    });
    const { shop } = useSettingsStore.getState();
    expect(shop.enteteRecu).toBe('Bienvenue chez nous !');
    expect(shop.piedPageRecu).toBe('Revenez bientôt.');
  });

  it('successive updates accumulate correctly', () => {
    useSettingsStore.getState().updateShop({ nom: 'Étape 1' });
    useSettingsStore.getState().updateShop({ adresse: 'Étape 2' });
    const { shop } = useSettingsStore.getState();
    expect(shop.nom).toBe('Étape 1');
    expect(shop.adresse).toBe('Étape 2');
  });
});
