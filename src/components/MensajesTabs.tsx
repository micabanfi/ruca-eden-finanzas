"use client";

import { useState } from "react";
import DatosAlquileresPanel from "@/components/DatosAlquileresPanel";
import DisponibilidadPanel from "@/components/DisponibilidadPanel";
import MensajesPanel from "@/components/MensajesPanel";
import ServiciosPanel from "@/components/ServiciosPanel";
import type { Reservation } from "@/db/reservations";

type Tab = "mensaje" | "datos" | "disponibilidad" | "servicios";

export default function MensajesTabs({
  reservations,
  invitadaIds,
}: {
  reservations: Reservation[];
  invitadaIds: string[];
}) {
  const [tab, setTab] = useState<Tab>("mensaje");

  const btn = (t: Tab) =>
    `rounded px-3 py-1.5 text-sm font-medium ${
      tab === t ? "bg-green-700 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <button type="button" className={btn("mensaje")} onClick={() => setTab("mensaje")}>
          Mensaje de reserva
        </button>
        <button type="button" className={btn("datos")} onClick={() => setTab("datos")}>
          Datos de alquileres
        </button>
        <button
          type="button"
          className={btn("disponibilidad")}
          onClick={() => setTab("disponibilidad")}
        >
          Disponibilidad
        </button>
        <button type="button" className={btn("servicios")} onClick={() => setTab("servicios")}>
          Servicios
        </button>
      </div>

      {tab === "mensaje" ? (
        <MensajesPanel />
      ) : tab === "datos" ? (
        <DatosAlquileresPanel reservations={reservations} invitadaIds={invitadaIds} />
      ) : tab === "disponibilidad" ? (
        <DisponibilidadPanel reservations={reservations} />
      ) : (
        <ServiciosPanel />
      )}
    </div>
  );
}
