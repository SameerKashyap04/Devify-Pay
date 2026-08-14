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
        <svg class="upi-app-icon" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.2"/><path d="M24.8 18.2c0-.6-.1-1.2-.2-1.7H18v3.2h3.8c-.2 1-.7 1.9-1.5 2.5v2.1h2.5c1.4-1.3 2.5-3.3 2.5-6.1z" fill="#4285F4"/><path d="M18 25.1c1.9 0 3.5-.6 4.7-1.7l-2.5-2.1c-.6.4-1.4.7-2.2.7-1.7 0-3.2-1.2-3.7-2.8H11.7v2.1c1.2 2.3 3.6 3.8 6.3 3.8z" fill="#34A853"/><path d="M14.3 19.2c-.1-.4-.2-.9-.2-1.4s.1-1 .2-1.4v-2.1H11.7c-.5 1-0.8 2.1-0.8 3.3s.3 2.3.8 3.3l2.6-1.7z" fill="#FBBC05"/><path d="M18 12.4c1 0 2 .4 2.7 1.1l2-2C21.5 10.4 19.9 9.8 18 9.8c-2.7 0-5.1 1.5-6.3 3.8l2.6 2.1c.5-1.6 2-2.8 3.7-2.8z" fill="#EA4335"/></svg>
        <span class="upi-app-name">Google Pay</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('phonepe',event)">
        <svg class="upi-app-icon" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#5f259f"/><path d="M23.5 12h-4.2c.4-.7.6-1.5.6-2.4 0-2.5-2-4.6-4.5-4.6H11v17.5h3.5v-5.2h1.4l4.6 5.2h4.5l-5.6-6.3c1.7-.7 2.9-2.3 2.9-4.2H23.5zM14.5 8h1c.8 0 1.5.7 1.5 1.5S16.3 11 15.5 11h-1V8z" fill="#ffffff"/><path d="M20.5 7h4v2h-4z" fill="#ffffff"/></svg>
        <span class="upi-app-name">PhonePe</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('paytm',event)">
        <svg class="upi-app-icon" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#002970"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="10" font-weight="900" fill="#00baf2" font-family="Inter,sans-serif" letter-spacing="-0.5px">Paytm</text></svg>
        <span class="upi-app-name">Paytm</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('bhim',event)">
        <svg class="upi-app-icon" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#002663"/><path d="M12 11l6.5 14H14l-4.5-9.5L12 11z" fill="#f26522"/><path d="M24 11L17.5 25H22l4.5-9.5L24 11z" fill="#008638"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="8" font-weight="900" fill="#ffffff" font-family="Inter,sans-serif" letter-spacing="0.5px">BHIM</text></svg>
        <span class="upi-app-name">BHIM</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('supermoney',event)">
        <svg class="upi-app-icon" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#6D28D9"/><path d="M20.5 10.5c-2.8 0-4.5 1.5-4.5 3.5 0 3.8 6.5 2.2 6.5 5 0 1.2-1.1 2-2.8 2-2.1 0-3.6-.8-4.5-1.8l-1.8 2.2c1.2 1.5 3.3 2.5 6.3 2.5 3.2 0 5.2-1.6 5.2-4 0-4.1-6.5-2.4-6.5-5.1 0-1 .9-1.7 2.4-1.7 1.8 0 3 .6 3.8 1.4l1.7-2.1c-1.3-1.2-3.1-1.9-5.8-1.9z" fill="#CCFF00"/><circle cx="25.5" cy="22.5" r="1.5" fill="#CCFF00"/></svg>
        <span class="upi-app-name">super.money</span>
      </a>
      <a class="upi-app-btn" href="#" onclick="openUpiApp('other',event)">
        <svg class="upi-app-icon" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#f1f5f9"/><circle cx="12" cy="18" r="2.2" fill="#475569"/><circle cx="18" cy="18" r="2.2" fill="#475569"/><circle cx="24" cy="18" r="2.2" fill="#475569"/></svg>
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

// ─── Lifecycle-Aware Fallback Timer & UPI App Launcher ───────────────────────
var fallbackTimer=null;
var appLaunched=false;

function cancelFallbackTimer(){
  appLaunched=true;
  if(fallbackTimer){
    clearTimeout(fallbackTimer);
    fallbackTimer=null;
  }
}

window.addEventListener('pagehide',cancelFallbackTimer);
window.addEventListener('blur',cancelFallbackTimer);
document.addEventListener('visibilitychange',function(){
  if(document.hidden||document.visibilityState==='hidden'){
    cancelFallbackTimer();
  }
});

function openUpiApp(app,evt){
  if(evt)evt.preventDefault();
  if(!upiUri)return;

  appLaunched=false;
  if(fallbackTimer){
    clearTimeout(fallbackTimer);
    fallbackTimer=null;
  }

  var isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>0);
  var isAndroid=/Android/i.test(navigator.userAgent);

  // Extract VPA, payee name, amount, and note from upiUri
  var rawVpa=(upiUri.match(/pa=([^&]+)/)||[])[1]||'';
  var cleanVpa=decodeURIComponent(rawVpa);
  var rawPn=(upiUri.match(/pn=([^&]+)/)||[])[1]||'Merchant';
  var cleanPn=decodeURIComponent(rawPn);
  var rawAm=(upiUri.match(/am=([^&]+)/)||[])[1]||'0.00';
  var cleanAm=parseFloat(rawAm).toFixed(2);
  var rawTn=(upiUri.match(/tn=([^&]+)/)||[])[1]||'';
  var cleanTn=decodeURIComponent(rawTn);

  // Build standard NPCI-compliant query payload (pa with unescaped @ for merchant detection)
  var npciQuery='pa='+encodeURIComponent(cleanVpa).replace(/%40/g,'@')+
                '&pn='+encodeURIComponent(cleanPn)+
                '&am='+cleanAm+
                '&cu=INR'+
                '&tn='+encodeURIComponent(cleanTn)+
                '&tr='+encodeURIComponent(cleanTn)+
                '&mode=02&mc=0000&purpose=00';

  var standardUpiUri='upi://pay?'+npciQuery;

  var androidIntents={
    gpay:'intent://pay?'+npciQuery+'#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;action=android.intent.action.VIEW;end;',
    phonepe:'intent://pay?'+npciQuery+'#Intent;scheme=upi;package=com.phonepe.app;action=android.intent.action.VIEW;end;',
    paytm:'intent://pay?'+npciQuery+'#Intent;scheme=upi;package=net.one97.paytm;action=android.intent.action.VIEW;end;',
    bhim:'intent://pay?'+npciQuery+'#Intent;scheme=upi;package=in.org.npci.upiapp;action=android.intent.action.VIEW;end;',
    supermoney:'intent://pay?'+npciQuery+'#Intent;scheme=upi;package=money.super.payments;action=android.intent.action.VIEW;end;'
  };

  var iosSchemes={
    gpay:'gpay://upi/pay?'+npciQuery,
    phonepe:'phonepe://pay?'+npciQuery,
    paytm:'paytmmp://pay?'+npciQuery,
    bhim:'bhim://pay?'+npciQuery,
    supermoney:'supermoney://pay?'+npciQuery
  };

  var playStores={
    gpay:'https://play.google.com/store/apps/details?id=com.google.android.apps.nbu.paisa.user',
    phonepe:'https://play.google.com/store/apps/details?id=com.phonepe.app',
    paytm:'https://play.google.com/store/apps/details?id=net.one97.paytm',
    bhim:'https://play.google.com/store/apps/details?id=in.org.npci.upiapp',
    supermoney:'https://play.google.com/store/apps/details?id=money.super.payments'
  };

  var appStores={
    gpay:'https://apps.apple.com/in/app/google-pay-save-pay-send/id1193357041',
    phonepe:'https://apps.apple.com/in/app/phonepe-payments-recharge/id1170055821',
    paytm:'https://apps.apple.com/in/app/paytm-payments-recharge/id473924402',
    bhim:'https://apps.apple.com/in/app/bhim-making-india-cashless/id1184178652',
    supermoney:'https://apps.apple.com/in/app/super-money-upi-rewards/id6478956976'
  };

  var targetUrl=standardUpiUri;
  if(app!=='other'){
    if(isAndroid&&androidIntents[app]){
      targetUrl=androidIntents[app];
    }else if(isIOS&&iosSchemes[app]){
      targetUrl=iosSchemes[app];
    }
  }

  var startTime=Date.now();
  window.location.href=targetUrl;

  var storeUrl=isIOS?appStores[app]:playStores[app];
  if(storeUrl&&app!=='other'){
    fallbackTimer=setTimeout(function(){
      // Execute store fallback ONLY if app did NOT launch and page remains active in foreground
      if(!appLaunched&&!document.hidden&&document.visibilityState!=='hidden'){
        var elapsed=Date.now()-startTime;
        if(elapsed<3000){
          window.location.href=storeUrl;
        }
      }
    },2500);
  }
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
