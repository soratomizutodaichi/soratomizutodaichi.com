// ============================================================
// Edge Function: send-contact-reply
//   目的 : 管理画面から、お問い合わせ主へメールで返信を送る
//   呼出 : admin/contacts.html（ログイン管理者のトークン付きで POST）
//   送信 : Resend API
//   記録 : contact_replies へ保存し、contacts.status を 'done' に更新
//
//   セキュリティ：
//     - 呼び出し元のトークンを検証し、匿名(anon)や未ログインは拒否
//     - 送信先は「その問い合わせに保存済みの宛先」だけ
//       （クライアントから任意の宛先を指定できない＝踏み台化を防止）
//
//   自動注入される環境変数（設定不要）：
//     SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//   手動で設定するシークレット：
//     RESEND_API_KEY      … Resend の API キー
//     CONTACT_NOTIFY_FROM … 送信元（認証済みドメインのアドレス）
//     CONTACT_NOTIFY_TO   … 返信の Reply-To（あなたの受信箱）
//     ALLOWED_ORIGIN      … 許可する呼び出し元（既定: https://soratomizutodaichi.com）
//     ADMIN_EMAILS        … （任意）送信を許可する管理者メール（カンマ区切り）
// ============================================================

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://soratomizutodaichi.com";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const NOTIFY_FROM = Deno.env.get("CONTACT_NOTIFY_FROM");
  const NOTIFY_TO = Deno.env.get("CONTACT_NOTIFY_TO");

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !RESEND_API_KEY || !NOTIFY_FROM) {
    return json({ error: "server not configured" }, 500);
  }

  // --- 1) 認証：呼び出し元トークンを検証（匿名・未ログインは拒否） ---
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return json({ error: "unauthorized" }, 401);
  const user = await userRes.json().catch(() => null);
  if (!user?.id || user?.role === "anon" || !user?.email) {
    return json({ error: "unauthorized" }, 401);
  }

  // 任意：管理者メール許可リスト（設定されていれば照合）
  const allow = (Deno.env.get("ADMIN_EMAILS") || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(String(user.email).toLowerCase())) {
    return json({ error: "forbidden" }, 403);
  }

  // --- 2) 入力検証 ---
  const payload = await req.json().catch(() => ({}));
  const contactId = payload?.contact_id;
  const body = typeof payload?.body === "string" ? payload.body : "";
  if (!contactId || !Number.isFinite(Number(contactId))) {
    return json({ error: "invalid contact_id" }, 400);
  }
  if (body.trim().length === 0 || body.length > 5000) {
    return json({ error: "invalid body" }, 400);
  }

  // --- 3) 宛先はDBから取得（service role。クライアント指定は使わない） ---
  const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const cRes = await fetch(
    `${SUPABASE_URL}/rest/v1/contacts?id=eq.${encodeURIComponent(String(contactId))}&select=id,name,email`,
    { headers: svc },
  );
  if (!cRes.ok) {
    const detail = await cRes.text().catch(() => "");
    return json({ error: `lookup failed (${cRes.status}): ${detail.slice(0, 300)}` }, 502);
  }
  const rows = await cRes.json().catch(() => []);
  const contact = Array.isArray(rows) ? rows[0] : null;
  if (!contact?.email) return json({ error: "contact not found" }, 404);

  // --- 4) Resend で送信 ---
  const esc = (v: unknown): string =>
    String(v ?? "").replace(/[<>&"]/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string)
    );
  const bodyHtml = esc(body).replace(/\r?\n/g, "<br>");

  const html = `
    <div style="font-family:sans-serif;line-height:1.8;color:#222;">
      <p>${esc(contact.name)} 様</p>
      <p>お問い合わせいただきありがとうございます。以下のとおりご返信いたします。</p>
      <hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">
      <p>${bodyHtml}</p>
      <hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">
      <p style="color:#666;font-size:13px;">
        空と水と大地合同会社<br>
        本メールへの返信でそのままお問い合わせを続けていただけます。
      </p>
    </div>
  `;

  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: [contact.email],
      reply_to: NOTIFY_TO || undefined,
      subject: "【空と水と大地合同会社】お問い合わせへのご返信",
      html,
    }),
  });
  if (!sendRes.ok) {
    const detail = await sendRes.text().catch(() => "");
    return json({ error: "send failed", detail }, 502);
  }

  // --- 5) 記録 + ステータス更新（service role） ---
  await fetch(`${SUPABASE_URL}/rest/v1/contact_replies`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ contact_id: Number(contactId), body, sent_by: user.email }),
  }).catch(() => {});

  await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${encodeURIComponent(String(contactId))}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "done" }),
  }).catch(() => {});

  return json({ ok: true, sent_to: contact.email }, 200);
});
