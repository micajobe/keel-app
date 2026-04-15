import { supabaseAdmin, getStrategicTiers } from "@/lib/supabase";

export async function GET() {
  try {
    const tiers = await getStrategicTiers();
    return Response.json({ tiers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      tier_type,
      name,
      description,
      year,
      sort_order = 0,
    } = body as {
      tier_type: "vision" | "annual" | "operational";
      name: string;
      description?: string;
      year?: number;
      sort_order?: number;
    };

    if (!tier_type || !name?.trim()) {
      return Response.json({ error: "tier_type and name are required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("strategic_tiers")
      .insert({ tier_type, name: name.trim(), description: description ?? null, year: year ?? null, sort_order })
      .select()
      .single();

    if (error) throw error;
    return Response.json({ tier: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, name, description } = await request.json() as { id: string; name: string; description?: string };
    if (!id || !name?.trim()) {
      return Response.json({ error: "id and name are required" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from("strategic_tiers")
      .update({ name: name.trim(), description: description ?? null })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return Response.json({ tier: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json() as { id: string };
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("strategic_tiers")
      .update({ is_active: false })
      .eq("id", id);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
