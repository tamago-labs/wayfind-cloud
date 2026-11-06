export interface DocLink {
  href: string;
  label: string;
}

export interface DocSection {
  title: string;
  links: DocLink[];
}

export const DOC_NAV: DocSection[] = [
  {
    title: 'Start',
    links: [
      { href: '/docs', label: 'Introduction' },
      { href: '/docs/quickstart', label: 'Quickstart' },
    ],
  },
  {
    title: 'Product',
    links: [
      { href: '/docs/bots', label: 'Bots' },
      { href: '/docs/routines', label: 'Routines' },
      { href: '/docs/computer', label: 'Cloud computer' },
      { href: '/docs/connectors', label: 'Connectors' },
      { href: '/docs/billing', label: 'Billing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/docs/models', label: 'Models' },
      { href: '/docs/changelog', label: 'Changelog' },
    ],
  },
];

/** Flat page order for prev/next navigation. */
export const DOC_ORDER: DocLink[] = DOC_NAV.flatMap((s) => s.links);

export function docNeighbors(pathname: string): { prev?: DocLink; next?: DocLink } {
  const i = DOC_ORDER.findIndex((l) => l.href === pathname);
  if (i === -1) return {};
  return {
    prev: i > 0 ? DOC_ORDER[i - 1] : undefined,
    next: i < DOC_ORDER.length - 1 ? DOC_ORDER[i + 1] : undefined,
  };
}
