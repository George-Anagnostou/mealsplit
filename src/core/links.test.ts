import { expect, test } from 'vitest';
import {
  billNote,
  groupSummary,
  shareMessage,
  smsLink,
  venmoAppLink,
  venmoWebLink,
  zelleMessage,
} from './links';

test('venmo web link', () => {
  const u = new URL(venmoWebLink({ username: '@sam-b', cents: 1462, note: 'Tacos 10/30' }));
  expect(u.origin + u.pathname).toBe('https://venmo.com/');
  expect(u.searchParams.get('txn')).toBe('charge');
  expect(u.searchParams.get('audience')).toBe('private');
  expect(u.searchParams.get('recipients')).toBe('sam-b');
  expect(u.searchParams.get('amount')).toBe('14.62');
  expect(u.searchParams.get('note')).toBe('Tacos 10/30');
  expect(venmoWebLink({ username: 'x', cents: 5, note: 'a b' })).toMatch(/note=a%20b/);
  expect(venmoWebLink({ username: 'x', cents: 5, note: 'a b' })).toMatch(/amount=0\.05/);
});
test('venmo link without a username omits recipients; app scheme', () => {
  expect(venmoWebLink({ cents: 100, note: 'x' })).not.toMatch(/recipients/);
  expect(venmoAppLink({ username: 'sam', cents: 100, note: 'x' })).toMatch(
    /^venmo:\/\/paycharge\?txn=charge&recipients=sam&amount=1\.00/,
  );
});
test('note + message + sms', () => {
  expect(billNote('Tacos', '2026-10-30')).toBe('Tacos 10/30');
  expect(billNote('', '')).toBe('Dinner');
  const msg = shareMessage({ name: 'Sam Smith', cents: 1462, note: 'Tacos 10/30', me: {} });
  expect(msg).toBe('Hey Sam, your share of Tacos 10/30 is $14.62.');
  expect(
    shareMessage({ name: 'Sam', cents: 100, note: 'x', me: { venmo: '@geo', contact: 'g@x.com' } }),
  ).toMatch(/Venmo @geo or Zelle\/Apple Cash g@x\.com/);
  expect(smsLink({ to: '+15551234567', body: 'Hi & bye' })).toBe(
    'sms:+15551234567?&body=Hi%20%26%20bye',
  );
});
test('group summary', () => {
  const s = groupSummary({
    note: 'Tacos 10/30',
    totalC: 3000,
    rows: [
      { name: 'Sam', totalC: 1500, itemsC: 1200, taxC: 100, tipC: 200, feesC: 0, discountC: 0 },
    ],
    meRow: { name: 'Me', totalC: 1500 },
  });
  expect(s).toMatch(/Tacos 10\/30 — total \$30\.00/);
  expect(s).toMatch(/Sam: \$15\.00 {2}\(items \$12\.00 \+ tax \$1\.00, tip \$2\.00\)/);
  expect(s).toMatch(/Me: \$15\.00 \(not charged\)/);
});

test('zelle message', () => {
  expect(
    zelleMessage({ name: 'Sam', cents: 1462, note: 'Tacos 10/30', me: { contact: 'g@x.com' } }),
  ).toBe('Hey Sam, your share of Tacos 10/30 is $14.62. Zelle it to g@x.com.');
  expect(zelleMessage({ name: 'Sam', cents: 100, note: 'x', me: {} })).toMatch(/Zelle it to me/);
});
