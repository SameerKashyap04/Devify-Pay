import type { FastifyInstance } from "fastify";
import { getPaymentByPublicId } from "../services/payment.service.js";
import { rateLimits } from "../config/rate-limits.js";

export async function checkoutPageRoutes(app: FastifyInstance) {
  app.get(
    "/pay/:id",
    { config: { rateLimit: { max: rateLimits.public.max, timeWindow: rateLimits.public.timeWindow } } },
    async (req, reply) => {
    const { id } = req.params as { id: string };
    const payment = await getPaymentByPublicId({ publicId: id }).catch(() => null);

    if (!payment) {
      reply.type("text/html").status(404).send(renderNotFound());
      return;
    }

      reply.type("text/html").send(renderCheckout(payment));
    }
  );
}

function renderNotFound() {
  return `<!doctype html><html><head><title>Devify Pay</title></head>
  <body style="font-family:system-ui;text-align:center;margin-top:80px;">
    <h2>Payment not found</h2>
    <p>This payment link is invalid or has expired.</p>
  </body></html>`;
}

function renderCheckout(payment: {
  publicId: string;
  amount: number;
  currency: string;
  status: string;
  upiUri: string | null;
  qrImageUrl: string | null;
  expiresAt: Date | null;
  order: { publicId: string; description: string | null };
  application: { name: string };
}) {
  const rupees = (payment.amount / 100).toFixed(2);
  const expiresAtMs = payment.expiresAt ? new Date(payment.expiresAt).getTime() : Date.now() + 15 * 60 * 1000;

  const alreadyDone = ["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "PENDING_VERIFICATION"].includes(
    payment.status
  );

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Devify Pay — Checkout</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background:#f6f7fb; margin:0; padding:0; }
  .card { max-width: 420px; margin: 32px auto; background:#fff; border-radius:16px; box-shadow:0 2px 16px rgba(0,0,0,.08); overflow:hidden; }
  .header { padding: 20px 24px 0; }
  .brand { font-size: 13px; color:#888; letter-spacing:.04em; text-transform:uppercase; }
  .app-name { font-size: 20px; font-weight:600; margin-top:4px; }
  .desc { color:#666; margin-top:2px; font-size:14px; }
  .amount { font-size: 34px; font-weight:700; margin: 16px 24px 0; }
  .qr-wrap { text-align:center; padding: 20px 24px; }
  .qr-wrap img { width:220px; height:220px; border:1px solid #eee; border-radius:12px; }
  .order { color:#999; font-size:12px; padding: 0 24px; }
  .timer { text-align:center; color:#c0392b; font-size:13px; margin: 8px 0 4px; }
  .actions { padding: 16px 24px 24px; }
  button { width:100%; padding:14px; border:none; border-radius:10px; background:#111; color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
  button:disabled { background:#ccc; cursor:not-allowed; }
  .status-badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:600; }
  .status-PENDING { background:#fff3cd; color:#8a6d3b; }
  .status-PENDING_VERIFICATION { background:#d1ecf1; color:#0c5460; }
  .status-SUCCESS { background:#d4edda; color:#155724; }
  .status-FAILED, .status-EXPIRED, .status-CANCELLED { background:#f8d7da; color:#721c24; }
  input { width:100%; padding:12px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box; margin-bottom:10px; }
  .confirm-form { padding: 0 24px 24px; }
  .hint { font-size:12px; color:#999; margin-top:8px; }
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">Devify Pay</div>
      <div class="app-name">${escapeHtml(payment.application.name)}</div>
      <div class="desc">${escapeHtml(payment.order.description ?? "Payment")}</div>
    </div>
    <div class="amount">₹${rupees}</div>

    ${
      payment.status === "PENDING" && payment.qrImageUrl
        ? `<div class="qr-wrap"><img src="${payment.qrImageUrl}" alt="UPI QR" /></div>
           <div class="timer" id="timer"></div>`
        : `<div class="qr-wrap"><span class="status-badge status-${payment.status}">${payment.status}</span></div>`
    }

    <div class="order">Order: ${escapeHtml(payment.order.publicId)} &middot; Payment: ${escapeHtml(payment.publicId)}</div>

    ${
      payment.status === "PENDING"
        ? `<div class="actions"><button id="paidBtn">I HAVE PAID</button></div>
           <div class="confirm-form" id="confirmForm" style="display:none;">
             <input id="txnId" placeholder="Enter UPI transaction / reference ID" maxlength="100" />
             <button id="submitBtn">Submit for verification</button>
             <div class="hint">Your payment will be reviewed and confirmed by the merchant. This can take some time — it is not marked successful automatically.</div>
           </div>`
        : payment.status === "PENDING_VERIFICATION"
        ? `<div class="actions"><p style="text-align:center;color:#0c5460;">We've received your reference ID. Verification is in progress — you'll be notified once it's confirmed.</p></div>`
        : ""
    }
  </div>

<script>
  const expiresAt = ${expiresAtMs};
  const timerEl = document.getElementById('timer');
  function tick() {
    if (!timerEl) return;
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const m = Math.floor(remaining / 60), s = remaining % 60;
    timerEl.textContent = remaining > 0 ? 'Expires in ' + m + ':' + String(s).padStart(2,'0') : 'Expired';
  }
  tick(); setInterval(tick, 1000);

  const paidBtn = document.getElementById('paidBtn');
  const confirmForm = document.getElementById('confirmForm');
  const submitBtn = document.getElementById('submitBtn');
  if (paidBtn) {
    paidBtn.addEventListener('click', () => {
      paidBtn.style.display = 'none';
      confirmForm.style.display = 'block';
    });
  }
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const txnId = document.getElementById('txnId').value.trim();
      if (txnId.length < 3) { alert('Please enter a valid transaction/reference ID'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      try {
        const res = await fetch('/v1/payments/${payment.publicId}/confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction_id: txnId })
        });
        if (res.ok) {
          location.reload();
        } else {
          const data = await res.json();
          alert(data?.error?.message || 'Something went wrong');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit for verification';
        }
      } catch (e) {
        alert('Network error, please try again');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit for verification';
      }
    });
  }
</script>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
