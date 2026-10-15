import type { CSSProperties } from "react";

const paths: Record<string, string> = {
  barcode:
    "M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M6 7v10M9 7v10M12 7v10M15 7v10M18 7v10",
  plus: "M12 5v14M5 12h14",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  filter: "M4 6h16M7 12h10M10 18h4M8 3v6M16 9v6M12 15v6",
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  box: "m12 3 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V8M12 13v10M7.5 5.5l9 5",
  stock: "M3 21V7l9-4 9 4v14M3 10h18M7 21v-7h10v7M10 14v7M3 21h18",
  cart: "M3 3h2l3 12h10l3-8H6M9 20h.01M18 20h.01",
  wallet: "M20 7V4H5a2 2 0 0 0 0 4h16v12H5a2 2 0 0 1-2-2V6M21 12h-6v4h6",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M18 8a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  chart: "M4 3v18h17M8 16v-4M13 16V8M18 16V5",
  truck:
    "M3 5h12v12H3V5Zm12 5h4l3 4v3h-7M8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  store:
    "m3 9 2-6h14l2 6M3 9v3a3 3 0 0 0 4 0 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 4 0V9M5 15v6h14v-6M9 21v-5h6v5M3 9h18",
  transfer: "M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4",
  calendar: "M4 5h16v16H4V5ZM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  collapse: "M4 4h16v16H4V4ZM9 4v16m7-11-3 3 3 3",
  logout: "M9 4H4v16h5M12 12h9m-4-4 4 4-4 4",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  up: "m7 14 5-5 5 5M12 9v10M5 5h14",
  down: "m7 10 5 5 5-5M12 5v10M5 19h14",
  refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2",
  chevron: "m9 5 7 7-7 7",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
};

export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.box} />
    </svg>
  );
}

export const menuIcons: Record<string, string> = {
  "Visão Geral": "home",
  Produtos: "box",
  Estoque: "stock",
  Compras: "cart",
  Financeiro: "wallet",
  "Contas / Boletos": "receipt",
  "Clientes / A Prazo": "users",
  Vendas: "chart",
  Fiscal: "shield",
  Fornecedores: "truck",
  Unidades: "store",
  Transferências: "transfer",
  "Fechamento Diário": "calendar",
  PDV: "cart",
  "Usuários e papéis": "users",
  "Histórico do caixa": "clock",
};
