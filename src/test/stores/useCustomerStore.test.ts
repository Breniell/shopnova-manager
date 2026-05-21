import { describe, it, expect, beforeEach } from 'vitest';
import { useCustomerStore, Customer } from '@/stores/useCustomerStore';

const seedCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'cust' + Math.random(),
  prenom: 'Jean',
  nom: 'Dupont',
  telephone: '+237 699 111 222',
  dateCreation: new Date().toISOString(),
  color: '#A93200',
  archived: false,
  ...overrides,
});

beforeEach(() => {
  useCustomerStore.setState({ customers: [] });
});

describe('useCustomerStore — initial state', () => {
  it('starts with an empty list', () => {
    expect(useCustomerStore.getState().customers).toHaveLength(0);
  });

  it('can be seeded via _setCustomers', () => {
    const seed = [seedCustomer({ id: 'a' }), seedCustomer({ id: 'b' })];
    useCustomerStore.getState()._setCustomers(seed);
    expect(useCustomerStore.getState().customers).toHaveLength(2);
  });
});

describe('useCustomerStore — addCustomer', () => {
  it('creates a new customer with id, dateCreation, color and archived=false', () => {
    const created = useCustomerStore.getState().addCustomer({
      prenom: 'Marie',
      nom: 'Nguema',
      telephone: '+237 699 333 444',
    });
    expect(created.id).toBeTruthy();
    expect(created.dateCreation).toBeTruthy();
    expect(created.color).toBeTruthy();
    expect(created.archived).toBe(false);
    expect(useCustomerStore.getState().customers).toHaveLength(1);
  });

  it('returns the created customer (useful for caisse flow)', () => {
    const created = useCustomerStore.getState().addCustomer({
      prenom: 'Paul',
      nom: 'Mbarga',
      telephone: '+237699555666',
    });
    expect(created.prenom).toBe('Paul');
    expect(created.nom).toBe('Mbarga');
  });

  it('throws when adding a duplicate active phone', () => {
    useCustomerStore.getState().addCustomer({
      prenom: 'Marie', nom: 'Nguema', telephone: '+237 699 333 444',
    });
    expect(() => useCustomerStore.getState().addCustomer({
      prenom: 'Autre', nom: 'Personne', telephone: '+237 699 333 444',
    })).toThrow(/déjà/);
  });

  it('normalizes phone numbers when checking duplicates', () => {
    useCustomerStore.getState().addCustomer({
      prenom: 'Marie', nom: 'Nguema', telephone: '+237 699 333 444',
    });
    // Même numéro mais formaté différemment → doit être considéré comme doublon
    expect(() => useCustomerStore.getState().addCustomer({
      prenom: 'Autre', nom: 'Personne', telephone: '237699333444',
    })).toThrow();
  });

  it('allows reusing a phone if previous customer is archived', () => {
    const first = useCustomerStore.getState().addCustomer({
      prenom: 'Marie', nom: 'Nguema', telephone: '+237 699 333 444',
    });
    useCustomerStore.getState().archiveCustomer(first.id);
    // Devrait passer puisque le précédent est archivé
    expect(() => useCustomerStore.getState().addCustomer({
      prenom: 'Nouveau', nom: 'Client', telephone: '+237 699 333 444',
    })).not.toThrow();
    expect(useCustomerStore.getState().customers).toHaveLength(2);
  });

  it('assigns different colors to consecutive customers', () => {
    const c1 = useCustomerStore.getState().addCustomer({ prenom: 'A', nom: 'A', telephone: '111111111' });
    const c2 = useCustomerStore.getState().addCustomer({ prenom: 'B', nom: 'B', telephone: '222222222' });
    expect(c1.color).not.toBe(c2.color);
  });

  it('generates unique IDs even for rapid consecutive creations', () => {
    // Regression : Date.now() peut retourner la même valeur pour plusieurs appels
    // dans la même milliseconde. L'ID doit rester unique grâce au suffixe random.
    const c1 = useCustomerStore.getState().addCustomer({ prenom: 'A', nom: 'A', telephone: '111111111' });
    const c2 = useCustomerStore.getState().addCustomer({ prenom: 'B', nom: 'B', telephone: '222222222' });
    const c3 = useCustomerStore.getState().addCustomer({ prenom: 'C', nom: 'C', telephone: '333333333' });
    expect(c1.id).not.toBe(c2.id);
    expect(c2.id).not.toBe(c3.id);
    expect(c1.id).not.toBe(c3.id);
  });
});

describe('useCustomerStore — updateCustomer', () => {
  it('updates customer fields without changing id', () => {
    const created = useCustomerStore.getState().addCustomer({
      prenom: 'Marie', nom: 'Nguema', telephone: '+237 699 333 444',
    });
    useCustomerStore.getState().updateCustomer(created.id, { email: 'marie@example.com' });
    const updated = useCustomerStore.getState().getCustomerById(created.id);
    expect(updated?.email).toBe('marie@example.com');
    expect(updated?.id).toBe(created.id);
  });
});

describe('useCustomerStore — archive / unarchive', () => {
  it('archiveCustomer sets archived=true', () => {
    const c = useCustomerStore.getState().addCustomer({ prenom: 'A', nom: 'A', telephone: '111111111' });
    useCustomerStore.getState().archiveCustomer(c.id);
    expect(useCustomerStore.getState().getCustomerById(c.id)?.archived).toBe(true);
  });

  it('unarchiveCustomer sets archived=false', () => {
    const c = useCustomerStore.getState().addCustomer({ prenom: 'A', nom: 'A', telephone: '111111111' });
    useCustomerStore.getState().archiveCustomer(c.id);
    useCustomerStore.getState().unarchiveCustomer(c.id);
    expect(useCustomerStore.getState().getCustomerById(c.id)?.archived).toBe(false);
  });
});

describe('useCustomerStore — deleteCustomer', () => {
  it('removes the customer from the list', () => {
    const c = useCustomerStore.getState().addCustomer({ prenom: 'A', nom: 'A', telephone: '111111111' });
    useCustomerStore.getState().deleteCustomer(c.id);
    expect(useCustomerStore.getState().getCustomerById(c.id)).toBeUndefined();
  });
});

describe('useCustomerStore — getCustomerByPhone', () => {
  it('finds an active customer by exact phone', () => {
    useCustomerStore.getState().addCustomer({
      prenom: 'Marie', nom: 'Nguema', telephone: '+237 699 333 444',
    });
    const found = useCustomerStore.getState().getCustomerByPhone('+237 699 333 444');
    expect(found?.prenom).toBe('Marie');
  });

  it('finds an active customer by normalized phone', () => {
    useCustomerStore.getState().addCustomer({
      prenom: 'Marie', nom: 'Nguema', telephone: '+237 699 333 444',
    });
    const found = useCustomerStore.getState().getCustomerByPhone('237699333444');
    expect(found?.prenom).toBe('Marie');
  });

  it('does not return archived customers', () => {
    const c = useCustomerStore.getState().addCustomer({
      prenom: 'Marie', nom: 'Nguema', telephone: '+237 699 333 444',
    });
    useCustomerStore.getState().archiveCustomer(c.id);
    expect(useCustomerStore.getState().getCustomerByPhone('+237 699 333 444')).toBeUndefined();
  });
});

describe('useCustomerStore — searchCustomers', () => {
  const seedThree = () => {
    useCustomerStore.getState().addCustomer({ prenom: 'Marie', nom: 'Nguema', telephone: '+237 699 111 111' });
    useCustomerStore.getState().addCustomer({ prenom: 'Paul', nom: 'Mbarga', telephone: '+237 699 222 222' });
    useCustomerStore.getState().addCustomer({ prenom: 'Fatou', nom: 'Diallo', telephone: '+237 670 333 333' });
  };

  it('returns all active customers with empty query', () => {
    seedThree();
    const results = useCustomerStore.getState().searchCustomers('');
    expect(results).toHaveLength(3);
  });

  it('finds by first name (case insensitive)', () => {
    seedThree();
    const results = useCustomerStore.getState().searchCustomers('marie');
    expect(results).toHaveLength(1);
    expect(results[0].prenom).toBe('Marie');
  });

  it('finds by last name', () => {
    seedThree();
    const results = useCustomerStore.getState().searchCustomers('mbarga');
    expect(results).toHaveLength(1);
    expect(results[0].nom).toBe('Mbarga');
  });

  it('finds by full name', () => {
    seedThree();
    const results = useCustomerStore.getState().searchCustomers('marie nguema');
    expect(results).toHaveLength(1);
  });

  it('finds by partial phone number', () => {
    seedThree();
    const results = useCustomerStore.getState().searchCustomers('670');
    expect(results).toHaveLength(1);
    expect(results[0].prenom).toBe('Fatou');
  });

  it('excludes archived customers by default', () => {
    seedThree();
    const all = useCustomerStore.getState().customers;
    expect(all).toHaveLength(3);
    useCustomerStore.getState().archiveCustomer(all[0].id);
    const results = useCustomerStore.getState().searchCustomers('');
    expect(results).toHaveLength(2);
  });

  it('includes archived customers when option is set', () => {
    seedThree();
    const all = useCustomerStore.getState().customers;
    useCustomerStore.getState().archiveCustomer(all[0].id);
    const results = useCustomerStore.getState().searchCustomers('', { includeArchived: true });
    expect(results).toHaveLength(3);
  });
});
