import ServiciosPanel from "@/components/ServiciosPanel";

// A diferencia del resto de las paginas, esta no lee la base: los datos son una
// ficha a mano en `src/lib/servicios.ts`. Por eso no lleva `force-dynamic`.

export default function ServiciosPage() {
  return <ServiciosPanel />;
}
