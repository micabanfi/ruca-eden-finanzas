"use client";

/** Overlay de pantalla completa con spinner. Mientras `show` está activo tapa
 *  todo y bloquea cualquier interacción (los clicks caen en el overlay). */
export default function BlockingSpinner({
  show,
  label = "Guardando…",
}: {
  show: boolean;
  label?: string;
}) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex cursor-wait items-center justify-center bg-black/20 backdrop-blur-[1px]"
      aria-busy="true"
      role="alert"
    >
      <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-xl">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
        <span className="text-sm font-medium text-neutral-700">{label}</span>
      </div>
    </div>
  );
}
