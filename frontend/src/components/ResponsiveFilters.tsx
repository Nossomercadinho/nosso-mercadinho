import { useId, useState } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";

export default function ResponsiveFilters({
  children,
  activeCount = 0,
  label = "Filtros",
  onClear,
}: {
  children: ReactNode;
  activeCount?: number;
  label?: string;
  onClear?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <div className={`responsive-filters ${expanded ? "is-expanded" : ""}`}>
      <div className="mobile-filter-toolbar">
        <button
          type="button"
          className="mobile-filter-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={id}
        >
          <Icon name="filter" size={18} />
          <span>{label}</span>
          {activeCount > 0 && (
            <span className="filter-count">{activeCount}</span>
          )}
          <Icon name="chevron" size={15} />
        </button>
        {activeCount > 0 && onClear && (
          <button type="button" className="filter-clear" onClick={onClear}>
            Limpar
          </button>
        )}
      </div>
      <div id={id} className="responsive-filter-content">
        {children}
        {onClear && (
          <button
            type="button"
            className="desktop-filter-clear"
            disabled={!activeCount}
            onClick={onClear}
          >
            Limpar
          </button>
        )}
        <button
          className="filter-done"
          type="button"
          onClick={() => setExpanded(false)}
        >
          <Icon name="check" size={16} />
          Recolher filtros
        </button>
      </div>
    </div>
  );
}
