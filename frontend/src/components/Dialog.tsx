import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";

export default function Dialog({
  children,
  open,
  title,
  close,
}: {
  children: ReactNode;
  open: boolean;
  title: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.current?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="app-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <div className="app-dialog-surface">
        <div className="app-dialog-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar detalhes"
            onClick={close}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
