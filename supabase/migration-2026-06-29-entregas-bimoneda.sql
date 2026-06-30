-- Migración: ingresos en pesos o USD + entregas con moneda y atadas al cobro.
-- Correr en el SQL editor de Supabase (proyecto kbxcrijyftndbnqftxhw), schema public.
-- Son sentencias aditivas y seguras (solo ALTER de tablas de Ruca, por nombre).
-- NO toca el schema z_fp. Se puede correr este archivo entero de una.

-- Moneda nativa del ingreso: 'USD' (default, como hasta hoy) o 'ARS' (pesos).
-- En pesos se guarda amount_ars + blue_rate y amount_usd = amount_ars / blue_rate
-- (igual que los egresos). Los egresos no usan esta columna (siempre pesos).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Entregas: moneda + monto en pesos + atadura al cobro puntual + soft-delete.
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS currency       TEXT DEFAULT 'USD';
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS amount_ars     NUMERIC;            -- monto si currency='ARS'
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS transaction_id BIGINT REFERENCES transactions(id);
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ;        -- soft-delete (nunca DELETE)

-- amount_usd era NOT NULL; una entrega en pesos puede no tener USD-equiv → permitir NULL.
ALTER TABLE entregas ALTER COLUMN amount_usd DROP NOT NULL;
