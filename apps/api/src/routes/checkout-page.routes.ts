import type { FastifyInstance } from "fastify";
import { getPaymentByPublicId } from "../services/payment.service.js";
import { rateLimits } from "../config/rate-limits.js";
import { prisma } from "@devify/database";

export async function checkoutPageRoutes(app: FastifyInstance) {
  app.get(
    "/pay/:id",
    { config: { rateLimit: { max: rateLimits.public.max, timeWindow: rateLimits.public.timeWindow } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const payment = await getPaymentByPublicId({ publicId: id }).catch(() => null);
      if (!payment) { reply.type("text/html").status(404).send(renderNotFound()); return; }
      reply.type("text/html").send(renderCheckout(payment));
    }
  );

  app.get(
    "/pay/:id/status",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const payment = await prisma.payment.findFirst({ where: { publicId: id }, select: { status: true, publicId: true } });
      if (!payment) return reply.status(404).send({ error: "not_found" });
      return { status: payment.status };
    }
  );
}

function renderNotFound() {
  return `<!doctype html><html><head><title>Devify Pay</title></head><body style="font-family:system-ui;text-align:center;margin-top:80px;"><h2>Payment not found</h2><p>This payment link is invalid or has expired.</p></body></html>`;
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderCheckout(payment: {
  publicId: string; amount: number; currency: string; status: string;
  upiUri: string | null; qrImageUrl: string | null; expiresAt: Date | null;
  order: { publicId: string; description: string | null };
  application: { name: string };
}) {
  const rupees = (payment.amount / 100).toFixed(2);
  const expiresAtMs = payment.expiresAt ? new Date(payment.expiresAt).getTime() : Date.now() + 10 * 60 * 1000;
  const upiUriRaw = payment.upiUri ?? "";
  const upiUriEsc = escapeHtml(upiUriRaw);
  const isPending = payment.status === "PENDING";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Devify Pay — Checkout</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:linear-gradient(135deg,#f0f4ff 0%,#faf9ff 100%);margin:0;padding:16px;min-height:100vh}
.card{max-width:440px;margin:0 auto;background:#fff;border-radius:20px;box-shadow:0 4px 32px rgba(0,0,0,.10);overflow:hidden}
.header{padding:22px 24px 16px;border-bottom:1px solid #f0f0f4}
.brand{font-size:11px;color:#9ca3af;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
.app-name{font-size:20px;font-weight:700;margin-top:4px;color:#111}
.desc{color:#6b7280;margin-top:2px;font-size:13px}
.amount-row{display:flex;align-items:center;justify-content:space-between;padding:16px 24px 0}
.amount{font-size:36px;font-weight:800;color:#111;letter-spacing:-1px}
.amount-label{font-size:12px;color:#9ca3af;text-align:right;line-height:1.5}
.qr-wrap{text-align:center;padding:16px 24px}
.qr-wrap img{width:210px;height:210px;border:1px solid #e5e7eb;border-radius:16px}
.scan-hint{font-size:12px;color:#6b7280;margin-top:8px;line-height:1.6}
.timer-row{display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 24px 12px}
.timer-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:pulse 1.4s ease-in-out infinite;flex-shrink:0}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.timer-text{font-size:13px;font-weight:600;color:#ef4444;text-align:center}
.timer-expired{color:#6b7280!important;font-weight:400!important;font-size:12px!important}
.divider{display:flex;align-items:center;gap:10px;padding:0 24px;margin:6px 0}
.divider-line{flex:1;height:1px;background:#f0f0f4}
.divider-text{font-size:11px;color:#d1d5db;font-weight:500;white-space:nowrap}

/* UPI app tap buttons */
.upi-apps-section{padding:8px 24px 12px}
.upi-apps-label{font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;text-align:center}
.upi-apps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.upi-app-btn{display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border-radius:12px;border:1.5px solid #e5e7eb;background:#fafafa;cursor:pointer;text-decoration:none;transition:border-color .15s,background .15s,transform .1s;-webkit-tap-highlight-color:transparent}
.upi-app-btn:active{transform:scale(0.95)}
.upi-app-btn:hover{border-color:#6366f1;background:#f5f3ff}
.upi-app-icon{width:36px;height:36px;border-radius:10px;object-fit:contain}
.upi-app-name{font-size:11px;font-weight:500;color:#374151}

/* Bottom action area (hidden by default, shown after timer/help) */
.bottom-actions{padding:0 24px 20px;display:none}
.bottom-actions-title{font-size:13px;font-weight:600;color:#374151;margin-bottom:10px;padding-top:4px}
.txn-input{width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;font-family:inherit;outline:none;margin-bottom:10px;transition:border-color .15s}
.txn-input:focus{border-color:#6366f1}
.submit-btn{width:100%;padding:14px;border:none;border-radius:12px;background:#111;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s}
.submit-btn:hover{background:#333}
.submit-btn:disabled{background:#d1d5db;cursor:not-allowed}
.txn-hint{font-size:12px;color:#9ca3af;margin-top:8px;line-height:1.6}
.help-link{display:block;text-align:center;font-size:12px;color:#9ca3af;cursor:pointer;padding:8px 0 12px;text-decoration:underline}
.help-link:hover{color:#6366f1}

/* Banners */
.success-banner{background:linear-gradient(135deg,#d1fae5,#ecfdf5);color:#065f46;border-radius:12px;padding:16px 20px;font-weight:700;font-size:15px;text-align:center;border:1px solid #a7f3d0}
.success-sub{font-size:12px;font-weight:400;margin-top:4px;color:#047857}
.pending-banner{background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:14px 20px;font-size:14px;text-align:center;border:1px solid #bfdbfe}
.status-badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600}
.status-PENDING{background:#fef3c7;color:#92400e}
.status-PENDING_VERIFICATION{background:#dbeafe;color:#1e40af}
.status-SUCCESS{background:#d1fae5;color:#065f46}
.status-FAILED,.status-EXPIRED,.status-CANCELLED{background:#fee2e2;color:#991b1b}
.order-info{color:#d1d5db;font-size:11px;padding:8px 24px 20px;text-align:center}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="brand">Devify Pay</div>
    <div class="app-name">${escapeHtml(payment.application.name)}</div>
    <div class="desc">${escapeHtml(payment.order.description ?? "Payment")}</div>
  </div>
  <div class="amount-row">
    <div class="amount">&#8377;${rupees}</div>
    <div class="amount-label">Indian Rupees<br/><span style="color:#10b981;font-weight:600">UPI</span></div>
  </div>

  ${isPending && payment.qrImageUrl ? `
  <div class="qr-wrap">
    <img src="${payment.qrImageUrl}" alt="UPI QR Code"/>
    <p class="scan-hint">Scan with any UPI app &bull; Do <strong>not</strong> modify the transaction note</p>
  </div>
  <div class="timer-row">
    <div class="timer-dot" id="timerDot"></div>
    <div class="timer-text" id="timer"></div>
  </div>

  <div class="divider" id="upiAppsDivider" style="display:none"><div class="divider-line"></div><div class="divider-text">OR TAP UPI APP (MOBILE)</div><div class="divider-line"></div></div>
  <div class="upi-apps-section" id="upiAppsSection" style="display:none">
    <div class="upi-apps-label">Tap to open &amp; pay directly</div>
    <div class="upi-apps-grid">
      <a class="upi-app-btn" href="#" onclick="openUpiApp('gpay',event)">
        <img class="upi-app-icon" src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Google_Pay_Logo.svg/512px-Google_Pay_Logo.svg.png" alt="GPay"/>
        <span class="upi-app-name">Google Pay</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('phonepe',event)">
        <img class="upi-app-icon" src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/PhonePe_Logo.svg/512px-PhonePe_Logo.svg.png" alt="PhonePe"/>
        <span class="upi-app-name">PhonePe</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('paytm',event)">
        <img class="upi-app-icon" src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Paytm_Logo_%28standalone%29.svg/512px-Paytm_Logo_%28standalone%29.svg.png" alt="Paytm"/>
        <span class="upi-app-name">Paytm</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('bhim',event)">
        <img class="upi-app-icon" src="https://upload.wikimedia.org/wikipedia/en/thumb/6/6f/BHIM_logo_%28vector%29.svg/512px-BHIM_logo_%28vector%29.svg.png" alt="BHIM"/>
        <span class="upi-app-name">BHIM</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('supermoney',event)">
        <svg class="upi-app-icon" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#4f46e5"/><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-size="14" font-weight="bold" fill="white" font-family="Inter,sans-serif">S</text></svg>
        <span class="upi-app-name">super.money</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('other',event)">
        <svg class="upi-app-icon" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#f3f4f6"/><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-size="20" fill="#6b7280">&#8943;</text></svg>
        <span class="upi-app-name">Other UPI</span>
      </a>
    </div>
  </div>
  ` : `<div class="qr-wrap"><span class="status-badge status-${payment.status}">${payment.status.replace("_"," ")}</span></div>`}

  <div id="autoVerifyBanner" style="display:none" class="qr-wrap">
    <div class="success-banner">&#9989; Payment Verified Automatically!<div class="success-sub">Redirecting you back to the app...</div></div>
  </div>

  ${isPending ? `
  <div style="text-align:center"><span class="help-link" id="helpLink">Having trouble? Click here</span></div>
  <div class="bottom-actions" id="bottomActions">
    <div style="height:1px;background:#f0f0f4;margin-bottom:16px"></div>
    <div class="bottom-actions-title">&#128722; Already paid? Submit your reference ID</div>
    <input class="txn-input" id="txnId" placeholder="Enter UPI transaction / reference ID" maxlength="100"/>
    <button class="submit-btn" id="submitBtn">Submit for verification</button>
    <div class="txn-hint">Enter the 12-digit UTR or Transaction ID shown in your UPI app after payment. The merchant will verify it shortly.</div>
  </div>
  ` : payment.status === "PENDING_VERIFICATION" ? `
  <div style="padding:0 24px 20px"><div class="pending-banner">&#8987; Reference received. Verification in progress &mdash; you'll be notified once confirmed.</div></div>
  ` : ""}

  <div class="order-info">Order: ${escapeHtml(payment.order.publicId)} &middot; Payment: ${escapeHtml(payment.publicId)}</div>
</div>

<script>
var expiresAt=${expiresAtMs},paymentId='${payment.publicId}',upiUri='${upiUriEsc}';
var timerEl=document.getElementById('timer'),timerDot=document.getElementById('timerDot');
var autoVerifyBanner=document.getElementById('autoVerifyBanner');
var helpLink=document.getElementById('helpLink'),bottomActions=document.getElementById('bottomActions');
var pollInterval=null,timerExpiredFlag=false;

// ─── Mobile detection → show UPI app buttons only on mobile/tablet ─────────
var isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
var appsSection=document.getElementById('upiAppsSection');
var appsDivider=document.getElementById('upiAppsDivider');
if(isMobile&&appsSection){
  appsSection.style.display='block';
  if(appsDivider)appsDivider.style.display='flex';
}

// ─── UPI deep link helper ──────────────────────────────────────────────────
function openUpiApp(app,evt){
  evt.preventDefault();
  if(!upiUri)return;
  var schemes={gpay:upiUri.replace('upi://','gpay://upi/'),phonepe:upiUri.replace('upi://','phonepe://'),paytm:upiUri.replace('upi://','paytmmp://'),bhim:upiUri.replace('upi://','bhim://'),supermoney:upiUri.replace('upi://','supermoney://'),other:upiUri};
  window.location.href=schemes[app]||upiUri;
  var stores={gpay:'https://play.google.com/store/apps/details?id=com.google.android.apps.nbu.paisa.user',phonepe:'https://play.google.com/store/apps/details?id=com.phonepe.app',paytm:'https://play.google.com/store/apps/details?id=net.one97.paytm',bhim:'https://play.google.com/store/apps/details?id=in.org.npci.upiapp',supermoney:'https://play.google.com/store/apps/details?id=money.super.payments'};
  if(stores[app])setTimeout(function(){window.open(stores[app],'_blank');},1500);
}

// ─── Timer ─────────────────────────────────────────────────────────────────
function tick(){
  if(!timerEl)return;
  var rem=Math.max(0,Math.floor((expiresAt-Date.now())/1000)),m=Math.floor(rem/60),s=rem%60;
  if(rem>0){
    timerEl.textContent='Expires in '+m+':'+String(s).padStart(2,'0');
    timerEl.className='timer-text';
    if(timerDot)timerDot.style.display='';
  }else if(!timerExpiredFlag){
    timerExpiredFlag=true;
    timerEl.textContent='Timer expired — you can still submit your payment reference ID below';
    timerEl.className='timer-text timer-expired';
    if(timerDot)timerDot.style.display='none';
    showBottomActions();
  }
}
tick();setInterval(tick,1000);

// ─── Show bottom actions (help form) ──────────────────────────────────────
function showBottomActions(){
  if(helpLink)helpLink.style.display='none';
  if(bottomActions)bottomActions.style.display='block';
}
if(helpLink)helpLink.addEventListener('click',showBottomActions);

// ─── Status polling ────────────────────────────────────────────────────────
function startPolling(){
  pollInterval=setInterval(async function(){
    try{
      var res=await fetch('/pay/'+paymentId+'/status');
      if(!res.ok)return;
      var data=await res.json();
      if(data.status==='SUCCESS'){
        clearInterval(pollInterval);
        if(autoVerifyBanner)autoVerifyBanner.style.display='block';
        if(bottomActions)bottomActions.style.display='none';
        if(helpLink)helpLink.style.display='none';
        if(timerEl)timerEl.textContent='';
        if(timerDot)timerDot.style.display='none';
        var params=new URLSearchParams(window.location.search);
        var redirectUrl=params.get('redirect_url')||params.get('return_url');
        if(redirectUrl){var sep=redirectUrl.includes('?')?'&':'?';setTimeout(function(){window.location.href=redirectUrl+sep+'payment_id='+paymentId+'&status=SUCCESS';},2000);}
      }else if(data.status==='FAILED'||data.status==='EXPIRED'||data.status==='CANCELLED'){
        clearInterval(pollInterval);setTimeout(function(){location.reload();},1500);
      }
    }catch(e){}
  },3000);
}
if('${payment.status}'==='PENDING')startPolling();

// ─── Submit manual txn ID ─────────────────────────────────────────────────
var submitBtn=document.getElementById('submitBtn');
if(submitBtn)submitBtn.addEventListener('click',async function(){
  var txnId=document.getElementById('txnId').value.trim();
  if(txnId.length<3){alert('Please enter a valid transaction/reference ID');return;}
  submitBtn.disabled=true;submitBtn.textContent='Submitting...';
  try{
    var res=await fetch('/v1/payments/${payment.publicId}/confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transaction_id:txnId})});
    if(res.ok){location.reload();}
    else{var data=await res.json();alert(data&&data.error&&data.error.message?data.error.message:'Something went wrong');submitBtn.disabled=false;submitBtn.textContent='Submit for verification';}
  }catch(e){alert('Network error, please try again');submitBtn.disabled=false;submitBtn.textContent='Submit for verification';}
});
</script>
</body>
</html>`;
}
