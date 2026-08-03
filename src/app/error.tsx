"use client"; // los error boundaries tienen que ser componentes cliente

// Red de contención de toda la app. Sin este archivo, CUALQUIER error de render
// (servidor o cliente) reemplaza la pantalla entera por el cartel gris de Next
// ("This page couldn't load"), sin nav, sin decir qué pasó y sin forma de volver.
// Con esto el header y las pestañas siguen ahí y se puede reintentar.

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // `digest` solo viene cuando el error fue del servidor (Next no manda el mensaje
  // al browser por seguridad). Sin digest, el error es del cliente y el mensaje sí
  // sirve para diagnosticar.
  const esDelServidor = Boolean(error.digest);

  return (
    <div className="rounded border border-red-300 bg-red-50 p-4">
      <h2 className="text-sm font-semibold text-red-800">Se rompió esta pantalla</h2>
      <p className="mt-1 text-xs text-red-700">
        {esDelServidor
          ? "Error del servidor (puede ser la base de datos tardando). Probá reintentar."
          : error.message || "Error en el navegador."}
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-[11px] text-red-600">digest: {error.digest}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded bg-red-700 px-3 py-1 text-sm font-medium text-white hover:bg-red-800"
        >
          Reintentar
        </button>
        <a
          href="/pagos-fijos"
          className="rounded bg-neutral-200 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-300"
        >
          Ir a Pagos Fijos
        </a>
      </div>
    </div>
  );
}
