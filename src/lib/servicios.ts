/** Servicios e impuestos de Ruca Edén — datos para pagar.
 *
 *  Es una ficha de consulta (números de cuenta, titulares, links, con qué usuario
 *  se entra), no datos transaccionales: NO vive en la base, vive acá. Se edita a
 *  mano en este archivo y se ve en Mensajes → Servicios.
 *
 *  Convención: `null` / campo ausente = dato que falta, se renderiza como "—".
 *  No inventar: si Mimi no lo dijo, va vacío y aparece en la lista de faltantes.
 */

export interface CuentaServicio {
  /** Nº de cuenta / partida / suministro, tal cual hay que tipearlo en la web. */
  numero: string;
  /** A qué corresponde: "Ruqui", "Casero", "Partida L1"… */
  etiqueta?: string;
  /** A nombre de quién está la cuenta / a quién se factura. */
  titular?: string;
  /** Datos extra propios de ESTA cuenta (nº de asociado, mail de ingreso…). */
  datos?: string[];
}

export interface Servicio {
  nombre: string;
  /** Empresa / organismo, cuando el nombre del servicio no lo dice. */
  proveedor?: string;
  /** Quién paga y con qué. */
  quienPaga?: string;
  /** Débito automático: true = SÍ, false = NO, null = no sabemos. */
  debitoAutomatico: boolean | null;
  /** Con qué usuario/mail se entra a la web. */
  ingreso?: string;
  pagina?: string;
  cuentas: CuentaServicio[];
  /** Notas que valen para todo el servicio. */
  notas?: string[];
  /** Cosas a chequear/hacer. Se resaltan en ámbar arriba de la tabla. */
  pendientes?: string[];
}

export const SERVICIOS: Servicio[] = [
  {
    nombre: "Luz",
    proveedor: "CEB (Cooperativa de Electricidad Bariloche)",
    quienPaga: "Mica todos los meses, con la TC de Carlos",
    debitoAutomatico: false,
    ingreso: "banfimicaela L",
    pagina: "https://oficinavirtual.ceb.coop/ov/cuentas.xhtml",
    cuentas: [
      {
        numero: "9186",
        titular: "BAHI HOLDING SA",
        datos: ["Nº Asoc./Cliente: 5905"],
      },
      {
        numero: "109242",
        datos: ["Nº Asoc./Cliente: 212877"],
      },
    ],
  },

  {
    nombre: "Agua",
    proveedor: "ARSA (Aguas Rionegrinas)",
    quienPaga: "Mica todos los meses",
    debitoAutomatico: false,
    ingreso: "gmail de banfimicaela",
    pagina:
      "https://oficinavirtual.live/apps/launcher/index.html?20240201165504&entorno=arsa#/",
    cuentas: [
      {
        numero: "4707204200000",
        etiqueta: "Ruben",
        titular: "Cuentas asociadas al DNI de Ruben",
      },
      {
        numero: "4707204300000",
        etiqueta: "Bahi",
        titular: "Se factura a BAHIA HOLDIN S.A.",
      },
    ],
    notas: [
      "Para poner débito automático hay que firmar la planilla como titular de la tarjeta.",
      "Para el cambio de titularidad hay que presentar original y fotocopia de la escritura y del DNI del titular.",
    ],
  },

  {
    nombre: "Gas",
    proveedor: "Camuzzi",
    quienPaga: "Mica todos los meses",
    debitoAutomatico: false,
    ingreso: "banfimicaela L",
    pagina: "https://oficinavirtual.camuzzigas.com.ar/home/mis-facturas",
    cuentas: [
      {
        numero: "8400/0-23-02-0073557/3",
        titular: "BANFI RUBEN GUSTAVO",
        datos: ["Llega la factura a banfimicaela"],
      },
      {
        numero: "8400/0-24-04-0076320/8",
        etiqueta: "Ruqui",
        titular: "BANFI CARLOS",
        datos: ["Se entra con micabanfi@hot…"],
      },
      {
        numero: "8400/0-24-06-0076804/4",
        etiqueta: "Casero",
        titular: "BANFI CARLOS",
      },
    ],
    notas: [
      "Ruqui y Casero están asociadas con Ruca: desde Ruca se ven ambos suministros.",
    ],
  },

  {
    nombre: "Internet",
    proveedor: "GC Group (la empresa es Grupo SAS)",
    quienPaga: "Mica todos los meses",
    debitoAutomatico: false,
    pagina: "https://www.gc-group.com.ar/facturas.php?x=jjjjj-x:ra",
    cuentas: [
      {
        numero: "chalet ruqui eden",
        titular: "Micaela Banfi",
        datos: ["Llega la factura a banfimicaela"],
      },
    ],
    notas: ["Estuvo andando flama, nadie se quejó."],
  },

  {
    nombre: "Impuestos Río Negro",
    proveedor: "Provincia de Río Negro",
    debitoAutomatico: false,
    ingreso: "Con el Nº de partida",
    pagina: "https://rionegro.gov.ar/?contID=55189",
    cuentas: [
      { numero: "209189", etiqueta: "Partida L1" },
      { numero: "170916", etiqueta: "Partida L2" },
    ],
    notas: [
      "Estuvimos pagando medio que mes a mes.",
      "Ya están pagos ambos lotes — ANUAL 2025.",
    ],
  },

  {
    nombre: "Impuestos municipales",
    proveedor: "Municipalidad de Bariloche",
    debitoAutomatico: false,
    ingreso: "Con el Nº de cuenta",
    pagina: "https://www.municipalidad.com/scdb/deuda/listadodeuda",
    cuentas: [
      { numero: "015166", etiqueta: "L1 Bahi", titular: "BAHI HOLDING S.A." },
      { numero: "033322", etiqueta: "L2 (Ruben)", titular: "BANFI RUBEN GUSTAVO" },
    ],
    notas: [
      "Estuvimos pagando medio que mes a mes.",
      "Ya están pagos ambos lotes — ANUAL 2025.",
    ],
  },

  {
    nombre: "Teléfono",
    proveedor: "Movistar",
    quienPaga: "TC terminada en 8002 (¿la Amex de Ruben?)",
    debitoAutomatico: true,
    pagina: "https://www.movistar.com.ar/mi-factura/hogar",
    cuentas: [
      { numero: "2944467305", etiqueta: "Línea", titular: "BANFI RUBEN GUSTAVO" },
      { numero: "7275357", etiqueta: "DNI de Ruben (para ingresar)" },
    ],
    notas: [
      "El 29/02 Mica dio de baja el internet. Nº de trámite de baja: 375990996.",
    ],
    pendientes: [
      "Chequear el próximo mes que cobren SOLO la línea fija (el internet se dio de baja el 29/02).",
    ],
  },
];
