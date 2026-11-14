/**
 * Adversarial test suite for firestore.rules.
 *
 * Every test plays an attacker against the real rules running in the Firestore
 * emulator: another shop, an unauthenticated client, a dishonest cashier, a
 * manager trying to undo a licence revocation. A test passes when the attack
 * is REJECTED (or, for the control cases, when the legitimate action still
 * works, so the hardening cannot silently break the till).
 *
 * Run:  npm run test:security-rules
 * (wraps: firebase emulators:exec --only firestore --project demo-legwan
 *         "node --test tests/security/firestore-rules.attack.test.mjs")
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, collection, increment, serverTimestamp, writeBatch,
  Timestamp, terminate,
} from 'firebase/firestore';

const PROJECT = 'demo-legwan';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181').split(':');
const SHOP = 'shopA';
const OTHER = 'shopB';

const apps = [];
let seq = 0;

/** A Firestore client authenticated as `token` (null = unauthenticated). */
function client(token) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake' }, `c${seq++}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT), token ? { mockUserToken: token } : {});
  apps.push({ app, db });
  return db;
}

async function denied(promise, label) {
  await assert.rejects(promise, (err) => {
    assert.match(String(err?.code ?? err), /permission-denied/i, `${label}: ${err}`);
    return true;
  }, `${label} should have been rejected`);
}

let owner, cashier, manager, outsider, anon, superadmin;

before(async () => {
  owner      = client({ user_id: SHOP });
  cashier    = client({ user_id: 'emp-cashier', boutiqueId: SHOP, employeeId: 'e-cash', role: 'cashier' });
  manager    = client({ user_id: 'emp-manager', boutiqueId: SHOP, employeeId: 'e-man', role: 'manager' });
  outsider   = client({ user_id: OTHER });
  anon       = client(null);
  superadmin = client({ user_id: 'dev', superadmin: true });

  // Seed the victim shop as its owner.
  await setDoc(doc(owner, `boutiques/${SHOP}`), { nom: 'Boutique A' });
  await setDoc(doc(owner, `boutiques/${SHOP}/settings/main`), { nom: 'Boutique A' });
  await setDoc(doc(owner, `boutiques/${SHOP}/products/p1`), { nom: 'Riz', stock: 10, prixVente: 1000 });
  await setDoc(doc(owner, `boutiques/${SHOP}/customers/c1`), { nom: 'Client', telephone: '690000000', plafondCredit: 5000 });
  await setDoc(doc(owner, `boutiques/${SHOP}/meta/saleCounter`), { value: 42 });
  await setDoc(doc(owner, `boutiques/${SHOP}/clotures/k1`), { userId: SHOP, total: 1000 });
  // Rules only allow creating an open session, then closing it.
  await setDoc(doc(owner, `boutiques/${SHOP}/cash_sessions/s1`), {
    userId: 'e-cash', status: 'open', fondInitial: 0, openedAt: 1,
  });
  await updateDoc(doc(owner, `boutiques/${SHOP}/cash_sessions/s1`), { status: 'closed', closedAt: 2 });
  await setDoc(doc(owner, `boutiques/${SHOP}/_license/trial`), { startedAt: serverTimestamp() });
  await setDoc(doc(owner, `boutiques/${SHOP}/payments/pay1`), {
    operationId: 'pay1', kind: 'payment', saleId: 'sale1', customerId: 'c1',
    date: Timestamp.now(), amount: 500, channel: 'especes', userId: SHOP, userName: 'Owner',
  });
  await setDoc(doc(owner, `boutiques/${SHOP}/stock_movements/m1`), { userId: SHOP, delta: -1 });
  // Super-admin revokes the shop's licence.
  await setDoc(doc(superadmin, `boutiques/${SHOP}/_license/current`), {
    licenseStr: 'LGW1-x.y', licenseId: 'L1', plan: 'standard',
    issuedAt: 1, expiresAt: 2, revoked: true,
  });
});

after(async () => {
  for (const { app, db } of apps) {
    await terminate(db).catch(() => {});
    await deleteApp(app).catch(() => {});
  }
});

// ── Tenant isolation ─────────────────────────────────────────────────────────

test('another shop cannot read the victim\'s sales or customers', async () => {
  await denied(getDocs(collection(outsider, `boutiques/${SHOP}/sales`)), 'cross-tenant sales read');
  await denied(getDoc(doc(outsider, `boutiques/${SHOP}/customers/c1`)), 'cross-tenant customer read');
});

test('another shop cannot tamper with the victim\'s stock or settings', async () => {
  await denied(updateDoc(doc(outsider, `boutiques/${SHOP}/products/p1`), { stock: 0 }), 'cross-tenant stock');
  await denied(setDoc(doc(outsider, `boutiques/${SHOP}/settings/main`), { nom: 'pwned' }), 'cross-tenant settings');
});

test('an unauthenticated client reads and writes nothing', async () => {
  await denied(getDoc(doc(anon, `boutiques/${SHOP}`)), 'anon read');
  await denied(setDoc(doc(anon, `boutiques/${SHOP}/sales/x`), { userId: 'x' }), 'anon write');
});

test('a shop cannot impersonate another one in the registry', async () => {
  await denied(setDoc(doc(outsider, `registry/${SHOP}`), {
    boutiqueId: SHOP, nom: 'x', adresse: '', telephone: '', version: '1',
  }), 'registry spoof');
});

test('a normal shop cannot list the registry or the licence ledger', async () => {
  await denied(getDocs(collection(owner, 'registry')), 'registry list');
  await denied(getDocs(collection(owner, 'licenses')), 'licences list');
});

test('the registry heartbeat cannot be used as free storage', async () => {
  const junk = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'x']));
  await denied(setDoc(doc(owner, `registry/${SHOP}`), {
    boutiqueId: SHOP, nom: 'A', adresse: '', telephone: '', version: '1', ...junk,
  }), 'registry junk');
  await setDoc(doc(owner, `registry/${SHOP}`), {
    boutiqueId: SHOP, nom: 'A', adresse: '', telephone: '', version: '1.14.2', platform: 'win32',
  });
});

test('undeclared or nested collections are closed', async () => {
  await denied(setDoc(doc(owner, `boutiques/${SHOP}/evil/x`), { a: 1 }), 'undeclared collection');
  await denied(setDoc(doc(owner, `boutiques/${SHOP}/products/p1/hidden/x`), { a: 1 }), 'nested collection');
  await denied(setDoc(doc(owner, 'topLevelJunk/x'), { a: 1 }), 'top-level collection');
});

// ── Dishonest cashier ────────────────────────────────────────────────────────

test('a cashier cannot change settings, staff accounts or expenses', async () => {
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/settings/main`), { nom: 'x' }), 'settings');
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/users/rogue`), {
    role: 'gérant', pin: '0'.repeat(64),
  }), 'create manager account');
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/expenses/x`), { montant: 1 }), 'expense');
});

test('a cashier cannot raise or overwrite a stock level (shrinkage cover-up)', async () => {
  await denied(updateDoc(doc(cashier, `boutiques/${SHOP}/products/p1`), { stock: increment(50) }), 'stock +50');
  await denied(updateDoc(doc(cashier, `boutiques/${SHOP}/products/p1`), { stock: 999 }), 'stock = 999');
  await denied(updateDoc(doc(cashier, `boutiques/${SHOP}/products/p1`), { prixVente: 1 }), 'price change');
});

test('control: a cashier can still decrement stock when selling', async () => {
  await updateDoc(doc(cashier, `boutiques/${SHOP}/products/p1`), { stock: increment(-1) });
  const snap = await getDoc(doc(owner, `boutiques/${SHOP}/products/p1`));
  assert.equal(snap.data().stock, 9);
});

test('a cashier cannot raise, set or remove a customer credit ceiling', async () => {
  await denied(updateDoc(doc(cashier, `boutiques/${SHOP}/customers/c1`), { plafondCredit: 10_000_000 }), 'raise ceiling');
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/customers/c1`), {
    nom: 'Client', telephone: '690000000',
  }), 'drop ceiling by overwrite');
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/customers/c2`), {
    nom: 'Complice', telephone: '691111111', plafondCredit: 9_999_999,
  }), 'new customer with ceiling');
});

test('control: a cashier can still register and edit customers', async () => {
  await setDoc(doc(cashier, `boutiques/${SHOP}/customers/c3`), { nom: 'Nouveau', telephone: '692222222' });
  await updateDoc(doc(cashier, `boutiques/${SHOP}/customers/c1`), { telephone: '693333333' });
});

test('a manager identity can set a credit ceiling', async () => {
  await updateDoc(doc(manager, `boutiques/${SHOP}/customers/c1`), { plafondCredit: 8000 });
});

test('a cashier cannot rewind the receipt counter or write other meta docs', async () => {
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/meta/saleCounter`), { value: 1 }), 'rewind counter');
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/meta/flags`), { anything: true }), 'other meta');
  await setDoc(doc(cashier, `boutiques/${SHOP}/meta/saleCounter`), { value: 43 }); // control
});

test('a cashier cannot record a sale or cash-out under a colleague\'s name', async () => {
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/sales/forged`), { userId: 'e-man', total: 1 }), 'forged sale');
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/cash_outs/forged`), { userId: 'e-man', montant: 1 }), 'forged cash-out');
});

test('a cashier cannot delete sales or rewrite accounting records', async () => {
  await setDoc(doc(cashier, `boutiques/${SHOP}/sales/own`), { userId: 'e-cash', total: 1000 });
  await denied(deleteDoc(doc(cashier, `boutiques/${SHOP}/sales/own`)), 'delete sale');
  await denied(updateDoc(doc(cashier, `boutiques/${SHOP}/sales/own`), { total: 0 }), 'edit sale');
  await denied(updateDoc(doc(cashier, `boutiques/${SHOP}/clotures/k1`), { total: 0 }), 'edit closure');
  await denied(updateDoc(doc(cashier, `boutiques/${SHOP}/cash_sessions/s1`), { status: 'open' }), 'reopen session');
});

test('a cashier cannot reverse a credit payment', async () => {
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/payments/rev-pay1`), {
    operationId: 'rev-pay1', kind: 'reversal', reversesPaymentId: 'pay1', saleId: 'sale1',
    customerId: 'c1', date: Timestamp.now(), amount: 500, channel: 'especes',
    userId: 'e-cash', userName: 'Cashier',
  }), 'reversal by cashier');
});

test('a cashier cannot clear another employee\'s login lockout', async () => {
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/security/loginAttempts`), {
    'e-man': { count: 0, lockedUntil: null },
  }), 'reset colleague lockout');
});

test('a cashier cannot install a licence', async () => {
  await denied(setDoc(doc(cashier, `boutiques/${SHOP}/_license/other`), { x: 1 }), 'licence doc');
});

// ── Immutable ledgers and licence anti-tampering (even for the owner) ────────

test('payments and stock movements are immutable, even for the owner', async () => {
  await denied(updateDoc(doc(owner, `boutiques/${SHOP}/payments/pay1`), { amount: 1 }), 'edit payment');
  await denied(deleteDoc(doc(owner, `boutiques/${SHOP}/payments/pay1`)), 'delete payment');
  await denied(updateDoc(doc(owner, `boutiques/${SHOP}/stock_movements/m1`), { delta: 0 }), 'edit movement');
});

test('the owner cannot restart the free trial', async () => {
  await denied(setDoc(doc(owner, `boutiques/${SHOP}/_license/trial`), { startedAt: serverTimestamp() }), 'rewrite trial');
  await denied(deleteDoc(doc(owner, `boutiques/${SHOP}/_license/trial`)), 'delete trial');
});

test('the owner cannot undo a licence revocation', async () => {
  await denied(setDoc(doc(owner, `boutiques/${SHOP}/_license/current`), {
    licenseStr: 'LGW1-a.b', licenseId: 'L2', plan: 'standard', issuedAt: 1, expiresAt: 9e12, revoked: false,
  }), 'overwrite revoked licence');
  await denied(deleteDoc(doc(owner, `boutiques/${SHOP}/_license/current`)), 'delete revoked licence');
});

test('the trusted clock only accepts the server\'s own timestamp', async () => {
  await denied(setDoc(doc(owner, `boutiques/${SHOP}/_clock/tick`), { at: Timestamp.fromMillis(0) }), 'forged clock');
  await setDoc(doc(owner, `boutiques/${SHOP}/_clock/tick`), { at: serverTimestamp() }); // control
});

test('control: a full sale batch by a cashier still commits', async () => {
  const batch = writeBatch(cashier);
  batch.set(doc(cashier, `boutiques/${SHOP}/sale_operations/sale9`), {
    operationId: 'sale9', saleId: 'sale9', date: Timestamp.now(), userId: 'e-cash', userName: 'Cashier',
  });
  batch.set(doc(cashier, `boutiques/${SHOP}/sales/sale9`), { userId: 'e-cash', total: 1000 });
  batch.update(doc(cashier, `boutiques/${SHOP}/products/p1`), { stock: increment(-2) });
  await batch.commit();
});
