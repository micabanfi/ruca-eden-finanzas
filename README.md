# Ruca Edén — App de Finanzas

App web para administrar la plata de **Ruca Edén**, el complejo de 5 cabañas en
Lago Gutiérrez, Bariloche (Alerce, Cohiue, Maitén, Ruca / Ruca Chico —misma casa—
y Ruqui). Reemplaza la vieja planilla de Google: las reservas y los gastos se
cargan acá y se guardan al toque en la base de datos (Supabase).

🔗 **En vivo:** https://ruca-eden-finanzas.vercel.app
🔑 **Para entrar pide usuario y contraseña** (el navegador muestra un cartelito).
Las de hoy son **`ruca`** / **`eden2026`** — se pueden cambiar (ver más abajo).

---

## ¿Qué se puede hacer?

La app tiene 6 pestañas arriba:

| Pestaña | Para qué sirve |
|---|---|
| 📊 **Dashboard** | Gráficos y números del año: ingresos, egresos, ocupación. |
| **Pagos Fijos** | La matriz de gastos fijos por mes (luz, gas, internet, etc.). |
| **Alquileres Detalle** | Todas las reservas. Se agregan, se editan (doble click en la celda), se **cancelan** y se **restauran**. |
| **Ingresos/Egresos** | El detalle de toda la plata que entra y sale, año por año. |
| **Resumen** | Totales anuales, al estilo de la planilla vieja. |
| ✨ **Asistente** | Un chat (Claude) que responde preguntas sobre los números. *(Opcional, ver variables.)* |

### Cobrar una reserva
En **Ingresos/Egresos**, las reservas con check-in pasado y sin cobrar aparecen en
gris arriba de la lista. Cada una tiene:
- **Cobrar ✓** → carga la seña y el resto (y quién quedó con la plata). Crea el ingreso.
- **¿es "…" $X?** → si ya había un ingreso parecido cargado, lo vincula sin duplicar.
- **ya estaba** → la marca cobrada **sin** crear ingreso (cuando esa plata ya la
  cargaste por otro lado y no querés contarla dos veces).
- **🎁** → marcarla como invitación: nunca se cobra.

### Cancelar una reserva (con o sin cobro)
En **Alquileres Detalle**, el botón **✕** abre un cartel. La reserva **nunca se borra**:
pasa a la sección "Canceladas" y se puede restaurar. Si el huésped canceló tarde y
**se le cobró igual** (seña o penalidad), tildás la opción y cargás cuánto: eso crea
un ingreso que aparece **resaltado en rojo** ("🚫 canceló · se cobró") en
Ingresos/Egresos.

---

## ⚠️ Regla de oro: acá no se borra nada

Los datos **no se borran nunca** — se "cancelan" (quedan guardados y ocultos, y se
pueden recuperar). Es para no perder el historial. Si alguna función nueva parece
"borrar", en realidad esconde y deja recuperar.

---

## Cómo se publica (deploy)

Está en **Vercel** (gratis) conectado al repo de GitHub
`micabanfi/ruca-eden-finanzas`. **Cada vez que se sube un cambio a la rama `main`,
Vercel republica la app sola** en uno o dos minutos. No hay que hacer nada más.

### Cambiar la contraseña
En Vercel → proyecto **ruca-eden-finanzas** → **Settings → Environment Variables**:
editás `BASIC_AUTH_USER` y/o `BASIC_AUTH_PASSWORD`, guardás, y en **Deployments**
le das **Redeploy** al último. Listo.

---

## Para correrla en la compu (desarrollo)

```bash
npm install         # la primera vez
npm run dev         # arranca en http://localhost:3000
```

Necesita un archivo **`.env.local`** (no se sube a GitHub, tiene las claves) con:

| Variable | Qué es | ¿Obligatoria? |
|---|---|---|
| `DATABASE_URL` | Conexión a la base Supabase. **Usar el puerto `6543`** (Transaction Pooler). | Sí |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. | Sí |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública de Supabase. | Sí |
| `BASIC_AUTH_USER` | Usuario para entrar a la app. | Sí (en producción) |
| `BASIC_AUTH_PASSWORD` | Contraseña para entrar. | Sí (en producción) |
| `ANTHROPIC_API_KEY` | Clave de Claude para la pestaña ✨ Asistente (`sk-ant-…`). | No — sin ella, todo anda menos el Asistente. |

> En la compu, si no ponés `BASIC_AUTH_*`, la app queda **sin contraseña** (cómodo
> para desarrollar). En Vercel **siempre** deben estar las dos definidas.

---

## Por dentro (stack)

- **Next.js 16** (App Router, Turbopack) + **React** + **Tailwind**.
- Base **PostgreSQL en Supabase**, consultada directo con **postgres.js** (sin ORM).
- La contraseña es un **Basic Auth** en `src/proxy.ts` (protege páginas y acciones).
- Más detalle técnico y reglas del proyecto: ver **`CLAUDE.md`**.
