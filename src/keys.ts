// KeyboardEvent.code -> PS/2 set 1 scan code. Sending the physical key (not the
// character) lets the remote machine apply its own keyboard layout, like AnyDesk.

const scan: Record<string, number> = {
  Escape: 0x01, Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f,
  BracketLeft: 0x1a, BracketRight: 0x1b, Enter: 0x1c, ControlLeft: 0x1d,
  Semicolon: 0x27, Quote: 0x28, Backquote: 0x29, ShiftLeft: 0x2a, Backslash: 0x2b,
  Comma: 0x33, Period: 0x34, Slash: 0x35, ShiftRight: 0x36, NumpadMultiply: 0x37,
  AltLeft: 0x38, Space: 0x39, CapsLock: 0x3a, NumLock: 0x45, ScrollLock: 0x46,
  NumpadSubtract: 0x4a, NumpadAdd: 0x4e, NumpadDecimal: 0x53, IntlBackslash: 0x56,
  F11: 0x57, F12: 0x58, IntlRo: 0x73, NumpadComma: 0x7e,
  NumpadEnter: 0xe01c, ControlRight: 0xe01d, NumpadDivide: 0xe035, PrintScreen: 0xe037,
  AltRight: 0xe038, Home: 0xe047, ArrowUp: 0xe048, PageUp: 0xe049, ArrowLeft: 0xe04b,
  ArrowRight: 0xe04d, End: 0xe04f, ArrowDown: 0xe050, PageDown: 0xe051, Insert: 0xe052,
  Delete: 0xe053, MetaLeft: 0xe05b, MetaRight: 0xe05c, ContextMenu: 0xe05d,
};
const rows: [string, number][] = [["QWERTYUIOP", 0x10], ["ASDFGHJKL", 0x1e], ["ZXCVBNM", 0x2c]];
for (const [letters, start] of rows) [...letters].forEach((l, i) => (scan["Key" + l] = start + i));
"1234567890".split("").forEach((d, i) => (scan["Digit" + d] = 0x02 + i));
for (let i = 1; i <= 10; i++) scan["F" + i] = 0x3a + i;
// numpad digits sit in a 3x3 grid plus 0
Object.entries({ 7: 0x47, 8: 0x48, 9: 0x49, 4: 0x4b, 5: 0x4c, 6: 0x4d, 1: 0x4f, 2: 0x50, 3: 0x51, 0: 0x52 })
  .forEach(([d, s]) => (scan["Numpad" + d] = s));

export const scanCode = (code: string): number | undefined => scan[code];
