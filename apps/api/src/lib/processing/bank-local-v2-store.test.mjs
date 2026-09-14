import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveEnvelopeLedgerCount } from './bank-local-v2.mjs';

test('structured connector envelopes claim with the distinct local vector catalogue size', () => {
  assert.equal(effectiveEnvelopeLedgerCount({ ledgerNames: [], vectorCandidates: [
    [{ ledgerName: 'Customer A' }, { ledgerName: 'Customer B' }],
    [{ ledgerName: ' customer a ' }, { ledgerName: 'Bank Charges' }],
  ] }), 3);
});

test('legacy envelopes retain their transferred ledger catalogue count', () => {
  assert.equal(effectiveEnvelopeLedgerCount({ ledgerNames: ['Bank', 'Customer A'], vectorCandidates: [] }), 2);
});
