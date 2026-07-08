export type CommandItem = {
  el: HTMLAnchorElement;
  label: string;
  section: string;
};

export function navLinks(): CommandItem[] {
  const links: CommandItem[] = [];
  const nodes = document.querySelectorAll<HTMLAnchorElement>('#sidebar ul.sidebar-nav a[href]');

  nodes.forEach((anchor) => {
    if (anchor.getAttribute('data-bs-toggle') === 'collapse') return;

    const label = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (!label) return;

    let section = '';
    const list = anchor.closest('ul');
    if (list?.id) {
      const parent = document.querySelector<HTMLAnchorElement>(`a[href="#${CSS.escape(list.id)}"]`);
      section = (parent?.textContent || '').trim();
    }

    links.push({ el: anchor, label, section: section || 'Navigation' });
  });

  return links;
}

export function filterCommandItems(items: CommandItem[], query: string) {
  const needle = query.toLowerCase().trim();
  if (!needle) return items;

  return items.filter((item) => {
    return `${item.label} ${item.section}`.toLowerCase().includes(needle);
  });
}

export function groupCommandItems(items: CommandItem[]) {
  return items.reduce<Record<string, Array<{ item: CommandItem; idx: number }>>>((groups, item, idx) => {
    if (!groups[item.section]) groups[item.section] = [];
    groups[item.section].push({ item, idx });
    return groups;
  }, {});
}
