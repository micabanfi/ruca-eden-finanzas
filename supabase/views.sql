-- Ruca Eden finance DB — Postgres views (port of ../../sql/views.sql)

-- Monthly P&L. Convención de Mimi (2026-06-06): un cobro vinculado a reserva
-- se imputa al mes del CHECKIN, no al mes en que entró la plata. Sin vínculo,
-- se usa la fecha del cobro. Egresos siempre por fecha de pago.
CREATE OR REPLACE VIEW v_monthly_summary AS
WITH tx AS (
    SELECT CASE WHEN t.kind = 'ingreso' AND r.checkin IS NOT NULL
                THEN to_char(r.checkin, 'YYYY-MM')
                ELSE to_char(t.date, 'YYYY-MM') END AS mes,
           t.kind, t.amount_usd
    FROM transactions t
    LEFT JOIN reservations r ON r.id = t.reservation_id
)
SELECT mes,
       ROUND(SUM(CASE WHEN kind='ingreso' THEN amount_usd END), 2)       AS ingresos_usd,
       ROUND(SUM(CASE WHEN kind='egreso'  THEN amount_usd END), 2)       AS egresos_usd,
       ROUND(COALESCE(SUM(CASE WHEN kind='ingreso' THEN amount_usd END),0)
           - COALESCE(SUM(CASE WHEN kind='egreso'  THEN amount_usd END),0), 2) AS balance_usd
FROM tx
GROUP BY 1 ORDER BY 1;

-- Pagos Fijos equivalent: month x category (payment-date attribution)
CREATE OR REPLACE VIEW v_pagos_fijos AS
SELECT to_char(date, 'YYYY-MM')       AS mes,
       category,
       ROUND(SUM(amount_ars), 2)      AS ars,
       ROUND(SUM(amount_usd), 2)      AS usd,
       COUNT(*)                       AS n_tx
FROM transactions
WHERE kind='egreso'
GROUP BY 1, 2 ORDER BY 1, 2;

-- Pagos Fijos with the SHEET's convention: shifted categories ("mes vencido")
-- are attributed to the month BEFORE the payment date. Excepciones (Mimi
-- 2026-06-06): los impuestos ANUALES van al mes en que se pagaron, sin shift;
-- y la matriz de la planilla arranca en ene 2023 — todo gasto que no venga
-- del tab "2022 Gastos totales" cae como muy temprano en ene 2023 (ej. la
-- fibra de nov 2022 anotada en el tab 23-24).
CREATE OR REPLACE VIEW v_pagos_fijos_sheet AS
SELECT COALESCE(ao.mes,
           to_char(GREATEST(
               (t.date - (CASE WHEN t.description ~* 'anual'
                               THEN 0
                               ELSE COALESCE(cm.month_shift,0) END
                          || ' months')::interval)::date,
               CASE WHEN t.source_sheet = '2022 Gastos totales'
                    THEN DATE '0001-01-01' ELSE DATE '2023-01-01' END),
                   'YYYY-MM'))        AS mes,
       t.category,
       ROUND(SUM(t.amount_ars), 2)    AS ars,
       ROUND(SUM(t.amount_usd), 2)    AS usd,
       COUNT(*)                       AS n_tx
FROM transactions t
LEFT JOIN category_map cm ON cm.canonical = t.category
LEFT JOIN attribution_overrides ao
       ON ao.source_sheet = t.source_sheet AND ao.source_row = t.source_row
WHERE t.kind='egreso'
GROUP BY 1, 2 ORDER BY 1, 2;

-- Occupancy: nights sold + revenue per cabin per month
CREATE OR REPLACE VIEW v_occupancy AS
SELECT to_char(night, 'YYYY-MM')      AS mes,
       cabin,
       COUNT(*)                       AS noches,
       ROUND(SUM(rate_usd), 2)        AS revenue_usd,
       ROUND(AVG(rate_usd), 2)        AS tarifa_promedio
FROM reservation_nights
GROUP BY 1, 2 ORDER BY 1, 2;

-- Revenue by platform per year
CREATE OR REPLACE VIEW v_revenue_by_platform AS
SELECT to_char(checkin, 'YYYY')       AS anio,
       platform,
       COUNT(*)                       AS reservas,
       SUM(nights)                    AS noches,
       ROUND(SUM(total_usd), 2)       AS revenue_usd,
       ROUND(SUM(total_usd)/NULLIF(SUM(nights),0), 2) AS tarifa_promedio
FROM reservations
WHERE cabin <> 'TODAS' AND cancelled_at IS NULL
GROUP BY 1, 2 ORDER BY 1, revenue_usd DESC;

-- Booking alerts (owner-specified): real overlaps AND same-day turnovers.
-- Ruca and Ruca Chico are the same physical house.
CREATE OR REPLACE VIEW v_booking_alerts AS
WITH res AS (
    SELECT id, checkin, checkout, guest_name, cabin,
           CASE WHEN cabin IN ('Ruca','Ruca Chico') THEN 'Ruca' ELSE cabin END AS phys
    FROM reservations
    WHERE cabin IS NOT NULL AND cabin <> 'TODAS' AND cancelled_at IS NULL
)
SELECT CASE WHEN a.checkout > b.checkin THEN 'OVERLAP'
            ELSE 'same-day turnover' END           AS alerta,
       a.phys                                      AS cabana,
       a.guest_name AS guest_out, a.checkin AS in_1, a.checkout AS out_1,
       b.guest_name AS guest_in,  b.checkin AS in_2, b.checkout AS out_2,
       a.id AS res_id_1, b.id AS res_id_2
FROM res a
JOIN res b ON a.phys = b.phys AND a.id <> b.id
          AND a.checkin <= b.checkin AND (a.id < b.id OR a.checkin < b.checkin)
          AND a.checkout >= b.checkin
ORDER BY a.checkin;

-- Future committed revenue
CREATE OR REPLACE VIEW v_future_reservations AS
SELECT checkin, checkout, guest_name, cabin, platform, nights,
       total_usd, deposit_usd, balance_usd, collected
FROM reservations
WHERE checkin >= current_date AND cancelled_at IS NULL
ORDER BY checkin;
