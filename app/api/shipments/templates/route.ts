import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  incoterms: string | null;
  transport_mode: string | null;
};

type SlotRow = {
  slot_key: string;
  display_name: string;
  is_required: number;
  assigned_role: string;
  sort_order: number;
};

export async function GET() {
  try {
    const db = getDb();
    const templates = db.prepare(
      "SELECT id, name, description, incoterms, transport_mode FROM shipment_templates ORDER BY id"
    ).all() as TemplateRow[];

    const result = templates.map((t) => {
      const slots = db.prepare(
        `SELECT slot_key, display_name, is_required, assigned_role, sort_order
         FROM template_slots WHERE template_id = ? ORDER BY sort_order`
      ).all(t.id) as SlotRow[];

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        incoterms: t.incoterms,
        transportMode: t.transport_mode,
        slots: slots.map((s) => ({
          slotKey: s.slot_key,
          displayName: s.display_name,
          isRequired: s.is_required === 1,
          assignedRole: s.assigned_role,
          sortOrder: s.sort_order,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
