import assert from 'node:assert/strict';
import test from 'node:test';

import { suggestBankLedgersForTransactions } from './bank-statement-ledger-matching.ts';

test('complete connector vector shortlists do not read the cloud master catalogue', async () => {
  let cloudReads = 0;
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const suggestions = await suggestBankLedgersForTransactions({
      supabase: {
        from() {
          cloudReads += 1;
          throw new Error('cloud catalogue must not be read');
        },
      },
      ownerUserId: 'user-1',
      connectionId: 'connection-1',
      companyName: 'Example Company',
      vectorCandidates: [[{
        ledgerName: 'Shree Maa Steels Private Limited',
        tallyGuid: 'ledger-guid-1',
        parentGroup: 'Sundry Debtors',
        vectorScore: 0.91,
        rank: 1,
      }]],
      transactions: [{
        accountId: 'account-1',
        transaction: {
          description: 'RTGS SHREE MAA STEELS',
          category: 'customer_receipt',
          counterpartyName: 'Shree Maa Steels',
        },
      }],
    });
    assert.equal(cloudReads, 0);
    assert.equal(suggestions.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});
