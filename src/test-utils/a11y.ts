/**
 * Test helpers for the accessibility checks (used by src/__tests__/a11y.test.tsx).
 * Not part of the app bundle: only tests import this file.
 */
import type { TestInstance } from 'test-renderer';

function textOf(node: TestInstance | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textOf).join('');
}

function accessibleName(n: TestInstance): string {
  const label = n.props.accessibilityLabel ?? n.props['aria-label'];
  return typeof label === 'string' ? label : textOf(n);
}

/**
 * Every element a person can tap must tell a screen reader what it is (role)
 * and what it does (name); every text field and switch needs a label.
 * Returns readable problems (empty = all good).
 */
export function a11yProblems(root: TestInstance): string[] {
  const problems: string[] = [];
  const tappable = root.queryAll(
    (n) =>
      (n.type === 'View' && typeof n.props.onClick === 'function') ||
      (n.type === 'Text' && typeof n.props.onPress === 'function'),
  );
  for (const n of tappable) {
    const role = n.props.accessibilityRole ?? n.props.role;
    const name = accessibleName(n).trim();
    if (!role) problems.push(`tappable without a role: "${name || '(no name)'}"`);
    if (!name) problems.push(`tappable without a name (role ${role ?? 'none'})`);
  }
  for (const n of root.queryAll((x) => x.type === 'TextInput' || x.type === 'RCTSwitch')) {
    const label = n.props.accessibilityLabel ?? n.props['aria-label'];
    if (typeof label !== 'string' || !label.trim()) problems.push(`${n.type} without a label`);
  }
  return [...new Set(problems)];
}

/** WCAG 2.x contrast ratio of two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(bl!);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
