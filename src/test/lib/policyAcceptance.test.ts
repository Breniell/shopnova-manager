import { describe, it, expect } from 'vitest';
import { POLICY_REVISION, isPolicyRecordValid, buildPolicyRecord } from '@/lib/policyAcceptance';

describe('acceptation de la politique', () => {
  it("n'est pas redemandée après une mise à jour du logiciel", () => {
    const signedOn113 = JSON.stringify({ version: '1.13.1', accepted: true, name: 'Awa', date: '2026-01-01' });
    expect(isPolicyRecordValid(signedOn113)).toBe(true);
  });

  it('un enregistrement récent reste valide quelle que soit la version du logiciel', () => {
    const rec = JSON.stringify(buildPolicyRecord('Awa', '1.14.0'));
    expect(isPolicyRecordValid(rec)).toBe(true);
    expect(JSON.parse(rec).policyRevision).toBe(POLICY_REVISION);
  });

  it('est redemandée quand la révision de la politique change', () => {
    const old = JSON.stringify({ ...buildPolicyRecord('Awa', '1.14.0'), policyRevision: '0.9' });
    expect(isPolicyRecordValid(old)).toBe(false);
  });

  it('refuse un enregistrement absent, refusé ou illisible', () => {
    expect(isPolicyRecordValid(null)).toBe(false);
    expect(isPolicyRecordValid('{"accepted":false}')).toBe(false);
    expect(isPolicyRecordValid('pas du json')).toBe(false);
  });
});
