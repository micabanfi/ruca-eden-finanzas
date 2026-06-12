import { sql } from "@/lib/db";

export interface CalendarSource {
  id: string;
  kind: "google" | "airbnb";
  label: string | null;
  cabin: string | null;
  ics_url: string;
  active: boolean;
  created_at: string;
}

export async function getCalendarSources(): Promise<CalendarSource[]> {
  return sql<CalendarSource[]>`
    SELECT id, kind, label, cabin, ics_url, active,
           to_char(created_at,'YYYY-MM-DD') AS created_at
    FROM calendar_sources
    ORDER BY active DESC, kind, cabin NULLS FIRST, id`;
}
