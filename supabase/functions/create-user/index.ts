import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BPM_PROJETO_ID = "d007a2c2-7576-4a60-ba1b-c506a9c4fcac";

Deno.serve(async (req) => {
  // Verify the caller is authenticated and has master role
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

  // Check if caller is a master (only masters can create users)
  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("app_role, ativo, projeto_id")
    .eq("user_id", caller.id)
    .eq("projeto_id", BPM_PROJETO_ID)
    .eq("ativo", true)
    .maybeSingle();

  if (!roleData || roleData.app_role !== "master") {
    return new Response(JSON.stringify({ error: "Forbidden: only masters can create users" }), { status: 403 });
  }

  const { email, password, nome, role, empresa_ids } = await req.json();

  // Input validation
  if (!email || !password || !nome || !role) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  const validRoles = ["master", "gerente", "vendedor"];
  if (!validRoles.includes(role)) {
    return new Response(JSON.stringify({ error: "Invalid role" }), { status: 400 });
  }

  if (role !== "master" && (!Array.isArray(empresa_ids) || empresa_ids.length === 0)) {
    return new Response(JSON.stringify({ error: "empresa_ids is required for gerente/vendedor" }), { status: 400 });
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
    .insert({
      user_id: user.user.id,
      projeto_id: BPM_PROJETO_ID,
      ativo: true,
      nome,
      email,
      app_role: role,
    });

  if (roleError) {
    return new Response(JSON.stringify({ error: roleError.message }), { status: 400 });
  }

  if (Array.isArray(empresa_ids) && empresa_ids.length > 0) {
    const { error: empresasError } = await supabaseAdmin
      .from("user_empresas")
      .insert(empresa_ids.map((empresa_id: string) => ({ user_id: user.user.id, empresa_id })));

    if (empresasError) {
      return new Response(JSON.stringify({ error: empresasError.message }), { status: 400 });
    }
  }

  return new Response(JSON.stringify({ success: true, user_id: user.user.id }), { status: 200 });
});
