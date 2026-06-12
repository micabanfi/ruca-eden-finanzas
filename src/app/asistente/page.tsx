import AsistenteChat from "@/components/AsistenteChat";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // el Asistente llama a Claude, dale más aire

export default function AsistentePage() {
  return <AsistenteChat />;
}
