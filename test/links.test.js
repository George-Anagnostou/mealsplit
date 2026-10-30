import { test } from 'node:test';
import assert from 'node:assert/strict';
import { venmoWebLink, venmoAppLink, billNote, shareMessage, smsLink, groupSummary } from '../js/links.js';

test('venmo web link', () => {
  const u = new URL(venmoWebLink({ username: '@sam-b', cents: 1462, note: 'Tacos 10/30' }));
  assert.equal(u.origin + u.pathname, 'https://venmo.com/');
  assert.equal(u.searchParams.get('txn'), 'charge');
  assert.equal(u.searchParams.get('audience'), 'private');
  assert.equal(u.searchParams.get('recipients'), 'sam-b');
  assert.equal(u.searchParams.get('amount'), '14.62');
  assert.equal(u.searchParams.get('note'), 'Tacos 10/30');
  assert.match(venmoWebLink({ username: 'x', cents: 5, note: 'a b' }), /note=a%20b/);
  assert.match(venmoWebLink({ username: 'x', cents: 5, note: 'a b' }), /amount=0\.05/);
});
test('venmo link without a username omits recipients; app scheme', () => {
  assert.doesNotMatch(venmoWebLink({ cents: 100, note: 'x' }), /recipients/);
  assert.match(venmoAppLink({ username: 'sam', cents: 100, note: 'x' }), /^venmo:\/\/paycharge\?txn=charge&recipients=sam&amount=1\.00/);
});
test('note + message + sms', () => {
  assert.equal(billNote('Tacos', '2026-10-30'), 'Tacos 10/30');
  assert.equal(billNote('', ''), 'Dinner');
  const msg = shareMessage({ name: 'Sam Smith', cents: 1462, note: 'Tacos 10/30', me: {} });
  assert.equal(msg, 'Hey Sam, your share of Tacos 10/30 is $14.62.');
  assert.match(shareMessage({ name: 'Sam', cents: 100, note: 'x', me: { venmo: '@geo', contact: 'g@x.com' } }), /Venmo @geo or Zelle\/Apple Cash g@x\.com/);
  assert.equal(smsLink({ to: '+15551234567', body: 'Hi & bye' }), 'sms:+15551234567?&body=Hi%20%26%20bye');
});
test('group summary', () => {
  const s = groupSummary({ note: 'Tacos 10/30', totalC: 3000, rows: [{ name: 'Sam', totalC: 1500, itemsC: 1200, taxC: 100, tipC: 200, feesC: 0, discountC: 0 }], meRow: { name: 'Me', totalC: 1500 } });
  assert.match(s, /Tacos 10\/30 — total \$30\.00/);
  assert.match(s, /Sam: \$15\.00 {2}\(items \$12\.00 \+ tax \$1\.00, tip \$2\.00\)/);
  assert.match(s, /Me: \$15\.00 \(not charged\)/);
});

import { zelleMessage } from '../js/links.js';
test('zelle message', () => {
  assert.equal(zelleMessage({ name: 'Sam', cents: 1462, note: 'Tacos 10/30', me: { contact: 'g@x.com' } }), 'Hey Sam, your share of Tacos 10/30 is $14.62. Zelle it to g@x.com.');
  assert.match(zelleMessage({ name: 'Sam', cents: 100, note: 'x', me: {} }), /Zelle it to me/);
});
