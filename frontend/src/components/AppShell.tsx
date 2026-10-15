import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Brand from "./Brand";
import LojaSelector from "./LojaSelector";
import AccountMenu from "./AccountMenu";
import Icon, { menuIcons } from "./Icon";

export default function AppShell({
  children,
  items,
  active,
  navigate,
  logout,
  name,
  role,
}: {
  children: ReactNode;
  items: string[];
  active: string;
  navigate: (page: string) => void;
  logout: () => void;
  name: string;
  role: string;
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("nm-sidebar") === "collapsed",
  );
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  const primary = ["Visão Geral", "Produtos", "Estoque"].filter((item) =>
    items.includes(item),
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || !mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (event.key !== "Tab") return;
      const buttons =
        sidebar.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobile]);

  function go(page: string) {
    navigate(page);
    setOpen(false);
    if (mobile) menuButton.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <div
      className={`app-shell ${collapsed ? "is-collapsed" : ""} ${open ? "is-menu-open" : ""} ${active === "PDV" ? "is-pos" : ""}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      {open && mobile && (
        <div
          className="sidebar-backdrop"
          onClick={() => {
            setOpen(false);
            menuButton.current?.focus();
          }}
          aria-hidden="true"
        />
      )}
      <aside
        ref={sidebar}
        id="app-navigation"
        className="app-sidebar"
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Menu principal"
        inert={mobile && !open ? true : undefined}
      >
        <div className="sidebar-brand-row">
          <div className="brand-image">
            <Brand compact />
            <span className="sidebar-brand-name">Nosso<span>Mercadinho</span></span>
          </div>
          <button
            className="icon-button drawer-close"
            aria-label="Fechar menu"
            onClick={() => {
              setOpen(false);
              menuButton.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="workspace-label">
          <Icon name="store" size={17} />
          <span>
            Gestão do negócio<small>Nosso Mercadinho</small>
          </span>
        </div>
        <div className="navigation-label">PRINCIPAL</div>
        <nav className="app-navigation" aria-label="Módulos">
          {items.map((item) => (
            <button
              type="button"
              key={item}
              title={collapsed && !mobile ? item : undefined}
              aria-label={item}
              aria-current={active === item ? "page" : undefined}
              className={`app-nav-item ${active === item ? "is-active" : ""}`}
              onClick={() => go(item)}
            >
              <Icon name={menuIcons[item]} size={20} />
              <span>{item}</span>
              {active === item && <Icon name="chevron" size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Icon name="shield" size={17} />
          <span>
            Acesso por perfil<small>{role}</small>
          </span>
        </div>
        <button
          type="button"
          className="sidebar-collapse"
          onClick={() =>
            setCollapsed((value) => {
              localStorage.setItem(
                "nm-sidebar",
                !value ? "collapsed" : "expanded",
              );
              return !value;
            })
          }
          aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expandir sidebar" : undefined}
        >
          <Icon name="collapse" />
          <span>Recolher menu</span>
        </button>
      </aside>
      <div className="app-workspace" inert={mobile && open ? true : undefined}>
        <header className="app-header">
          <div className="header-leading">
            <button
              type="button"
              className="icon-button mobile-menu-button"
              ref={menuButton}
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={open}
              aria-controls="app-navigation"
            >
              <Icon name="menu" />
            </button>
            <span className="header-context">Meu negócio</span>
            <Icon name="chevron" size={14} />
            <strong>{active}</strong>
          </div>
          <div className="header-actions"><LojaSelector />
            <AccountMenu name={name} role={role} logout={logout} />
          </div>
        </header>
        <main id="main-content" className="app-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>Nosso Mercadinho</span>
          <span>Gestão simples. Rotina em dia.</span>
        </footer>
      </div>
      <nav
        className="mobile-tabbar"
        aria-label="Acesso rápido"
        inert={mobile && open ? true : undefined}
      >
        {primary.map((item) => (
          <button
            key={item}
            type="button"
            className={active === item ? "is-active" : ""}
            onClick={() => go(item)}
            aria-current={active === item ? "page" : undefined}
          >
            <Icon name={menuIcons[item]} />
            <span>{item === "Visão Geral" ? "Início" : item}</span>
          </button>
        ))}
        <button
          type="button"
          className={!primary.includes(active) || open ? "is-active" : ""}
          onClick={() => setOpen(true)}
          aria-label="Abrir todos os módulos"
        >
          <Icon name="menu" />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
