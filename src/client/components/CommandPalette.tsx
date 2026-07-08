import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { filterCommandItems, groupCommandItems, navLinks, type CommandItem } from '../lib/navigation';

function ChartIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </svg>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommandItem[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterCommandItems(items, query), [items, query]);
  const groups = useMemo(() => groupCommandItems(filtered), [filtered]);

  const openPalette = () => {
    setItems(navLinks());
    setQuery('');
    setSelected(0);
    setOpen(true);
  };

  const closePalette = () => setOpen(false);

  const execute = (item: CommandItem | undefined) => {
    if (!item) return;
    closePalette();
    item.el.click();
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (selected >= filtered.length) {
      setSelected(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selected]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, query]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest?.('#btnCmdk');
      if (!button) return;
      event.preventDefault();
      open ? closePalette() : openPalette();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open ? closePalette() : openPalette();
        return;
      }

      if (!open) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closePalette();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((current) => Math.min(current + 1, filtered.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((current) => Math.max(current - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        execute(filtered[selected]);
      }
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filtered, open, selected]);

  if (!open) return null;

  return (
    <div className="cmdk-overlay" id="cmdkOverlay" onClick={(event) => {
      if (event.target === event.currentTarget) closePalette();
    }}>
      <div className="cmdk" role="dialog" aria-label="Command palette" aria-modal="true">
        <div className="cmdk-input-wrap">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            id="cmdkInput"
            type="text"
            placeholder="Jump to chart, device, or interface…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setSelected(0);
            }}
          />
          <span className="cmdk-esc">esc</span>
        </div>
        <div className="cmdk-list" id="cmdkList" role="listbox">
          {!filtered.length ? (
            <div className="cmdk-empty">No matching charts</div>
          ) : (
            Object.keys(groups).sort().map((section) => (
              <Fragment key={section}>
                <div className="cmdk-group-label">{section}</div>
                {groups[section].map(({ item, idx }) => {
                  const isSelected = idx === selected;
                  return (
                    <div
                      key={`${section}-${item.label}-${idx}`}
                      ref={isSelected ? selectedRef : undefined}
                      className={`cmdk-item${isSelected ? ' is-selected' : ''}`}
                      data-idx={idx}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => execute(item)}
                    >
                      <ChartIcon />
                      <span className="cmdk-item-name">{item.label}</span>
                      {item.section !== 'Navigation' ? <span className="cmdk-item-context">{item.section}</span> : null}
                    </div>
                  );
                })}
              </Fragment>
            ))
          )}
        </div>
        <div className="cmdk-footer"><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
      </div>
    </div>
  );
}
