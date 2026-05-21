import { describe, it, expect, beforeEach } from 'vitest';
import {
  useExpenseStore, type Expense, EXPENSE_CATEGORIES, getCategoryMeta,
} from '@/stores/useExpenseStore';

const makeExpense = (overrides: Partial<Omit<Expense, 'id'>> = {}): Omit<Expense, 'id'> => ({
  date: new Date('2026-05-15T10:00:00Z'),
  categorie: 'autre',
  description: 'Test',
  montant: 1000,
  paymentMode: 'especes',
  userId: 'u1',
  userName: 'Test User',
  ...overrides,
});

beforeEach(() => {
  useExpenseStore.setState({ expenses: [] });
});

describe('useExpenseStore — initial state', () => {
  it('starts with an empty list', () => {
    expect(useExpenseStore.getState().expenses).toHaveLength(0);
  });

  it('can be seeded via _setExpenses', () => {
    const seed: Expense[] = [
      { ...makeExpense(), id: 'e1' },
      { ...makeExpense(), id: 'e2' },
    ];
    useExpenseStore.getState()._setExpenses(seed);
    expect(useExpenseStore.getState().expenses).toHaveLength(2);
  });
});

describe('useExpenseStore — addExpense', () => {
  it('creates an expense with an id', () => {
    const created = useExpenseStore.getState().addExpense(makeExpense({
      categorie: 'loyer', montant: 50000, description: 'Loyer mai',
    }));
    expect(created.id).toBeTruthy();
    expect(useExpenseStore.getState().expenses).toHaveLength(1);
  });

  it('returns the created expense', () => {
    const created = useExpenseStore.getState().addExpense(makeExpense({
      montant: 25000, description: 'Facture Eneo',
    }));
    expect(created.montant).toBe(25000);
    expect(created.description).toBe('Facture Eneo');
  });

  it('generates unique IDs for rapid consecutive creations', () => {
    // Régression : Date.now() collisionnait (fix v1.1.1)
    const e1 = useExpenseStore.getState().addExpense(makeExpense());
    const e2 = useExpenseStore.getState().addExpense(makeExpense());
    const e3 = useExpenseStore.getState().addExpense(makeExpense());
    expect(e1.id).not.toBe(e2.id);
    expect(e2.id).not.toBe(e3.id);
    expect(e1.id).not.toBe(e3.id);
  });

  it('inserts new expenses at the top (most recent first)', () => {
    const e1 = useExpenseStore.getState().addExpense(makeExpense({ description: 'First' }));
    const e2 = useExpenseStore.getState().addExpense(makeExpense({ description: 'Second' }));
    const all = useExpenseStore.getState().expenses;
    expect(all[0].id).toBe(e2.id);
    expect(all[1].id).toBe(e1.id);
  });
});

describe('useExpenseStore — updateExpense', () => {
  it('updates fields without changing id', () => {
    const created = useExpenseStore.getState().addExpense(makeExpense({ montant: 1000 }));
    useExpenseStore.getState().updateExpense(created.id, { montant: 2500, notes: 'corrigé' });
    const updated = useExpenseStore.getState().expenses.find(e => e.id === created.id);
    expect(updated?.montant).toBe(2500);
    expect(updated?.notes).toBe('corrigé');
    expect(updated?.id).toBe(created.id);
  });

  it('preserves untouched fields', () => {
    const created = useExpenseStore.getState().addExpense(makeExpense({
      description: 'Original',
      categorie: 'electricite',
      montant: 5000,
    }));
    useExpenseStore.getState().updateExpense(created.id, { montant: 6000 });
    const updated = useExpenseStore.getState().expenses.find(e => e.id === created.id);
    expect(updated?.description).toBe('Original');
    expect(updated?.categorie).toBe('electricite');
    expect(updated?.montant).toBe(6000);
  });
});

describe('useExpenseStore — deleteExpense', () => {
  it('removes the targeted expense', () => {
    const e1 = useExpenseStore.getState().addExpense(makeExpense({ description: 'A' }));
    const e2 = useExpenseStore.getState().addExpense(makeExpense({ description: 'B' }));
    useExpenseStore.getState().deleteExpense(e1.id);
    const remaining = useExpenseStore.getState().expenses;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(e2.id);
  });

  it('is a no-op when id does not exist', () => {
    useExpenseStore.getState().addExpense(makeExpense());
    useExpenseStore.getState().deleteExpense('nonexistent');
    expect(useExpenseStore.getState().expenses).toHaveLength(1);
  });
});

describe('useExpenseStore — getExpensesInRange', () => {
  const seedDates = () => {
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-10T10:00:00Z'), description: 'In range', montant: 100,
    }));
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-05T10:00:00Z'), description: 'Before', montant: 200,
    }));
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-20T10:00:00Z'), description: 'After', montant: 300,
    }));
  };

  it('returns expenses within the date range (inclusive)', () => {
    seedDates();
    const result = useExpenseStore.getState().getExpensesInRange(
      new Date('2026-05-08T00:00:00Z'),
      new Date('2026-05-15T23:59:59Z')
    );
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('In range');
  });

  it('returns an empty list when no expense matches', () => {
    seedDates();
    const result = useExpenseStore.getState().getExpensesInRange(
      new Date('2027-01-01T00:00:00Z'),
      new Date('2027-12-31T23:59:59Z')
    );
    expect(result).toHaveLength(0);
  });

  it('handles boundary dates correctly', () => {
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-15T00:00:00Z'),
    }));
    // Borne basse incluse
    expect(useExpenseStore.getState().getExpensesInRange(
      new Date('2026-05-15T00:00:00Z'),
      new Date('2026-05-15T23:59:59Z')
    )).toHaveLength(1);
  });
});

describe('useExpenseStore — getTotalInRange', () => {
  it('returns 0 when no expense matches', () => {
    expect(useExpenseStore.getState().getTotalInRange(
      new Date('2027-01-01'), new Date('2027-12-31'),
    )).toBe(0);
  });

  it('sums expenses in the range', () => {
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-10'), montant: 1000,
    }));
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-12'), montant: 2500,
    }));
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-06-01'), montant: 5000, // outside
    }));
    const total = useExpenseStore.getState().getTotalInRange(
      new Date('2026-05-01'),
      new Date('2026-05-31T23:59:59Z'),
    );
    expect(total).toBe(3500);
  });
});

describe('useExpenseStore — getByCategoryInRange', () => {
  it('returns 0 for all categories when no expenses', () => {
    const result = useExpenseStore.getState().getByCategoryInRange(
      new Date('2026-05-01'), new Date('2026-05-31'),
    );
    EXPENSE_CATEGORIES.forEach(c => {
      expect(result[c.value]).toBe(0);
    });
  });

  it('aggregates expenses by category', () => {
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-10'), categorie: 'loyer', montant: 50000,
    }));
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-15'), categorie: 'electricite', montant: 25000,
    }));
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-05-20'), categorie: 'electricite', montant: 5000,
    }));
    const result = useExpenseStore.getState().getByCategoryInRange(
      new Date('2026-05-01'),
      new Date('2026-05-31T23:59:59Z'),
    );
    expect(result.loyer).toBe(50000);
    expect(result.electricite).toBe(30000);
    expect(result.transport).toBe(0);
  });

  it('excludes expenses outside the range', () => {
    useExpenseStore.getState().addExpense(makeExpense({
      date: new Date('2026-04-10'), categorie: 'loyer', montant: 50000,
    }));
    const result = useExpenseStore.getState().getByCategoryInRange(
      new Date('2026-05-01'),
      new Date('2026-05-31T23:59:59Z'),
    );
    expect(result.loyer).toBe(0);
  });
});

describe('useExpenseStore — category metadata', () => {
  it('getCategoryMeta returns the right label for known category', () => {
    expect(getCategoryMeta('loyer').label).toBe('Loyer');
    expect(getCategoryMeta('electricite').label).toBe('Électricité');
  });

  it('getCategoryMeta has a color for every category', () => {
    EXPENSE_CATEGORIES.forEach(c => {
      expect(c.color).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  it('all category values are unique', () => {
    const values = EXPENSE_CATEGORIES.map(c => c.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
