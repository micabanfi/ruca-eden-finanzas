"use client";

import { useEffect } from "react";
import { parseLocaleNumber } from "@/lib/format";

/** Arregla el pegado de números con formato argentino en los inputs numéricos.
 *
 *  Un `<input type="number">` sólo entiende el formato "máquina" (`262904.86`).
 *  Si se pega `262.904,86` (como viene de la planilla, el homebanking o una
 *  factura), Chrome tira la coma y guarda `262.90486`, silenciosamente y por
 *  factor 1000. Acá interceptamos el `paste` antes de que el browser lo
 *  sanitice, lo interpretamos con `parseLocaleNumber` y escribimos el valor ya
 *  normalizado.
 *
 *  Va montado una sola vez en el layout: así vale para todos los formularios y
 *  también para la edición inline de las tablas, sin tocar cada input. El valor
 *  se escribe con el setter nativo + un evento `input` sintético porque, si no,
 *  React no se entera del cambio en los inputs controlados. */
export default function PasteNumberFix() {
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const el = e.target as HTMLElement | null;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.type !== "number" && el.inputMode !== "decimal") return;

      const text = e.clipboardData?.getData("text") ?? "";
      const n = parseLocaleNumber(text);
      if (n === null) return; // no parece un número: que haga lo de siempre

      e.preventDefault();
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(el, String(n));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, []);

  return null;
}
