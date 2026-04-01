import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Verify the caller is authenticated and has gestor role
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), { status: 401 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify calling user's identity and role
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !caller) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // Check if caller is a gestor
  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .single();

  if (!roleData || roleData.role !== "gestor") {
    return new Response(JSON.stringify({ error: "Forbidden: only gestores can create users" }), { status: 403 });
  }

  const { email, password, nome, role, loja } = await req.json();

  // Input validation
  if (!email || !password || !nome || !role) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  const validRoles = ["vendedor", "gestor", "avaliador", "secretaria"];
  if (!validRoles.includes(role)) {
    return new Response(JSON.stringify({ error: "Invalid role" }), { status: 400 });
  }

  const { data: user, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    return new Response(JSON.stringify({ error: createError.message }), { status: 400 });
  }

  const { error: roleError } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: user.user.id, nome, role, loja });

  if (roleError) {
    return new Response(JSON.stringify({ error: roleError.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ success: true, user_id: user.user.id }), { status: 200 });
});
