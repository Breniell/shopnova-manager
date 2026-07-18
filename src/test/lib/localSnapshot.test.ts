import { afterEach, describe, expect, it } from 'vitest';
import { hydrateLocalSnapshot, saveLocalSnapshotNow } from '@/lib/localSnapshot';
import { useProductStore, type Product } from '@/stores/useProductStore';
import { useSaleStore, type Sale } from '@/stores/useSaleStore';

describe('autonomous local data snapshot', () => {
  afterEach(() => {
    useProductStore.getState()._setProducts([]);
    useSaleStore.getState()._setSales([]);
    localStorage.removeItem('legwan-local-snapshot-v1:unregistered');
    localStorage.removeItem('legwan-local-snapshot-v1:tenant-a');
    localStorage.removeItem('legwan-local-snapshot-v1:tenant-b');
    localStorage.removeItem('legwan-boutique-id');
  });

  it('restores products and sales, including Date values, after a restart', async () => {
    const product: Product = {
      id: 'p-offline', nom: 'Riz', categorie: 'Alimentation', codeBarre: '123',
      prixAchat: 500, prixVente: 700, stock: 12, seuilAlerte: 2,
    };
    const sale: Sale = {
      id: 's-offline', saleNumber: 'LGW-1', date: new Date('2026-07-13T10:00:00Z'),
      items: [], subtotal: 700, discount: 0, total: 700, paymentMode: 'especes',
      userId: 'u1', userName: 'Ada',
    };
    useProductStore.getState()._setProducts([product]);
    useSaleStore.getState()._setSales([sale]);
    await saveLocalSnapshotNow();

    useProductStore.getState()._setProducts([]);
    useSaleStore.getState()._setSales([]);
    await expect(hydrateLocalSnapshot()).resolves.toBe(true);

    expect(useProductStore.getState().products).toEqual([product]);
    expect(useSaleStore.getState().sales[0]).toMatchObject({ id: 's-offline', total: 700 });
    expect(useSaleStore.getState().sales[0].date).toBeInstanceOf(Date);
  });

  it('never hydrates business data from another boutique tenant', async () => {
    localStorage.setItem('legwan-boutique-id', 'tenant-a');
    useProductStore.getState()._setProducts([{
      id: 'private-a', nom: 'A', categorie: 'Autre', codeBarre: '',
      prixAchat: 1, prixVente: 2, stock: 1, seuilAlerte: 0,
    }]);
    await saveLocalSnapshotNow();
    useProductStore.getState()._setProducts([]);

    localStorage.setItem('legwan-boutique-id', 'tenant-b');
    await expect(hydrateLocalSnapshot()).resolves.toBe(false);
    expect(useProductStore.getState().products).toEqual([]);
  });
});
