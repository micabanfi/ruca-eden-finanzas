"use client";

import { useRef, useState, useTransition } from "react";
import { preguntarAsistente, type ChatTurn } from "@/actions/asistente";

const SUGERENCIAS = [
  "¿Qué alquileres tenemos este mes?",
  "¿Cuánto tiene Gustavo?",
  "¿Cuánto gastamos en luz este año?",
  "¿Qué cabaña rindió más en 2025?",
];

export default function AsistenteChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    const history = turns;
    setTurns((t) => [...t, { role: "user", text: q }]);
    if (inputRef.current) inputRef.current.value = "";
    startTransition(async () => {
      const res = await preguntarAsistente(history, q);
      if (!res.ok) {
        setError(res.error ?? "Error");
        return;
      }
      setTurns((t) => [...t, { role: "assistant", text: res.text! }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
  }

  return (
    <div className="mx-auto flex h-[80vh] max-w-3xl flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto rounded border border-neutral-300 bg-white p-3">
        {turns.length === 0 && (
          <div className="space-y-2 py-8 text-center text-sm text-neutral-500">
            <p>Preguntame lo que quieras sobre las finanzas — consulto la base de datos en vivo.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs text-green-900 hover:bg-green-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                t.role === "user"
                  ? "bg-green-700 text-white"
                  : "border border-neutral-200 bg-neutral-50 text-neutral-900"
              }`}
            >
              {t.text}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-green-700" />
            consultando la base…
          </div>
        )}
        {error && <p className="text-sm text-red-700">⚠ {error}</p>}
        <div ref={bottomRef} />
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(inputRef.current?.value ?? "");
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="ej: ¿cuántas noches ocupadas tuvo Ruqui en marzo?"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          Preguntar
        </button>
      </form>
    </div>
  );
}
