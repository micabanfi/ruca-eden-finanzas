"use client";

import { useState } from "react";

/** Botón que copia `text` al portapapeles y muestra "¡Copiado!" un instante. */
export default function CopyBtn({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="rounded bg-green-700 px-3 py-1 text-sm font-medium text-white hover:bg-green-800"
    >
      {done ? "¡Copiado!" : label}
    </button>
  );
}
