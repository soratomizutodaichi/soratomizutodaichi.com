// ============================================================
// Edge Function: notify-contact
//   目的 : contacts に新規INSERTが入ったら、
//          (1) 管理者へ「新着通知」 (2) お客様へ「受付確認」の2通を送る
//   呼出 : Supabase Database Webhook（contacts の INSERT）から HTTP POST
//   送信 : Resend API（https://resend.com）
//
//   必要なシークレット（Edge Function の Secrets に設定。コードには書かない）：
//     RESEND_API_KEY      … Resend の API キー
//     CONTACT_NOTIFY_TO   … 管理者の受信メール（新着通知の宛先）
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
    const messageHtml = esc(row.message).replace(/\r?\n/g, "<br>");

    // Resend で1通送るヘルパー
    const sendEmail = async (to: string, subject: string, html: string, replyTo?: string) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: NOTIFY_FROM,
          to: [to],
          reply_to: replyTo || undefined,
          subject,
          html,
        }),
      });
      return res;
    };

    // ---------- (1) 管理者への新着通知 ----------
    const adminSubject = `【お問い合わせ】${esc(row.category)}：${esc(row.name)} 様`;
    const adminHtml = `
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
        <p style="white-space:pre-wrap;">${messageHtml}</p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">
        <p><a href="https://soratomizutodaichi.com/admin/contacts.html">管理画面でお問い合わせを確認する</a></p>
      </div>
    `;

    // 管理者通知は必須。失敗したら 502 を返す（Webhookが再試行する）
    // Reply-To をお客様のメールにして、通知メールからそのまま返信できるようにする
    const customerEmailForReply = typeof row.email === "string" ? row.email.trim() : "";
    const adminRes = await sendEmail(NOTIFY_TO, adminSubject, adminHtml, customerEmailForReply || undefined);
    if (!adminRes.ok) {
      const detail = await adminRes.text().catch(() => "");
      return new Response(`resend error (admin): ${detail}`, { status: 502 });
    }

    // ---------- (2) お客様への受付確認 ----------
    const customerEmail = typeof row.email === "string" ? row.email.trim() : "";
    if (customerEmail) {
      const customerSubject = "【空と水と大地合同会社】お問い合わせを受け付けました";
      const customerHtml = `
        <div style="font-family:sans-serif;line-height:1.8;color:#222;">
          <p>${esc(row.name)} 様</p>
          <p>この度はお問い合わせいただき、誠にありがとうございます。<br>
          下記の内容でお問い合わせを受け付けました。担当者より順次ご返信いたしますので、いましばらくお待ちください。</p>
          <hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">
          <p style="margin:0 0 6px;"><strong>お問い合わせ種別</strong>：${esc(row.category)}</p>
          <p style="margin:0 0 6px;"><strong>お問い合わせ内容</strong></p>
          <p style="white-space:pre-wrap;background:#f6f6f2;padding:12px;border-radius:8px;">${messageHtml}</p>
          <hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">
          <p style="color:#666;font-size:13px;">
            ※本メールは送信専用アドレスから自動送信しています。<br>
            　このメールにそのまま返信いただくと、担当者に届きます。<br>
            　お心当たりのない場合は、お手数ですが破棄してください。<br><br>
            空と水と大地合同会社<br>
            https://soratomizutodaichi.com/
          </p>
        </div>
      `;

      // 受付確認はベストエフォート。失敗しても管理者通知は成功しているので 200 を返す
      // Reply-To は管理者の受信箱（お客様が返信すれば担当者に届く）
      const custRes = await sendEmail(customerEmail, customerSubject, customerHtml, NOTIFY_TO);
      if (!custRes.ok) {
        const detail = await custRes.text().catch(() => "");
        console.warn("customer ack email failed:", custRes.status, detail);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
