const MAX_PDF_BYTES = 8 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = String(env.ALLOWED_ORIGIN || "").replace(/\/+$/, "");
    const corsHeaders = buildCorsHeaders(origin, allowedOrigin);

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin, allowedOrigin)) {
        return json({ error: "Origem não autorizada." }, 403, corsHeaders);
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET") {
      return json(
        {
          ok: true,
          service: "coplan-email-pdf",
          providerConfigured: Boolean(env.RESEND_API_KEY),
        },
        200,
        corsHeaders
      );
    }

    if (request.method !== "POST") {
      return json({ error: "Método não permitido." }, 405, corsHeaders);
    }

    if (!isAllowedOrigin(origin, allowedOrigin)) {
      return json({ error: "Origem não autorizada." }, 403, corsHeaders);
    }

    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      return json({ error: "Serviço de e-mail ainda não configurado." }, 503, corsHeaders);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_PDF_BYTES + 1024 * 1024) {
      return json({ error: "A requisição excede o limite permitido." }, 413, corsHeaders);
    }

    try {
      const form = await request.formData();
      const recipientName = cleanText(form.get("recipientName"), 160);
      const recipientEmail = cleanText(form.get("recipientEmail"), 254).toLowerCase();
      const ccEmail = cleanText(form.get("ccEmail"), 254).toLowerCase();
      const reference = cleanText(form.get("reference"), 200);
      const subject = cleanText(form.get("subject"), 240);
      const message = cleanText(form.get("message"), 5000);
      const pdf = form.get("pdf");

      if (!isEmail(recipientEmail)) return json({ error: "E-mail do destinatário inválido." }, 400, corsHeaders);
      if (ccEmail && !isEmail(ccEmail)) return json({ error: "E-mail em cópia inválido." }, 400, corsHeaders);
      if (!subject) return json({ error: "Informe o assunto." }, 400, corsHeaders);
      if (!message) return json({ error: "Informe a mensagem." }, 400, corsHeaders);
      if (!(pdf instanceof File)) return json({ error: "Arquivo PDF não recebido." }, 400, corsHeaders);
      if (!/\.pdf$/i.test(pdf.name) || pdf.size > MAX_PDF_BYTES) {
        return json({ error: "Envie um PDF com até 8 MB." }, 400, corsHeaders);
      }

      const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
      if (!hasPdfSignature(pdfBytes)) {
        return json({ error: "O arquivo enviado não possui uma assinatura PDF válida." }, 400, corsHeaders);
      }

      const greeting = recipientName ? `Olá, ${escapeHtml(recipientName)}.` : "Olá.";
      const referenceHtml = reference ? `<p><strong>Referência:</strong> ${escapeHtml(reference)}</p>` : "";
      const html = `
        <div style="font-family:Arial,sans-serif;color:#102033;line-height:1.6">
          <p>${greeting}</p>
          ${referenceHtml}
          <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
          <p>Atenciosamente,<br><strong>Coplan</strong></p>
        </div>`;

      const emailPayload = {
        from: env.EMAIL_FROM,
        to: [recipientEmail],
        subject,
        html,
        text: buildPlainText(recipientName, reference, message),
        attachments: [
          {
            filename: safeFilename(pdf.name),
            content: bytesToBase64(pdfBytes),
          },
        ],
      };
      if (ccEmail) emailPayload.cc = [ccEmail];

      const requestId = crypto.randomUUID();
      const providerResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify(emailPayload),
      });
      const providerPayload = await providerResponse.json().catch(() => ({}));

      if (!providerResponse.ok) {
        console.error("Resend error", providerResponse.status, providerPayload);
        return json(
          { error: providerPayload.message || "O provedor de e-mail recusou o envio." },
          providerResponse.status,
          corsHeaders
        );
      }

      return json({ ok: true, id: providerPayload.id || requestId }, 200, corsHeaders);
    } catch (error) {
      console.error("Email worker error", error);
      return json({ error: "Erro interno ao preparar o envio." }, 500, corsHeaders);
    }
  },
};

function buildCorsHeaders(origin, allowedOrigin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin, allowedOrigin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function isAllowedOrigin(origin, allowedOrigin) {
  if (!allowedOrigin) return false;
  return origin.replace(/\/+$/, "") === allowedOrigin;
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasPdfSignature(bytes) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function safeFilename(filename) {
  const cleaned = String(filename || "documento.pdf").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPlainText(name, reference, message) {
  const lines = [name ? `Olá, ${name}.` : "Olá."];
  if (reference) lines.push("", `Referência: ${reference}`);
  lines.push("", message, "", "Atenciosamente,", "Coplan");
  return lines.join("\n");
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}
