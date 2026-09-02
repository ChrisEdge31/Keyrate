// Deletes the calling user's own account. Runs server-side because this
// needs the service role key (elevated privileges) to call the Auth admin
// API — that key must never reach the browser, so the anon-key client the
// app otherwise uses can't do this itself.
//
// Deploy with: supabase functions deploy delete-account
// Requires the SUPABASE_SERVICE_ROLE_KEY secret to be set:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your service role key>
// (SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify who's actually calling, using their own JWT — never trust a
  // user id passed in the request body.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only the admin client (service role) can delete an auth user.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
