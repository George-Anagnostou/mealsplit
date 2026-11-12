import { describe, expect, test } from 'vitest';
import {
  billNote,
  cleanEmail,
  cleanPhone,
  cleanVenmo,
  encodeQuery,
  firstName,
  groupSummary,
  owesNothing,
  payInfoLine,
  shareMessage,
  smsLink,
  tidyText,
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

describe('cleanVenmo', () => {
  test.each([
    ['@sam-b', 'sam-b'],
    ['  @@Sam_B  ', 'Sam_B'],
    ['sam b', 'samb'],
    ['sam/b?&#:%=', 'samb'],
    ['@sam😀', 'sam'],
    ['venmo.com/u/sam-b', 'sam-b'],
    ['https://venmo.com/u/sam-b?txn=pay', 'sam-b'],
    ['https://venmo.com/sam-b', 'sam-b'],
    ['', ''],
    ['@', ''],
    ['   ', ''],
  ])('%j -> %j', (input, expected) => {
    expect(cleanVenmo(input)).toBe(expected);
  });
  test('null and undefined', () => {
    expect(cleanVenmo(null)).toBe('');
    expect(cleanVenmo(undefined)).toBe('');
  });
});

describe('venmo links', () => {
  const parse = (url: string) => new URL(url).searchParams;

  test('special characters, ampersands and plus signs in the note survive a round trip', () => {
    const note = 'Tom & Jerry\'s 50% off? a+b=c #1 (party) "ok"! *';
    const url = venmoWebLink({ username: 'sam', cents: 1234, note });
    expect(parse(url).get('note')).toBe(note);
    expect(parse(url).get('amount')).toBe('12.34');
    expect(url).not.toMatch(/[!'()*]/); // nothing a chat app might mangle
    expect(url.split('&').length).toBe(5); // txn, audience, recipients, amount, note
    expect(parse(venmoAppLink({ username: 'sam', cents: 1234, note })).get('note')).toBe(note);
  });

  test('emoji are encoded as UTF-8 and round trip', () => {
    const note = 'Tacos 🌮🎉 👨‍👩‍👧';
    const url = venmoWebLink({ username: 'sam', cents: 500, note });
    expect(url).toContain('%F0%9F%8C%AE');
    expect(parse(url).get('note')).toBe(note);
  });

  test('unicode text and a lone surrogate never throw', () => {
    expect(
      parse(venmoWebLink({ username: 'sam', cents: 1, note: 'Café ñandú 寿司' })).get('note'),
    ).toBe('Café ñandú 寿司');
    const broken = `bad \uD83D surrogate`;
    expect(() => venmoWebLink({ username: 'sam', cents: 1, note: broken })).not.toThrow();
    expect(parse(venmoWebLink({ username: 'sam', cents: 1, note: broken })).get('note')).toBe(
      'bad \uFFFD surrogate',
    );
  });

  test('empty, blank and missing notes leave out the note parameter', () => {
    for (const note of ['', '   ', '\n\t', undefined]) {
      const q = parse(venmoWebLink({ username: 'sam', cents: 100, note }));
      expect(q.has('note')).toBe(false);
    }
    expect(venmoWebLink({ username: 'sam', cents: 100 })).not.toMatch(/note/);
    expect(venmoAppLink({ username: 'sam', cents: 100, note: '' })).not.toMatch(/note/);
  });

  test('newlines and runs of whitespace in the note are tidied', () => {
    const q = parse(venmoWebLink({ username: 'sam', cents: 100, note: '  Tacos\r\n  10/30\t ' }));
    expect(q.get('note')).toBe('Tacos 10/30');
  });

  test('the username is cleaned; an unusable one is left out', () => {
    expect(
      parse(venmoWebLink({ username: ' @Sam B/?& ', cents: 100, note: 'x' })).get('recipients'),
    ).toBe('SamB');
    expect(venmoAppLink({ username: '@sam-b', cents: 100, note: 'x' })).toContain(
      'recipients=sam-b&',
    );
    for (const username of ['@', '  ', '😀', undefined, null as unknown as string]) {
      expect(venmoWebLink({ username, cents: 100, note: 'x' })).not.toMatch(/recipients/);
      expect(venmoAppLink({ username, cents: 100, note: 'x' })).not.toMatch(/recipients/);
    }
  });

  test('the amount is never negative, NaN or unrounded', () => {
    expect(parse(venmoWebLink({ username: 's', cents: -500, note: 'x' })).get('amount')).toBe(
      '0.00',
    );
    expect(parse(venmoWebLink({ username: 's', cents: Number.NaN, note: 'x' })).get('amount')).toBe(
      '0.00',
    );
    expect(parse(venmoWebLink({ username: 's', cents: 1234.6, note: 'x' })).get('amount')).toBe(
      '12.35',
    );
    expect(parse(venmoWebLink({ username: 's', cents: 100000, note: 'x' })).get('amount')).toBe(
      '1000.00',
    );
  });

  test('the venmo:// app fallback keeps its scheme and fields', () => {
    const url = venmoAppLink({ username: 'sam', cents: 1462, note: 'Tacos & 🌮' });
    expect(url.startsWith('venmo://paycharge?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(Object.fromEntries(q)).toEqual({
      txn: 'charge',
      recipients: 'sam',
      amount: '14.62',
      note: 'Tacos & 🌮',
    });
  });
});

describe('encodeQuery and tidyText', () => {
  test('encodes the characters encodeURIComponent leaves alone', () => {
    expect(encodeQuery("!'()*")).toBe('%21%27%28%29%2A');
    expect(encodeQuery('a b&c')).toBe('a%20b%26c');
    expect(encodeQuery(null)).toBe('');
    expect(encodeQuery(undefined)).toBe('');
  });
  test('tidyText strips control characters and collapses whitespace', () => {
    expect(tidyText('  a\u0000b\u200b\u2028c\u007f d \n e ')).toBe('a b\u200b c d e');
    expect(tidyText(null)).toBe('');
    expect(tidyText(42 as unknown as string)).toBe('42');
  });
});

describe('phone and email cleaning', () => {
  test.each([
    ['(555) 123-4567', '5551234567'],
    ['555.123.4567', '5551234567'],
    ['+1 (555) 123-4567', '+15551234567'],
    ['  +44 20 7946 0958 ', '+442079460958'],
    ['555-123-4567 x12', '5551234567'],
    ['555-123-4567 ext. 9', '5551234567'],
    ['1-555-123-4567', '15551234567'],
    ['12345', ''], // too short
    ['1234567890123456', ''], // too long
    ['sam@x.com', ''], // not a phone
    ['', ''],
  ])('cleanPhone %j -> %j', (input, expected) => {
    expect(cleanPhone(input)).toBe(expected);
  });
  test('cleanPhone and cleanEmail tolerate null/undefined', () => {
    expect(cleanPhone(null)).toBe('');
    expect(cleanPhone(undefined)).toBe('');
    expect(cleanEmail(null)).toBe('');
  });
  test.each([
    ['sam@x.com', 'sam@x.com'],
    ['  sam.b+tag@mail.example.org ', 'sam.b+tag@mail.example.org'],
    ['sam@', ''],
    ['sam @x.com', ''],
    ['a@b', ''],
    ['sam@x.com, joe@y.com', ''],
  ])('cleanEmail %j -> %j', (input, expected) => {
    expect(cleanEmail(input)).toBe(expected);
  });
});

describe('smsLink', () => {
  test('strips formatting from the phone number', () => {
    expect(smsLink({ to: '(555) 123-4567', body: 'Hi' })).toBe('sms:5551234567?&body=Hi');
    expect(smsLink({ to: ' +1 555.123.4567 ', body: 'Hi' })).toBe('sms:+15551234567?&body=Hi');
  });
  test('no phone number opens the composer with only a body', () => {
    for (const to of [undefined, null, '', '   ', 'not a number', '12']) {
      expect(smsLink({ to, body: 'Hi there' })).toBe('sms:?&body=Hi%20there');
    }
  });
  test('an email contact is used as the recipient', () => {
    expect(smsLink({ to: ' sam@x.com ', body: 'Hi' })).toBe('sms:sam@x.com?&body=Hi');
  });
  test('the body is fully encoded: emoji, ampersands, newlines, percent signs', () => {
    const body = 'Tacos 🌮 & more\r\n100% sure?';
    const link = smsLink({ to: '5551234567', body });
    expect(link).toBe('sms:5551234567?&body=Tacos%20%F0%9F%8C%AE%20%26%20more%0A100%25%20sure%3F');
    expect(decodeURIComponent(link.split('&body=')[1])).toBe('Tacos 🌮 & more\n100% sure?');
  });
  test('an empty body still produces a valid link', () => {
    expect(smsLink({ to: '5551234567', body: '' })).toBe('sms:5551234567?&body=');
    expect(smsLink({ body: undefined as unknown as string })).toBe('sms:?&body=');
  });
});

describe('payInfoLine, shareMessage, zelleMessage', () => {
  test('payInfoLine skips blank or unusable details', () => {
    expect(payInfoLine(undefined)).toBe('');
    expect(payInfoLine(null)).toBe('');
    expect(payInfoLine({})).toBe('');
    expect(payInfoLine({ venmo: '', contact: '' })).toBe('');
    expect(payInfoLine({ venmo: '@', contact: '   ' })).toBe('');
    expect(payInfoLine({ venmo: '😀' })).toBe('');
  });
  test('payInfoLine with one or both', () => {
    expect(payInfoLine({ venmo: ' @geo ' })).toBe(' You can pay me on Venmo @geo.');
    expect(payInfoLine({ contact: ' g@x.com ' })).toBe(
      ' You can pay me on Zelle/Apple Cash g@x.com.',
    );
    expect(payInfoLine({ venmo: 'venmo.com/u/geo', contact: '555 1234' })).toBe(
      ' You can pay me on Venmo @geo or Zelle/Apple Cash 555 1234.',
    );
  });
  test('zelleMessage with a blank contact falls back to the generic line', () => {
    for (const contact of ['', '   ', undefined]) {
      expect(zelleMessage({ name: 'Sam', cents: 100, note: 'x', me: { contact } })).toBe(
        'Hey Sam, your share of x is $1.00. Zelle it to me when you get a sec.',
      );
    }
    expect(zelleMessage({ name: 'Sam', cents: 100, note: 'x', me: null })).toMatch(
      /Zelle it to me/,
    );
  });
  test('zelleMessage trims the contact', () => {
    expect(
      zelleMessage({ name: 'Sam', cents: 100, note: 'x', me: { contact: '  555-1234 ' } }),
    ).toBe('Hey Sam, your share of x is $1.00. Zelle it to 555-1234.');
  });
  test('an empty note and odd names do not leave gaps', () => {
    expect(shareMessage({ name: 'Sam', cents: 250, note: '', me: {} })).toBe(
      'Hey Sam, your share is $2.50.',
    );
    expect(zelleMessage({ name: '', cents: 250, note: '  ', me: {} })).toBe(
      'Hey there, your share is $2.50. Zelle it to me when you get a sec.',
    );
    expect(firstName('  Sam   Smith ')).toBe('Sam');
    expect(firstName(null)).toBe('there');
    expect(firstName('   ')).toBe('there');
  });
  test('a note with emoji and newlines is kept readable in messages', () => {
    expect(shareMessage({ name: 'Sam', cents: 100, note: 'Tacos 🌮\n10/30', me: {} })).toBe(
      'Hey Sam, your share of Tacos 🌮 10/30 is $1.00.',
    );
  });
});

describe('groupSummary with a discount', () => {
  const row = {
    name: 'Sam',
    totalC: 1100,
    itemsC: 1200,
    taxC: 100,
    tipC: 0,
    feesC: 0,
    discountC: -200, // computeSplit reports party discounts as negatives
  };
  test('shows the discount as a deduction', () => {
    const s = groupSummary({ note: 'Tacos', totalC: 2200, rows: [row], meRow: null });
    expect(s).toBe(
      'Tacos — total $22.00\nSam: $11.00  (items $12.00 + tax $1.00, discount -$2.00)',
    );
  });
  test('a positive discount value reads the same way', () => {
    const s = groupSummary({ note: 'Tacos', totalC: 2200, rows: [{ ...row, discountC: 200 }] });
    expect(s).toContain('discount -$2.00');
    expect(s).not.toContain('--');
  });
  test('no discount, fees, and an empty table', () => {
    const noDisc = groupSummary({
      note: 'x',
      totalC: 100,
      rows: [{ ...row, discountC: 0, feesC: 50, tipC: 25 }],
    });
    expect(noDisc).toContain('tax $1.00, tip $0.25, fees $0.50');
    expect(noDisc).not.toContain('discount');
    expect(groupSummary({ note: 'x', totalC: 0, rows: [] })).toBe('x — total $0.00');
  });
  test('the me row is marked not charged', () => {
    expect(
      groupSummary({ note: 'x', totalC: 100, rows: [], meRow: { name: 'Geo', totalC: 0 } }),
    ).toContain('Geo: $0.00 (not charged)');
  });
});

test('owesNothing: zero, negative and non-finite shares need no request', () => {
  expect(owesNothing(0)).toBe(true);
  expect(owesNothing(-1)).toBe(true);
  expect(owesNothing(0.4)).toBe(true); // rounds to 0
  expect(owesNothing(Number.NaN)).toBe(true);
  expect(owesNothing(1)).toBe(false);
  expect(owesNothing(1462)).toBe(false);
});
