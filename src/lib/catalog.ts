// Shared option lists (mirror the sheet's vocab)
// "Coihue" es la grafía correcta (canónica para reservas nuevas). Datos viejos
// pueden tener "Cohiue"; se siguen aceptando (ver normalizeCabin / phys en ical.ts).
export const CABINS = ["Alerce", "Coihue", "Maiten", "Ruca", "Ruca Chico", "Ruqui", "TODAS"];
export const PLATFORMS = ["AirBnb", "WA", "Booking", "Instagram", "Meli", "Parairnos", "Terceros"];
// Quién puede tener la plata de un cobro (Paypal = sin retirar de la cuenta)
export const HOLDERS = ["Mica", "Gustavo", "Carlos", "Nati", "Male", "Aline", "Paypal"];
// Consolidated payment methods (top canonical values in the data)
export const PAYMENT_METHODS = [
  "Carlos",
  "Carlos Amex",
  "Micaela MP",
  "Micaela Galicia",
  "Alquileres",
  "Paypal",
  "Airbnb",
  "Cash",
  "Santander",
];

// Dónde entra/sale la seña de una reserva. "Santander" alimenta la cuenta
// bi-moneda en Ingresos/Egresos; el resto es solo informativo.
export const DEPOSIT_ACCOUNTS = ["Cash", "Santander"];

// Monedas en que se puede cobrar/entregar. value = lo que se guarda en la base;
// label = lo que ve Mimi. La mayoría de los inquilinos paga en pesos.
export const CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "ARS", label: "Pesos" },
] as const;
export type Currency = (typeof CURRENCIES)[number]["value"];

// Color de chip por plataforma (compartido por ReservationsTable y el calendario)
export const PLATFORM_COLORS: Record<string, string> = {
  AirBnb: "bg-rose-100 text-rose-800",
  WA: "bg-green-100 text-green-800",
  Booking: "bg-blue-100 text-blue-800",
  Instagram: "bg-purple-100 text-purple-800",
  Meli: "bg-yellow-100 text-yellow-800",
  Parairnos: "bg-cyan-100 text-cyan-800",
  Terceros: "bg-neutral-200 text-neutral-700",
};
