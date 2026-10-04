import { Children, isValidElement, type ReactNode } from 'react';
import { H2 } from './primitives';

export interface DocHeading {
  id: string;
  label: string;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** Section headings (`<H2 id>`) of an article body, in document order. Used for the table of contents. */
export function collectHeadings(body: ReactNode): DocHeading[] {
  const out: DocHeading[] = [];
  const visit = (node: ReactNode) =>
    Children.forEach(node, (child) => {
      if (!isValidElement<{ id?: string; children?: ReactNode }>(child)) return;
      if (child.type === H2 && child.props.id) out.push({ id: child.props.id, label: textOf(child.props.children) });
      else visit(child.props.children);
    });
  visit(body);
  return out;
}
