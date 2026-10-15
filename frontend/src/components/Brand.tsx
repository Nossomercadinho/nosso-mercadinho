import { useId } from "react";
import logo from "../assets/logo.png";

export default function Brand({ compact = false }: { compact?: boolean }) {
  const id = useId();
  return (
    <svg
      className={compact ? "brand-symbol" : "brand-lockup"}
      viewBox={compact ? "54 382 338 338" : "48 376 964 390"}
      role="img"
      aria-label="Nosso Mercadinho"
      preserveAspectRatio="xMidYMid meet"
    >
      {compact && (
        <defs>
          <clipPath id={id}>
            <circle cx="223" cy="551" r="169" />
          </clipPath>
        </defs>
      )}
      <image
        href={logo}
        width="1024"
        height="1024"
        clipPath={compact ? `url(#${id})` : undefined}
      />
    </svg>
  );
}
