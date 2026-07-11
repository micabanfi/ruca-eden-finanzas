"use server";

import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

// Esquema + reglas del negocio: bloque estable, se cachea (prefix caching).
const SYSTEM_SCHEMA = `Sos el asistente de finanzas de Ruca Edén, un complejo de 5 cabañas
(Alerce, Coihue —datos viejos pueden decir "Cohiue"—, Maiten, Ruca/Ruca Chico — misma casa física — y Ruqui) en Lago Gutiérrez,
Bariloche. La dueña es Mimi (Micaela, "Mica"). Respondés SIEMPRE en español rioplatense,
corto y al grano, con montos formateados (USD$1.234,56).

Tenés una herramienta para consultar la base Postgres (solo SELECT). Esquema:

TABLAS
- reservations(id, checkin, checkout, guest_name, phone, cabin, platform, nights,
  price_per_night, total_usd, deposit_usd, balance_usd, payment_method, collected,
  who_has_money, notes): las reservas. collected=1 -> cobrada.
- reservation_nights(reservation_id, night, cabin, rate_usd): una fila por noche ocupada.
- transactions(id, kind 'ingreso'|'egreso', date, description, amount_ars, amount_usd,
  blue_rate, category, payment_method, holder, notes, reservation_id, source_sheet):
  ingresos y gastos. holder = quién tiene físicamente la plata (Mica/Gustavo/...).
  reservation_id vincula un cobro con su reserva.
- entregas(date, holder, amount_usd, notes): cuando alguien le entrega plata a Mimi.
- res_invitaciones(reservation_id): reservas de invitados, NUNCA se cobran ni cuentan.
- category_map(canonical, month_shift): categorías de gasto y su "mes vencido".

VISTAS (usalas para números oficiales, replican la planilla histórica)
- v_monthly_summary(mes 'YYYY-MM', ingresos_usd, egresos_usd, balance_usd):
  ingresos imputados al MES DEL CHECKIN si están vinculados a reserva.
- v_pagos_fijos_sheet(mes, category, ars, usd, n_tx): gastos por mes y categoría con la
  convención de mes vencido. Excluir category='Ajuste' de los totales (ej: Pago Ruben).
- v_occupancy(mes, cabin, noches, revenue_usd, tarifa_promedio): ocupación.
- v_booking_alerts: solapamientos de reservas.

REGLAS
- "Cuánto tiene X" = SUM(ingresos con holder=X) − SUM(entregas de X). Sin holder, se
  infiere del método de pago: 'gus%' → Gustavo; '%paypal%' o '%airbnb%' → Paypal
  (los payouts de Airbnb caen en la cuenta PayPal).
- Reservas pendientes de cobro: checkin <= hoy, collected IS DISTINCT FROM 1, sin ingreso
  vinculado y no invitada.
- Egresos anuales oficiales: v_pagos_fijos_sheet sin 'Ajuste'. Ingresos: v_monthly_summary.
- Si te preguntan por "este mes", usá la fecha actual que viene abajo.
- Mostrá los números que encontraste; si una consulta vuelve vacía decilo claro.
- NUNCA inventes datos: si no está en la base, decí que no está.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "consultar_sql",
    description:
      "Ejecuta una consulta SQL de SOLO LECTURA (SELECT/WITH) contra la base Postgres de finanzas. Devuelve hasta 200 filas en JSON. Usala cada vez que necesites datos reales; no respondas de memoria.",
    input_schema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "Una sola consulta SELECT o WITH, sin punto y coma final.",
        },
      },
      required: ["sql"],
    },
  },
];

async function runQuery(q: string): Promise<{ ok: boolean; out: string }> {
  const clean = q.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(clean))
    return { ok: false, out: "Solo se permiten consultas SELECT/WITH." };
  if (clean.includes(";"))
    return { ok: false, out: "Una sola consulta por llamada." };
  try {
    const rows = await sql.begin("read only", async (tx) => {
      await tx`SET LOCAL statement_timeout = '8s'`;
      return tx.unsafe(clean);
    });
    const limited = (rows as unknown as Record<string, unknown>[]).slice(0, 200);
    return {
      ok: true,
      out: JSON.stringify(limited) + (rows.length > 200 ? ` …(${rows.length} filas, mostradas 200)` : ""),
    };
  } catch (e) {
    return { ok: false, out: `Error SQL: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AsistenteResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export async function preguntarAsistente(
  history: ChatTurn[],
  question: string,
): Promise<AsistenteResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error:
        "Falta la clave de Claude: agregá ANTHROPIC_API_KEY=sk-ant-… en app-ruca/.env.local y reiniciá la app.",
    };
  }
  const client = new Anthropic();

  const messages: Anthropic.MessageParam[] = [
    // turnos anteriores como texto plano (las consultas SQL viejas no hacen falta)
    ...history.slice(-12).map((t): Anthropic.MessageParam => ({ role: t.role, content: t.text })),
    { role: "user", content: question },
  ];

  try {
    for (let round = 0; round < 8; round++) {
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: [
          { type: "text", text: SYSTEM_SCHEMA, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Fecha actual: ${new Date().toISOString().slice(0, 10)}` },
        ],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const { ok, out } = await runQuery((block.input as { sql: string }).sql);
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: out,
              is_error: !ok,
            });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { ok: true, text: text || "(sin respuesta)" };
    }
    return { ok: false, error: "Demasiadas consultas seguidas — probá una pregunta más simple." };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      return { ok: false, error: "La clave ANTHROPIC_API_KEY no es válida." };
    if (e instanceof Anthropic.RateLimitError)
      return { ok: false, error: "Muchas consultas seguidas — esperá un minuto y reintentá." };
    if (e instanceof Anthropic.APIError)
      return { ok: false, error: `Error de Claude (${e.status}): ${e.message}` };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
