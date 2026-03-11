// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

Deno.serve(async (req) => {
  const authHeader = req.headers.get("x-trigger-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");

  if (req.method === "POST" && expectedSecret && authHeader !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[rotate-leads] Starting at ${new Date().toISOString()}`);

  try {
    const { data, error } = await supabase.rpc("rotate_not_answered_leads");

    if (error) {
      console.error("[rotate-leads] Error:", error.message);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const results = data || [];
    const rotated = results.filter((r) => r.action === "rotated").length;
    const closed  = results.filter((r) => r.action === "closed_no_agents").length;

    console.log(`[rotate-leads] Rotated: ${rotated}, Closed: ${closed}`);

    await supabase.rpc("refresh_leaderboard");

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        rotated,
        closed,
        total: results.length,
        details: results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[rotate-leads] Unexpected:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});