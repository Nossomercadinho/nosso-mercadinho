import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

export default function AccountMenu({
  name,
  role,
  logout,
}: {
  name: string;
  role: string;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="account-menu" ref={container}>
      <button
        type="button"
        ref={trigger}
        className="account-trigger"
        aria-label={`Minha conta: ${name}`}
        aria-expanded={open}
        aria-controls="account-dropdown"
        onClick={() => setOpen((value) => !value)}
      >
        {name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toLocaleUpperCase("pt-BR")}
      </button>
      {open && (
        <div
          className="account-dropdown"
          id="account-dropdown"
          onBlur={(event) => {
            if (!container.current?.contains(event.relatedTarget as Node))
              setOpen(false);
          }}
        >
          <span className="account-eyebrow">MINHA CONTA</span>
          <strong>{name}</strong>
          <small>{role}</small>
          <button type="button" onClick={logout}>
            <Icon name="logout" size={18} />
            Sair do sistema
          </button>
        </div>
      )}
    </div>
  );
}
