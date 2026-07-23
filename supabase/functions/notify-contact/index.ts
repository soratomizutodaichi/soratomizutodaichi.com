// ============================================================
// Edge Function: notify-contact
//   目的 : contacts テーブルに新規INSERTが入ったら、管理者へメール通知
//   呼出 : Supabase Database Webhook（contacts の INSERT）から HTTP POST
//   送信 : Resend API（https://resend.com）
//
//   必要なシークレット（Edge Function の Secrets に設定。コードには書かない）：
//     RESEND_API_KEY      … Resend の API キー
//     CONTACT_NOTIFY_TO   … 通知先（管理者の受信メールアドレス）
//     CONTACT_NOTIFY_FROM … 送信元（例: no-reply@soratomizutodaichi.com。要ドメイン認証）
//     WEBHOOK_SECRET      … なりすまし防止の合言葉（Webhook 側のヘッダーと一致させる）
//
//   ※このファイルにキーやメールアドレスを直接書かないこと。すべて環境変数から読む。
// ============================================================

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    // --- なりすまし防止：合言葉ヘッダーを検証 ---
    const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
    if (expectedSecret) {
      const got = req.headers.get("x-webhook-secret");
      if (got !== expectedSecret) {
        return new Response("unauthorized", { status: 401 });
      }
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const NOTIFY_TO = Deno.env.get("CONTACT_NOTIFY_TO");
    const NOTIFY_FROM = Deno.env.get("CONTACT_NOTIFY_FROM");

    if (!RESEND_API_KEY || !NOTIFY_TO || !NOTIFY_FROM) {
      return new Response("missing environment variables", { status: 500 });
    }

    // Database Webhook のボディは { type, table, record, ... } 形式
    const payload = await req.json().catch(() => ({}));
    const row = payload?.record ?? payload ?? {};

    // HTMLメール内に値を安全に埋め込む（最低限のエスケープ）
    const esc = (v: unknown): string =>
      String(v ?? "").replace(/[<>&"]/g, (c) =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string)
      );

    const subject = `【お問い合わせ】${esc(row.category)}：${esc(row.name)} 様`;
    const html = `
      <div style="font-family:sans-serif;line-height:1.7;color:#222;">
        <h2 style="margin:0 0 12px;">お問い合わせが届きました</h2>
        <table style="border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;"><strong>お名前</strong></td><td>${esc(row.name)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;"><strong>メール</strong></td><td>${esc(row.email)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;"><strong>電話</strong></td><td>${esc(row.phone) || "（未入力）"}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;"><strong>種別</strong></td><td>${esc(row.category)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;"><strong>受信日時</strong></td><td>${esc(row.created_at)}</td></tr>
        </table>
        <hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">
        <p style="white-space:pre-wrap;">${esc(row.message)}</p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">
        <p><a href="https://soratomizutodaichi.com/admin/contacts.html">管理画面でお問い合わせを確認する</a></p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [NOTIFY_TO],
        reply_to: typeof row.email === "string" ? row.email : undefined,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return new Response(`resend error: ${detail}`, { status: 502 });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
