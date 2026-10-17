import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCaseCompany } from './default-case-company.ts';

const now = new Date('2026-10-17T05:00:00Z');
const kalika = [
  { id: 'old', name: 'Kalika Steel Alloys Pvt Ltd - (25-26)' },
  { id: 'current', name: 'Kalika Steel Alloys Pvt Ltd - (26-27)' },
];

test('defaults Kalika current FY even when unrelated businesses are permitted', () => {
  assert.equal(defaultCaseCompany([...kalika, { id: 'nyx', name: 'Solution Nyx - 2026-27' }, { id: 'meenakshi', name: 'Meenakshi - 2026-27' }], now), 'current');
  assert.equal(defaultCaseCompany(kalika, now), 'current');
  assert.equal(defaultCaseCompany([kalika[0]], now), 'old');
});

test('accepts the reviewed Kalika legal-name forms and never matches unrelated names', () => {
  for (const name of ['Kalika Steel', 'Kalika Steel Alloys', 'Kalika Steel Alloys Private Limited']) {
    assert.equal(defaultCaseCompany([{ id: 'kalika', name: `${name} - FY 2026-27` }], now), 'kalika');
  }
  for (const name of ['Kalika Steel Traders', 'Other Kalika Steel', 'Solution Nyx', 'Meenakshi']) {
    assert.equal(defaultCaseCompany([{ id: 'other', name }], now), '');
  }
});

test('refuses duplicate current years, absent Kalika access and ambiguous old years', () => {
  assert.equal(defaultCaseCompany([], now), '');
  assert.equal(defaultCaseCompany([...kalika, { ...kalika[1], id: 'duplicate' }], now), '');
  assert.equal(defaultCaseCompany([kalika[0], { id: 'older', name: 'Kalika Steel Alloys Pvt Ltd - (24-25)' }], now), '');
});

test('uses the Indian financial-year boundary', () => {
  assert.equal(defaultCaseCompany(kalika, new Date('2026-03-31T18:29:59Z')), 'old');
  assert.equal(defaultCaseCompany(kalika, new Date('2026-03-31T18:30:00Z')), 'current');
});
