export default function TabLoading() {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-neutral-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-green-700" />
      Cargando…
    </div>
  );
}
