import { type InputHTMLAttributes, useState } from 'react';

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'inputMode'> {
  /** Canonical value (cents, percent, ...) owned by the store. */
  value: number;
  parse: (text: string) => number;
  format: (value: number) => string;
  onValue: (value: number) => void;
}

/**
 * Text input bound to a number. What the user types is kept as typed
 * ("12." stays "12.") and is only replaced by the formatted value when the
 * store value changes underneath it (e.g. after parsing a receipt).
 */
export function DecimalInput({ value, parse, format, onValue, ...rest }: Props) {
  const [text, setText] = useState(() => format(value));
  const shown = parse(text) === value ? text : format(value);
  return (
    <input
      {...rest}
      inputMode="decimal"
      value={shown}
      onChange={(e) => {
        setText(e.target.value);
        onValue(parse(e.target.value));
      }}
    />
  );
}
