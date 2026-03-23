/**
 * Prefect Product Pages — Chrome Extension Content Script
 *
 * Targets: www.prefect.io and prefect.io
 *
 * Injects a Solutions dropdown banner and product page for:
 *   • /solutions/chain-of-action — Chain of Action (Workflows as AI Tools)
 *
 * Each page is rendered in a Shadow DOM to isolate styles. Pages with
 * scroll-animation scripts have those scripts executed with a patched
 * document/window proxy that redirects DOM queries to the shadow root
 * and scroll events to the overlay container.
 */

(() => {
  const HOST_ID = "pdt-overlay-host";

  // ── Page definitions ───────────────────────────────────────────────────────

  // Shared CSS for all blog post pages (superset of all three posts' styles)
  const BLOG_CSS = `
:root{
  --bg:#0B0F1A;--card:#141926;--elev:#1C2333;
  --t1:#FFF;--t2:#94A3B8;--t3:#64748B;
  --acc:#2EDDB5;--acc-d:rgba(46,221,181,.12);--acc-b:rgba(46,221,181,.25);
  --blu:#3B82F6;--blu-d:rgba(59,130,246,.12);
  --pur:#A78BFA;--pur-d:rgba(167,139,250,.12);
  --red:#EF4444;--red-d:rgba(239,68,68,.12);
  --org:#F97316;--org-d:rgba(249,115,22,.12);
  --bdr:rgba(255,255,255,.07);
  --f:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  --m:'JetBrains Mono',monospace;
}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:var(--f);background:var(--bg);color:var(--t1);-webkit-font-smoothing:antialiased;}
.back-link{display:block;max-width:720px;margin:0 auto;padding:32px 24px 0;font-size:13px;font-weight:600;color:var(--t3);text-decoration:none;}
.back-link:hover{color:var(--t2);}
.blog{max-width:720px;margin:0 auto;padding:32px 24px 120px;}
.tags{display:flex;gap:8px;margin-bottom:16px;}
.tag{font-size:13px;color:var(--t3);background:var(--elev);padding:4px 12px;border-radius:6px;}
.date{font-size:14px;color:var(--t3);margin-bottom:24px;}
.blog h1{font-size:42px;font-weight:700;letter-spacing:-.03em;line-height:1.15;margin-bottom:28px;}
.author{display:flex;align-items:center;gap:14px;margin-bottom:48px;padding-bottom:32px;border-bottom:1px solid var(--bdr);}
.author-pic{width:48px;height:48px;border-radius:12px;background:var(--blu-d);color:var(--blu);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;}
.author-name{font-size:15px;font-weight:600;}
.author-title{font-size:13px;color:var(--t3);}
.blog p{font-size:17px;color:var(--t2);line-height:1.8;margin-bottom:24px;}
.blog p strong{color:var(--t1);}
.blog h2{font-size:26px;font-weight:700;letter-spacing:-.02em;margin:48px 0 16px;line-height:1.3;}
.blog h3{font-size:20px;font-weight:700;margin:36px 0 12px;}
.blog ul,.blog ol{margin:0 0 24px 24px;color:var(--t2);font-size:17px;line-height:1.8;}
.blog li{margin-bottom:8px;}
.blog li strong{color:var(--t1);}
.blog code{font-family:var(--m);font-size:14px;background:var(--elev);padding:2px 8px;border-radius:4px;color:var(--acc);}
.blog blockquote{border-left:3px solid var(--acc);padding-left:20px;margin:32px 0;font-style:italic;color:var(--t2);}
.blog hr{border:none;border-top:1px solid var(--bdr);margin:48px 0;}
.blog a{color:var(--acc);text-decoration:none;}
.blog a:hover{text-decoration:underline;}
.codeblock{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:20px 24px;margin:24px 0;font-family:var(--m);font-size:13px;line-height:1.85;color:#C9D1D9;overflow-x:auto;}
.codeblock .cmt{color:#545D68;font-style:italic;}
.codeblock .kw{color:#FF7B72;}
.codeblock .str{color:#A5D6FF;}
.codeblock .dec{color:#FFA657;}
.codeblock .acc{color:#2EDDB5;}
.diagram{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:24px;margin:24px 0;font-family:var(--m);font-size:13px;line-height:2;color:var(--t2);}
.diagram .ok{color:#22C55E;}
.diagram .fl{color:var(--red);}
.diagram .ar{color:var(--t3);}
.callout{background:var(--acc-d);border:1px solid var(--acc-b);border-radius:12px;padding:24px;margin:32px 0;}
.callout p{color:var(--t2);margin-bottom:0;font-size:16px;}
.callout strong{color:var(--t1);}
.blog em.hl{font-style:normal;color:var(--acc);font-weight:600;}
.asset-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0;}
.asset-card{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:20px;}
.asset-card h4{font-size:15px;font-weight:700;margin-bottom:6px;color:var(--t1);}
.asset-card p{font-size:14px;color:var(--t3);line-height:1.5;margin:0;}
.asset-card .asset-tag{display:inline-block;font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;margin-bottom:10px;}
.asset-card .at-have{background:var(--acc-d);color:var(--acc);}
.asset-card .at-new{background:var(--pur-d);color:var(--pur);}
.comp-table{width:100%;border-collapse:collapse;margin:24px 0;font-size:14px;}
.comp-table th{text-align:left;padding:12px 16px;border-bottom:2px solid var(--bdr);color:var(--t3);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.05em;}
.comp-table td{padding:12px 16px;border-bottom:1px solid var(--bdr);color:var(--t2);}
.comp-table td:first-child{color:var(--t1);font-weight:600;}
.comp-table .yes{color:var(--acc);}
.comp-table .no{color:var(--t3);}
.arch{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:28px 32px;margin:28px 0;font-family:var(--m);font-size:13px;line-height:1.9;color:var(--t2);overflow-x:auto;}
.arch .label{color:var(--t3);font-size:11px;text-transform:uppercase;letter-spacing:.08em;}
.arch .node{display:inline-block;background:var(--elev);border:1px solid var(--bdr);border-radius:8px;padding:6px 14px;margin:4px 0;color:var(--t1);font-weight:500;}
.arch .node-acc{border-color:var(--acc-b);color:var(--acc);}
.arch .node-blu{border-color:rgba(59,130,246,.3);color:var(--blu);}
.arch .arrow{color:var(--t3);margin:0 8px;}
.risk-grid{display:grid;grid-template-columns:1fr;gap:16px;margin:24px 0;}
.risk-card{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:20px 24px;display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.risk-card h4{font-size:15px;font-weight:700;margin-bottom:6px;grid-column:1/-1;}
.risk-card .risk-tag{display:inline-block;font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;margin-right:6px;margin-bottom:8px;}
.rt-tech{background:var(--blu-d);color:var(--blu);}
.rt-mkt{background:var(--org-d);color:var(--org);}
.rt-org{background:var(--pur-d);color:var(--pur);}
.risk-side{font-size:14px;color:var(--t2);line-height:1.65;}
.risk-side strong{color:var(--t3);font-size:12px;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;}
.timeline{position:relative;margin:28px 0;padding-left:28px;border-left:2px solid var(--bdr);}
.tl-item{position:relative;margin-bottom:28px;padding-bottom:4px;}
.tl-item:last-child{margin-bottom:0;}
.tl-dot{position:absolute;left:-35px;top:4px;width:12px;height:12px;border-radius:50%;border:2px solid var(--acc);background:var(--bg);}
.tl-week{font-size:13px;font-weight:600;color:var(--acc);margin-bottom:4px;}
.tl-desc{font-size:15px;color:var(--t2);line-height:1.65;}
.tl-desc strong{color:var(--t1);}
.tl-gate{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:6px;margin-top:6px;background:var(--red-d);color:var(--red);}
`;

  const PAGES = [
    {
      route: "/solutions/chain-of-action",
      css: `
:root{
  --bg:#0B0F1A;--card:#141926;--elev:#1C2333;
  --t1:#FFF;--t2:#94A3B8;--t3:#64748B;
  --acc:#2EDDB5;--acc-d:rgba(46,221,181,.12);--acc-b:rgba(46,221,181,.25);
  --blu:#3B82F6;--blu-d:rgba(59,130,246,.12);
  --pur:#A78BFA;--pur-d:rgba(167,139,250,.12);--pur-b:rgba(167,139,250,.25);
  --red:#EF4444;--red-d:rgba(239,68,68,.12);
  --org:#F59E0B;--org-d:rgba(245,158,11,.12);
  --grn:#22C55E;--bdr:rgba(255,255,255,.07);
  --f:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  --m:'JetBrains Mono',monospace;
  --mw:1140px;
}
*{margin:0;padding:0;box-sizing:border-box;}
.nav{display:none !important;}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:9px 22px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;border:none;cursor:pointer;font-family:var(--f);transition:all .15s;}
.btn-g{color:var(--t2);background:0;border:1px solid var(--bdr);}
.btn-g:hover{color:#fff;border-color:rgba(255,255,255,.18);}
.btn-a{color:#000;background:var(--acc);}
.btn-a:hover{background:#5EECC8;transform:translateY(-1px);box-shadow:0 4px 20px rgba(46,221,181,.25);}
.btn-o{color:var(--acc);background:0;border:1px solid var(--acc);}
.btn-o:hover{background:var(--acc-d);}
.btn-lg{padding:14px 36px;font-size:16px;border-radius:10px;}
.over{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;}
.hero{padding:80px 48px 120px;text-align:center;position:relative;overflow:hidden;}
.hero::before{content:'';position:absolute;top:-300px;left:50%;transform:translateX(-50%);width:900px;height:900px;background:radial-gradient(circle,rgba(46,221,181,.05) 0%,transparent 65%);pointer-events:none;}
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 18px;border-radius:100px;background:var(--acc-d);border:1px solid var(--acc-b);font-size:13px;font-weight:600;color:var(--acc);margin-bottom:28px;}
.pill::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--acc);}
.hero h1{font-size:clamp(44px,5.5vw,72px);font-weight:700;line-height:1.05;letter-spacing:-.035em;max-width:800px;margin:0 auto 24px;}
.hero-sub{font-size:20px;color:var(--t2);max-width:660px;margin:0 auto 48px;line-height:1.65;}
.hero-sub strong{color:#fff;font-weight:600;}
.hero-ctas{display:flex;justify-content:center;gap:14px;margin-bottom:80px;}
.fstrip{display:flex;align-items:center;justify-content:center;gap:40px;opacity:.5;}
.fstrip span{font-size:14px;font-weight:600;color:var(--t2);}
.cor-zone{height:280vh;position:relative;border-top:1px solid var(--bdr);}
.cor-sticky{position:sticky;top:var(--nav-h,0px);height:calc(100vh - var(--nav-h,0px));display:flex;align-items:center;justify-content:center;overflow:hidden;}
.cor-stage{width:100%;max-width:1200px;padding:0 48px;position:relative;}
.cor-title{text-align:center;margin-bottom:48px;transition:opacity .08s;}
.cor-title h2{font-size:36px;font-weight:700;letter-spacing:-.025em;line-height:1.2;}
.cor-title p{font-size:17px;color:var(--t2);margin-top:10px;max-width:580px;margin-left:auto;margin-right:auto;line-height:1.6;}
.cor-panels{display:flex;justify-content:center;gap:40px;}
.cor-panel{width:440px;background:var(--card);border:1px solid var(--bdr);border-radius:18px;padding:32px;transition:transform .04s linear,opacity .04s linear,border-color .3s;}
.cor-panel .p-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:18px;}
.cor-panel h3{font-size:20px;font-weight:700;margin-bottom:10px;}
.cor-panel .p-desc{font-size:14px;color:var(--t2);line-height:1.6;margin-bottom:18px;}
.p-feats{display:flex;flex-direction:column;gap:8px;}
.p-feat{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;font-size:13px;font-family:var(--m);opacity:0;transform:translateY(8px);transition:opacity .3s,transform .3s;}
.p-feat.vis{opacity:1;transform:translateY(0);}
.p-feat .fi{width:20px;text-align:center;flex-shrink:0;font-size:14px;}
.cor-bad .p-icon{background:var(--red-d);color:var(--red);}
.cor-bad .p-feat{background:var(--red-d);color:var(--red);}
.cor-good .p-icon{background:var(--pur-d);color:var(--pur);}
.cor-good .p-feat{background:var(--pur-d);color:var(--pur);}
.cor-good{border-color:var(--pur);box-shadow:0 0 40px rgba(167,139,250,.06);}
.cor-takeaway{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);width:700px;background:var(--elev);border:1px solid var(--pur-b);border-radius:14px;padding:32px;text-align:center;opacity:0;transition:opacity .08s;pointer-events:none;z-index:5;}
.cor-takeaway p{font-size:17px;color:var(--t2);line-height:1.65;}
.cor-takeaway strong{color:#fff;}
.cor-takeaway em{color:var(--acc);font-style:normal;font-weight:600;}
.merge-zone{height:340vh;position:relative;border-top:1px solid var(--bdr);}
.merge-sticky{position:sticky;top:var(--nav-h,0px);height:calc(100vh - var(--nav-h,0px));display:flex;align-items:center;justify-content:center;overflow:hidden;}
.merge-stage{width:100%;max-width:1200px;padding:0 48px;position:relative;}
.merge-title{text-align:center;margin-bottom:48px;transition:opacity .08s;}
.merge-title h2{font-size:34px;font-weight:700;letter-spacing:-.02em;line-height:1.2;}
.merge-title p{font-size:17px;color:var(--t2);margin-top:10px;}
.merge-panels{display:flex;justify-content:center;gap:40px;position:relative;}
.merge-panel{width:440px;background:var(--card);border:1px solid var(--bdr);border-radius:18px;padding:32px;transition:transform .04s linear,opacity .04s linear,border-color .4s,box-shadow .4s;position:relative;z-index:1;overflow:hidden;}
.merge-panel .p-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:18px;}
.merge-panel h3{font-size:20px;font-weight:700;margin-bottom:10px;}
.merge-panel .p-desc{font-size:14px;color:var(--t2);line-height:1.6;margin-bottom:18px;}
.ml-bad .p-icon{background:var(--red-d);color:var(--red);}
.ml-bad .p-feat{background:var(--red-d);color:var(--red);}
.ml-good .p-icon{background:var(--blu-d);color:var(--blu);transition:all .3s;}
.ml-good .p-feat{background:var(--blu-d);color:var(--blu);}
.ml-good h3{transition:all .3s;}.ml-good .p-desc{transition:all .3s;}
.merge-panel.revealed{border-color:rgba(59,130,246,.5) !important;box-shadow:0 0 50px rgba(59,130,246,.12) !important;}
.merge-panel.revealed .p-icon{background:var(--blu-d);color:var(--blu);transform:scale(1.05);}
.prefect-takeover{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--card);border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;opacity:0;pointer-events:none;transition:opacity .35s ease;z-index:10;}
.prefect-takeover.shown{opacity:1;pointer-events:auto;}
.prefect-takeover .aka{font-size:16px;color:var(--t3);font-weight:600;margin-bottom:8px;letter-spacing:.02em;}
.prefect-takeover .pw-name{font-size:42px;font-weight:700;color:var(--blu);letter-spacing:-.03em;line-height:1.1;margin-bottom:16px;}
.prefect-takeover .pw-sub{font-size:17px;color:var(--t2);line-height:1.6;max-width:320px;}
.merge-result{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(.9);width:680px;background:var(--card);border:2px solid var(--acc);border-radius:22px;padding:48px;text-align:center;opacity:0;pointer-events:none;z-index:5;box-shadow:0 0 60px rgba(46,221,181,.12),0 0 120px rgba(46,221,181,.06);transition:opacity .04s linear,transform .04s linear;}
.merge-result .coa-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 18px;border-radius:100px;background:var(--acc-d);border:1px solid var(--acc-b);font-size:13px;font-weight:600;color:var(--acc);margin-bottom:20px;}
.merge-result h2{font-size:36px;font-weight:700;letter-spacing:-.025em;margin-bottom:28px;line-height:1.15;}
.merge-result h2 span{color:var(--acc);}
#mrBadge{opacity:0;transform:translateY(16px);}
#mrTitle{opacity:0;transform:translateY(20px);}
#mrGrid .coa-item{opacity:0;transform:translateY(10px);}
.coa-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:left;}
.coa-item{background:var(--elev);border-radius:10px;padding:14px 16px;font-size:15px;color:var(--t2);line-height:1.5;display:flex;align-items:flex-start;gap:10px;}
.coa-item::before{content:'\u2713';color:var(--acc);font-weight:700;flex-shrink:0;}
.bridge-zone{height:250vh;position:relative;border-top:1px solid var(--bdr);}
.bridge-sticky{position:sticky;top:var(--nav-h,0px);height:calc(100vh - var(--nav-h,0px));display:flex;align-items:center;justify-content:center;}
.bridge-stage{text-align:center;max-width:900px;padding:0 48px;}
.bridge-intro{font-size:17px;color:var(--t2);line-height:1.7;max-width:620px;margin:0 auto 40px;opacity:0;transition:none;}
.bridge-label{font-size:15px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin-bottom:20px;opacity:0;transition:none;}
.bridge-name{font-size:52px;font-weight:700;letter-spacing:-.035em;margin-bottom:36px;opacity:0;transition:none;}
.bridge-pills{display:flex;justify-content:center;align-items:center;gap:48px;margin-bottom:40px;opacity:0;transition:none;}
.bridge-pill{padding:14px 28px;border-radius:14px;font-size:18px;font-weight:700;letter-spacing:-.01em;}
.bridge-pill.cot{background:var(--pur-d);border:1px solid var(--pur-b);color:var(--pur);}
.bridge-pill.coa{background:var(--acc-d);border:1px solid var(--acc-b);color:var(--acc);}
.bridge-plus{font-size:28px;color:var(--t3);font-weight:300;}
.bridge-headline{font-size:36px;font-weight:700;letter-spacing:-.025em;line-height:1.2;margin-bottom:16px;opacity:0;transition:none;}
.bridge-sub{font-size:18px;color:var(--t2);line-height:1.65;max-width:640px;margin:0 auto;opacity:0;transition:none;}
.steps-zone{border-top:1px solid var(--bdr);}
.steps-header{position:sticky;top:var(--nav-h,0px);z-index:10;background:var(--bg);border-bottom:1px solid var(--bdr);padding:48px 48px 40px;text-align:center;background:linear-gradient(180deg,var(--bg) 0%,rgba(11,15,26,.97) 100%);backdrop-filter:blur(10px);}
.steps-header h2{font-size:42px;font-weight:700;letter-spacing:-.03em;margin-bottom:10px;}
.steps-header p{font-size:18px;color:var(--t2);max-width:520px;margin:0 auto;}
.steps-content{max-width:var(--mw);margin:0 auto;}
.step-card{padding:80px 48px;border-bottom:1px solid var(--bdr);}
.step-card:last-child{border-bottom:none;}
.step-num{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:var(--acc-d);border:1px solid var(--acc-b);color:var(--acc);font-size:18px;font-weight:700;margin-bottom:16px;}
.sec{padding:110px 48px;border-top:1px solid var(--bdr);}
.sec-h{text-align:center;max-width:700px;margin:0 auto 64px;}
.sec-h h2{font-size:38px;font-weight:700;letter-spacing:-.025em;margin-bottom:16px;line-height:1.15;}
.sec-h p{font-size:18px;color:var(--t2);line-height:1.65;}
.fsplit{display:grid;grid-template-columns:1fr 1fr;gap:72px;max-width:var(--mw);margin:0 auto;align-items:center;}
.fsplit.rev{direction:rtl;}.fsplit.rev>*{direction:ltr;}
.ft h2{font-size:30px;font-weight:700;letter-spacing:-.02em;margin-bottom:14px;line-height:1.25;}
.ft p{font-size:16px;color:var(--t2);line-height:1.7;margin-bottom:20px;}
.cl{list-style:none;display:flex;flex-direction:column;gap:10px;}
.cl li{font-size:15px;color:var(--t2);display:flex;align-items:flex-start;gap:10px;}
.cl li::before{content:'\u2713';color:var(--acc);font-weight:700;flex-shrink:0;}
.cc{background:var(--card);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;}
.ct{padding:12px 20px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:8px;}
.d{width:10px;height:10px;border-radius:50%;}.dr{background:#FF5F57;}.dy{background:#FEBC2E;}.dg{background:#28C840;}
.ct span{font-family:var(--m);font-size:12px;color:var(--t3);margin-left:8px;}
.cb{padding:24px;font-family:var(--m);font-size:13px;line-height:1.85;color:#C9D1D9;overflow-x:auto;}
.kw{color:#FF7B72;}.fn{color:#D2A8FF;}.str{color:#A5D6FF;}.cmt{color:#545D68;font-style:italic;}.num{color:#79C0FF;}.dec{color:#FFA657;}.typ{color:#7EE787;}
.mock{background:var(--card);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;}
.mmb{padding:14px 20px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:10px;}
.mmd{width:8px;height:8px;border-radius:50%;background:var(--acc);}
.mmt{font-size:13px;font-weight:600;color:var(--t3);}
.mmi{padding:24px;}
.msg{display:flex;gap:12px;margin-bottom:18px;}.msg:last-child{margin-bottom:0;}
.av{width:30px;height:30px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;}
.av-u{background:var(--blu-d);color:var(--blu);}.av-a{background:var(--acc-d);color:var(--acc);}
.bub{background:var(--elev);border-radius:12px;padding:14px 18px;font-size:14px;line-height:1.65;color:#D1D5DB;max-width:460px;}
.bub strong{color:#fff;}
.tt{display:inline-flex;align-items:center;gap:5px;background:var(--acc-d);color:var(--acc);padding:3px 10px;border-radius:6px;font-family:var(--m);font-size:11.5px;font-weight:500;margin:6px 0;}
.rb{background:rgba(0,0,0,.35);border:1px solid var(--bdr);border-radius:8px;padding:12px;margin-top:10px;font-family:var(--m);font-size:12px;line-height:1.75;}
.st{display:inline-flex;align-items:center;gap:5px;color:var(--grn);font-weight:600;font-size:12px;}.st::before{content:'\u25CF';font-size:7px;}
.mgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:var(--mw);margin:0 auto;}
.mcard{background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:28px;position:relative;display:flex;flex-direction:column;}
.mcard.hl{border-color:var(--acc);}
.mcard.hl::after{content:'Recommended';position:absolute;top:-9px;right:20px;background:var(--acc);color:#000;font-size:11px;font-weight:700;padding:2px 10px;border-radius:4px;}
.mtag{display:inline-block;font-family:var(--m);font-size:12px;padding:4px 10px;border-radius:6px;margin-bottom:16px;}
.mt1{background:var(--blu-d);color:var(--blu);}.mt2{background:var(--acc-d);color:var(--acc);}.mt3{background:var(--org-d);color:var(--org);}
.mcard h3{font-size:20px;font-weight:700;margin-bottom:8px;}
.mcard .desc{font-size:14px;color:var(--t2);line-height:1.6;margin-bottom:18px;min-height:64px;}
.mml{list-style:none;display:flex;flex-direction:column;gap:7px;}
.mml li{font-size:13px;color:var(--t2);display:flex;align-items:center;gap:8px;}
.mml li::before{content:'\u2713';color:var(--acc);font-weight:700;}
.mml li.off::before{content:'\u2715';color:#374151;}.mml li.off{color:#374151;}
.self-managed{border-radius:14px;overflow:hidden;}
.self-managed summary{display:flex;align-items:center;gap:8px;padding:14px 20px;background:var(--card);border:1px solid rgba(255,255,255,.12);border-radius:14px;font-size:14px;font-weight:600;color:var(--t2);cursor:pointer;list-style:none;transition:color .15s,border-color .15s;}
.self-managed summary:hover{color:var(--t1);border-color:rgba(255,255,255,.2);}
.self-managed summary::-webkit-details-marker{display:none;}
.self-managed summary::before{content:'\u203A';font-size:18px;font-weight:400;transition:transform .2s;display:inline-block;width:16px;text-align:center;}
.self-managed[open] summary::before{transform:rotate(90deg);}
.self-managed[open] summary{border-radius:14px 14px 0 0;border-bottom-color:transparent;}
.cta-sec{padding:110px 48px;text-align:center;border-top:1px solid var(--bdr);}
.cta-sec h2{font-size:38px;font-weight:700;letter-spacing:-.025em;margin-bottom:14px;}
.cta-sec p{font-size:18px;color:var(--t2);margin-bottom:40px;max-width:550px;margin-left:auto;margin-right:auto;line-height:1.6;}
/* Blog section */
.blog-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:var(--mw);margin:0 auto;}
.blog-card{background:var(--card);border:1px solid var(--bdr);border-radius:16px;padding:28px;display:flex;flex-direction:column;text-decoration:none;transition:border-color .2s,transform .2s,box-shadow .2s;}
.blog-card:hover{border-color:rgba(255,255,255,.14);transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.25);}
.blog-card-tags{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;}
.blog-card-tag{font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px;background:var(--elev);color:var(--t3);}
.blog-card-tag.t-acc{background:var(--acc-d);color:var(--acc);}
.blog-card-title{font-size:18px;font-weight:700;line-height:1.3;letter-spacing:-.015em;color:var(--t1);margin-bottom:10px;}
.blog-card-desc{font-size:14px;color:var(--t2);line-height:1.65;flex:1;margin-bottom:20px;}
.blog-card-foot{display:flex;align-items:center;justify-content:space-between;margin-top:auto;}
.blog-card-av{width:28px;height:28px;border-radius:7px;background:var(--blu-d);color:var(--blu);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}
.blog-card-byline{display:flex;align-items:center;gap:9px;}
.blog-card-meta{font-size:12px;color:var(--t3);line-height:1.4;}
.blog-card-meta strong{color:var(--t2);font-weight:600;display:block;}
.blog-read{font-size:12px;font-weight:600;color:var(--acc);white-space:nowrap;transition:gap .15s;}
.blog-card:hover .blog-read{text-decoration:underline;}
@media(max-width:900px){
  .fsplit{grid-template-columns:1fr;gap:40px;}.fsplit.rev{direction:ltr;}
  .mgrid{grid-template-columns:1fr;}
  .blog-grid{grid-template-columns:1fr;}
  .hero{padding:60px 24px 80px;}.sec{padding:80px 24px;}
  .cor-panels,.merge-panels{flex-direction:column;align-items:center;gap:24px;}
  .cor-panel,.merge-panel{width:100%;max-width:420px;}
  .merge-result{width:90%;max-width:540px;}
  .cor-takeaway{width:90%;max-width:500px;}
  .bridge-pills{flex-direction:column;gap:16px;}
  .steps-header{position:relative;top:0;}
}`,
      body: `
<nav class="nav">
  <img src="https://www.prefect.io/wordmark.png" alt="Prefect" class="nav-wm"/>
  <div class="nav-lk"><a href="#">Products</a><a href="#">Solutions</a><a href="#">Pricing</a><a href="#blog">Blog</a><a href="#">Docs</a></div>
  <div class="nav-r"><a href="#" class="btn btn-g">Sign In</a><a href="#" class="btn btn-a">Get Started</a></div>
</nav>
<section class="hero">
  <div class="pill">Prefect Cloud + Horizon</div>
  <h1>The agent isn't<br/>the hard&nbsp;part.</h1>
  <p class="hero-sub">Your agent reasons perfectly, picks the right tool, calls it with the right parameters &mdash; and then the tool fails. The API rate-limits. The database times out. <strong>Prefect makes tool execution durable.</strong> Any agent framework. Any model. Just Python.</p>
  <div class="hero-ctas">
    <a href="https://horizon.prefect.io/chain-of-action/servers" class="btn btn-a btn-lg">Deploy on Horizon</a>
    <a href="https://github.com/strawgate/prefect-horizon-story#readme" class="btn btn-o btn-lg">Read the Docs</a>
  </div>
  <div class="fstrip"><span>Works with:</span><span>Pydantic AI</span><span>&middot;</span><span>LangChain</span><span>&middot;</span><span>CrewAI</span><span>&middot;</span><span>Claude Code</span><span>&middot;</span><span>Cursor</span><span>&middot;</span><span>Any MCP Client</span></div>
</section>
<section class="cor-zone" id="corZone">
  <div class="cor-sticky"><div class="cor-stage">
    <div class="cor-title" id="corTitle">
      <div class="over" style="color:var(--pur)">A pattern you already know</div>
      <h2>Chain of Thought made agents smart</h2>
      <p>Breaking complex thinking into observable steps transformed AI from a party trick into a production tool.</p>
    </div>
    <div class="cor-panels" id="corPanels">
      <div class="cor-panel cor-bad" id="corBad">
        <div class="p-icon">&#x1F4AD;</div>
        <h3>Before: single-shot reasoning</h3>
        <p class="p-desc">The model jumps straight to an answer. No visibility. No self-correction.</p>
        <div class="p-feats">
          <div class="p-feat" data-cor="0"><span class="fi">&#10007;</span>No visibility into the thinking process</div>
          <div class="p-feat" data-cor="1"><span class="fi">&#10007;</span>Errors compound with no way to self-correct</div>
          <div class="p-feat" data-cor="2"><span class="fi">&#10007;</span>Complex problems produce unreliable answers</div>
          <div class="p-feat" data-cor="3"><span class="fi">&#10007;</span>Can't debug, audit, or improve the process</div>
        </div>
      </div>
      <div class="cor-panel cor-good" id="corGood">
        <div class="p-icon">&#x1F9E0;</div>
        <h3>After: Chain of Thought</h3>
        <p class="p-desc">Each reasoning step is explicit. The model checks its own work. You see where things go right or wrong.</p>
        <div class="p-feats">
          <div class="p-feat" data-cor="4"><span class="fi">&#10003;</span>Each step is visible and traceable</div>
          <div class="p-feat" data-cor="5"><span class="fi">&#10003;</span>Self-correction catches mistakes mid-chain</div>
          <div class="p-feat" data-cor="6"><span class="fi">&#10003;</span>Complex problems decompose into steps</div>
          <div class="p-feat" data-cor="7"><span class="fi">&#10003;</span>Debuggable, auditable, improvable</div>
        </div>
      </div>
    </div>
    <div class="cor-takeaway" id="corTakeaway">
      <p><strong>Chain of Thought solved the thinking problem.</strong> But when the agent stops thinking and starts <em>doing</em> &mdash; calling APIs, running queries, executing pipelines &mdash; it's back to single-shot, all-or-nothing execution.</p>
    </div>
  </div></div>
</section>
<section class="merge-zone" id="mergeZone">
  <div class="merge-sticky"><div class="merge-stage">
    <div class="merge-title" id="mergeTitle">
      <div class="over" style="color:var(--t3)">Now apply the same pattern to execution</div>
      <h2>Single-shot tool calls make agents&nbsp;unreliable</h2>
      <p>Sound familiar? The same problems that plagued reasoning before Chain of Thought.</p>
    </div>
    <div class="merge-panels" id="mergePanels">
      <div class="merge-panel ml-bad" id="mPanelL">
        <div class="p-icon">&#9889;</div>
        <h3>Single-Shot Tool Calls</h3>
        <p class="p-desc">Every agent framework today. One call. All or nothing.</p>
        <div class="p-feats">
          <div class="p-feat" data-merge="0"><span class="fi">&#10007;</span>All-or-nothing execution</div>
          <div class="p-feat" data-merge="1"><span class="fi">&#10007;</span>No partial recovery on failure</div>
          <div class="p-feat" data-merge="2"><span class="fi">&#10007;</span>Identical calls re-execute fully</div>
          <div class="p-feat" data-merge="3"><span class="fi">&#10007;</span>No observability into what happened</div>
          <div class="p-feat" data-merge="4"><span class="fi">&#10007;</span>Long operations timeout</div>
        </div>
      </div>
      <div class="merge-panel ml-good" id="mPanelR">
        <div class="prefect-takeover" id="prefectTakeover">
          <div class="aka">A.K.A.</div>
          <div class="pw-name">Prefect<br/>Workflows</div>
          <div class="pw-sub">You already have all of this. Today.</div>
        </div>
        <div class="p-icon" id="rIcon">&#x1F527;</div>
        <h3 id="rTitle">What Reliable Tools Need</h3>
        <p class="p-desc" id="rDesc">The execution properties that would make tool calls production-grade.</p>
        <div class="p-feats">
          <div class="p-feat" data-merge="5"><span class="fi">&#10003;</span>Step-level retries with backoff</div>
          <div class="p-feat" data-merge="6"><span class="fi">&#10003;</span>Result caching across runs</div>
          <div class="p-feat" data-merge="7"><span class="fi">&#10003;</span>Exactly-once execution</div>
          <div class="p-feat" data-merge="8"><span class="fi">&#10003;</span>Full observability dashboard</div>
          <div class="p-feat" data-merge="9"><span class="fi">&#10003;</span>Infrastructure-aware execution</div>
        </div>
      </div>
    </div>
    <div class="merge-result" id="mergeResult">
      <div class="coa-badge" id="mrBadge">Introducing</div>
      <h2 id="mrTitle">Tools Your Agents Will <span>Actually Trust</span></h2>
      <div class="coa-grid" id="mrGrid">
        <div class="coa-item">Every tool call backed by a Prefect flow</div>
        <div class="coa-item">Each step retries and caches independently</div>
        <div class="coa-item">Full task graph visible in Prefect Cloud</div>
        <div class="coa-item">Any agent framework, any model</div>
        <div class="coa-item">Background tasks for long operations</div>
        <div class="coa-item">Tag a deployment &mdash; it becomes a tool</div>
      </div>
    </div>
  </div></div>
</section>
<section class="bridge-zone" id="bridgeZone">
  <div class="bridge-sticky"><div class="bridge-stage">
    <p class="bridge-intro" id="brIntro">Chain of Thought transformed reasoning by decomposing it into observable, self-correcting steps. We're applying the same pattern to execution.</p>
    <p class="bridge-label" id="brLabel">We call this</p>
    <h2 class="bridge-name" id="brName"><span style="color:var(--acc)">Chain of Action</span></h2>
    <div class="bridge-pills" id="brPills">
      <div class="bridge-pill cot">Chain of Thought</div>
      <div class="bridge-plus">+</div>
      <div class="bridge-pill coa">Chain of Action</div>
    </div>
    <h2 class="bridge-headline" id="brHeadline"><span style="color:var(--pur)">Chain of Thought</span> makes agents intelligent.<br/><span style="color:var(--acc)">Chain of Action</span> makes them reliable.</h2>
    <p class="bridge-sub" id="brSub">One decomposes reasoning into observable steps. The other decomposes execution into durable steps. Together, your agents can think clearly <em>and</em> act reliably.</p>
  </div></div>
</section>
<section class="steps-zone" id="stepsZone">
  <div class="steps-header">
    <div class="over" style="color:var(--acc)">See how it works</div>
    <h2>Three steps. Zero code&nbsp;changes.</h2>
    <p>Your Prefect workflows become AI Tools.</p>
  </div>
  <div class="steps-content">
    <div class="step-card"><div class="fsplit">
      <div class="ft">
        <div class="step-num">1</div>
        <h2>Tag a deployment.<br/>It becomes a&nbsp;tool.</h2>
        <p>Every Prefect deployment already has a typed parameter schema. The adapter reads it from the API and generates an MCP tool with matching inputs.</p>
        <ul class="cl"><li>Python type hints become MCP tool parameters</li><li>Flow docstrings become tool descriptions</li><li>Default values carry over automatically</li><li>Pydantic models supported as parameters</li></ul>
      </div>
      <div class="cc">
        <div class="ct"><div class="d dr"></div><div class="d dy"></div><div class="d dg"></div><span>your existing flow &mdash; unchanged</span></div>
        <div class="cb">
<span class="dec">@flow</span>(name=<span class="str">"quarterly-report"</span>, log_prints=<span class="num">True</span>)<br/>
<span class="kw">def</span> <span class="fn">quarterly_report</span>(<br/>
&nbsp;&nbsp;&nbsp;&nbsp;quarter: <span class="typ">str</span>,<br/>
&nbsp;&nbsp;&nbsp;&nbsp;year: <span class="typ">int</span> = <span class="num">2025</span>,<br/>
&nbsp;&nbsp;&nbsp;&nbsp;include_forecast: <span class="typ">bool</span> = <span class="num">False</span>,<br/>
) -> <span class="typ">dict</span>:<br/>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="str">"""Generate quarterly sales report."""</span><br/>
&nbsp;&nbsp;&nbsp;&nbsp;data = fetch_sales_data(quarter)<br/>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="kw">return</span> build_report(data)<br/><br/>
<span class="cmt"># Add one tag. That's it.</span><br/>
quarterly_report.deploy(<br/>
&nbsp;&nbsp;&nbsp;&nbsp;name=<span class="str">"production"</span>,<br/>
&nbsp;&nbsp;&nbsp;&nbsp;work_pool_name=<span class="str">"default"</span>,<br/>
&nbsp;&nbsp;&nbsp;&nbsp;tags=[<span class="str">"mcp-tool"</span>, <span class="str">"mcp-artifacts"</span>],<br/>
)
        </div>
      </div>
    </div></div>
    <div class="step-card"><div class="fsplit rev">
      <div class="ft">
        <div class="step-num">2</div>
        <h2>Enable the bridge.<br/>Tools appear.</h2>
        <p>Deploy the adapter via Horizon Deploy. Your tagged deployments appear in Horizon Registry and become tools instantly. Access control goes through Horizon Gateway.</p>
        <p style="font-size:14px;color:var(--t3);margin-top:4px;">New deployments picked up automatically.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="cc" style="border-color:var(--acc-b);">
          <div class="ct" style="border-bottom-color:var(--acc-b);">
            <div class="d dg"></div>
            <span style="color:var(--acc);font-weight:600;">Horizon Cloud</span>
            <span style="margin-left:auto;background:var(--acc);color:#000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">RECOMMENDED</span>
          </div>
          <div class="cb">
<span class="cmt"># In Horizon &rarr; Deploy &rarr; New Server</span><br/>
<span class="cmt"># Select "Prefect Cloud Bridge"</span><br/><br/>
<span style="color:var(--acc)">&#10003; Server deployed for workspace "production"</span><br/>
<span style="color:var(--acc)">&#10003; 12 tools discovered from tagged deployments</span><br/>
<span style="color:var(--acc)">&#10003; MCP endpoint ready at:</span><br/>
<span style="color:var(--t1)">&nbsp;&nbsp;https://your-org.horizon.prefect.io/bridge/mcp</span><br/><br/>
<span class="cmt"># Add to Claude Desktop:</span><br/>
claude mcp add prefect-workflows <br/>
&nbsp;&nbsp;--transport http <br/>
&nbsp;&nbsp;<span class="str">"https://your-org.horizon.prefect.io/bridge/mcp"</span>
          </div>
        </div>
        <details class="self-managed">
          <summary>Running FastMCP yourself?</summary>
          <div class="cc" style="border-radius:0 0 14px 14px;">
            <div class="ct"><div class="d dr"></div><div class="d dy"></div><div class="d dg"></div><span>Self-managed</span></div>
            <div class="cb">
<span class="cmt"># Install</span><br/>pip install prefect-mcp-adapter<br/><br/>
<span class="kw">export</span> PREFECT_API_URL=<span class="str">"https://api.prefect.cloud/..."</span><br/>
<span class="kw">export</span> PREFECT_API_KEY=<span class="str">"pnu_..."</span><br/><br/>
fastmcp run prefect_mcp_adapter<br/>
<span style="color:var(--acc)">&#10003; Registered 12 tools from Prefect Cloud</span>
            </div>
          </div>
        </details>
      </div>
    </div></div>
    <div class="step-card"><div class="fsplit">
      <div class="ft">
        <div class="step-num">3</div>
        <h2>Ask your agent.<br/>Prefect does the&nbsp;rest.</h2>
        <p>The agent calls the tool. The adapter triggers your Prefect deployment and returns structured results including any artifacts your flow creates.</p>
        <p>Every call is visible in Prefect Cloud with the full task graph, timing, and logs. Using PydanticAI? <code>PrefectAgent</code> makes the agent durable while Chain of Action makes the tools durable — durability on both sides.</p>
      </div>
      <div class="mock">
        <div class="mmb"><div class="mmd"></div><div class="mmt">Claude Desktop</div></div>
        <div class="mmi">
          <div class="msg"><div class="av av-u">B</div><div class="bub">Run the quarterly sales report for Q4 2025</div></div>
          <div class="msg"><div class="av av-a">C</div><div class="bub">
            <div class="tt">&#9654; quarterly_report(quarter="Q4", year=2025)</div>
            <div class="rb">
              <div class="st">COMPLETED</div> &nbsp;&middot; 12.3s &middot; 3 tasks<br/><br/>
              <strong style="color:#fff">Artifacts:</strong><br/>
              &#128202; <span style="color:var(--acc)">sales-by-region</span>: NA $847k &middot; EU $312k &middot; APAC $198k<br/>
              &#128221; <span style="color:var(--acc)">summary</span>: Revenue up 18% QoQ<br/><br/>
              <span style="color:var(--t3)">&rarr; app.prefect.cloud/flow-runs/a8f2...</span>
            </div><br/>
            Q4 revenue was <strong>$1.36M</strong>, up 18% over Q3. Full breakdown in <span style="color:var(--acc)">Prefect Cloud</span>.
          </div></div>
        </div>
      </div>
    </div></div>
  </div>
</section>
<section class="sec">
  <div class="sec-h"><h2>You control what agents see</h2><p>Response detail is controlled by tags. No YAML. No config files. Each level is an explicit opt-in.</p></div>
  <div class="mgrid">
    <div class="mcard"><div class="mtag mt1">mcp-tool</div><h3>Metadata</h3><p class="desc">State, duration, task breakdown, Prefect Cloud link.</p><ul class="mml"><li>Completion state &amp; duration</li><li>Task names and states</li><li>Prefect Cloud link</li><li>Error messages</li><li class="off">Table artifacts</li><li class="off">Markdown artifacts</li><li class="off">Link artifacts</li><li class="off">INFO+ log entries</li><li class="off">Full execution narrative</li></ul></div>
    <div class="mcard hl"><div class="mtag mt2">+ mcp-artifacts</div><h3>Artifacts</h3><p class="desc">Tables, markdown, and links. Structured data agents reason over.</p><ul class="mml"><li>Completion state &amp; duration</li><li>Task names and states</li><li>Prefect Cloud link</li><li>Error messages</li><li>Table artifacts</li><li>Markdown artifacts</li><li>Link artifacts</li><li class="off">INFO+ log entries</li><li class="off">Full execution narrative</li></ul></div>
    <div class="mcard"><div class="mtag mt3">+ mcp-logs</div><h3>Full Access</h3><p class="desc">INFO+ log entries. Use with caution.</p><ul class="mml"><li>Completion state &amp; duration</li><li>Task names and states</li><li>Prefect Cloud link</li><li>Error messages</li><li>Table artifacts</li><li>Markdown artifacts</li><li>Link artifacts</li><li>INFO+ log entries</li><li>Full execution narrative</li></ul></div>
  </div>
</section>
<section class="sec" id="blog">
  <div class="sec-h"><h2>From the blog</h2><p>The thinking behind Chain of Action — the execution problem, why Prefect is uniquely positioned, and a concrete plan to build it.</p></div>
  <div class="blog-grid">
    <a href="/blog/agent-isnt-hard-part" class="blog-card">
      <div class="blog-card-tags">
        <span class="blog-card-tag t-acc">AI</span>
        <span class="blog-card-tag">MCP</span>
        <span class="blog-card-tag">Product</span>
      </div>
      <div class="blog-card-title">The Agent Isn't the Hard&nbsp;Part</div>
      <div class="blog-card-desc">PydanticAI makes the agent durable. But when the tool itself fails mid-execution, the agent still retries from scratch. Chain of Action makes the tool durable — step-level recovery, not call-level.</div>
      <div class="blog-card-foot">
        <div class="blog-card-byline">
          <div class="blog-card-av">BE</div>
          <div class="blog-card-meta"><strong>Bill Easton</strong>March 2026</div>
        </div>
        <span class="blog-read">Read →</span>
      </div>
    </a>
    <a href="/blog/prefect-owns-execution-layer" class="blog-card">
      <div class="blog-card-tags">
        <span class="blog-card-tag t-acc">AI</span>
        <span class="blog-card-tag">Strategy</span>
        <span class="blog-card-tag">MCP</span>
      </div>
      <div class="blog-card-title">Why Prefect Already Owns the Agent Execution&nbsp;Layer</div>
      <div class="blog-card-desc">Typed schemas, FastMCP, artifacts, PydanticAI integration, a read-only MCP server — Prefect already has every piece. Plus: why Temporal's PydanticAI support isn't enough without the MCP ecosystem.</div>
      <div class="blog-card-foot">
        <div class="blog-card-byline">
          <div class="blog-card-av">BE</div>
          <div class="blog-card-meta"><strong>Bill Easton</strong>March 2026</div>
        </div>
        <span class="blog-read">Read →</span>
      </div>
    </a>
    <a href="/blog/chain-of-action-first-90-days" class="blog-card">
      <div class="blog-card-tags">
        <span class="blog-card-tag t-acc">AI</span>
        <span class="blog-card-tag">Engineering</span>
        <span class="blog-card-tag">MCP</span>
      </div>
      <div class="blog-card-title">Building Chain of Action: The First 90&nbsp;Days</div>
      <div class="blog-card-desc">FastMCP 3.0's Provider architecture, the Tool subclass approach that bypassed add_tool(), Docket-powered background tasks, and an honest risk register — including competing with Prefect's own roadmap.</div>
      <div class="blog-card-foot">
        <div class="blog-card-byline">
          <div class="blog-card-av">BE</div>
          <div class="blog-card-meta"><strong>Bill Easton</strong>March 2026</div>
        </div>
        <span class="blog-read">Read →</span>
      </div>
    </a>
  </div>
</section>
<section class="cta-sec">
  <h2>Your workflows are already production-grade.<br/>Now your agent tools can be&nbsp;too.</h2>
  <p>Open source. Write Python. Ship Python.</p>
  <div style="display:flex;justify-content:center;gap:14px;">
    <a href="https://horizon.prefect.io/chain-of-action/servers" class="btn btn-a btn-lg">Deploy on Horizon</a>
    <a href="https://github.com/strawgate/prefect-horizon-story" class="btn btn-o btn-lg">View on GitHub</a>
  </div>
</section>`,
      // Scroll-animation script from the HTML — executed with a shadow DOM proxy
      script: (document, window) => {
        (() => {
          function clamp(v, a, b) {
            return Math.min(Math.max(v, a), b);
          }
          function e3(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
          }
          function scrollP(zone) {
            var r = zone.getBoundingClientRect();
            return clamp(-r.top / (zone.offsetHeight - window.innerHeight), 0, 1);
          }
          var corZone = document.getElementById("corZone");
          var corFeats = [].slice.call(document.querySelectorAll("[data-cor]"));
          var corMax = Math.max.apply(
            null,
            corFeats.map((f) => +f.dataset.cor),
          );
          function tickCor() {
            var p = scrollP(corZone);
            corFeats.forEach((f) => {
              if (clamp(p / 0.6, 0, 1) > (+f.dataset.cor / (corMax + 1)) * 0.85)
                f.classList.add("vis");
              else f.classList.remove("vis");
            });
            var fadeP = clamp((p - 0.7) / 0.2, 0, 1);
            document.getElementById("corBad").style.opacity = 1 - fadeP * 0.4;
            document.getElementById("corGood").style.opacity = 1 - fadeP * 0.4;
            document.getElementById("corTakeaway").style.opacity = clamp((p - 0.75) / 0.15, 0, 1);
            document.getElementById("corTitle").style.opacity =
              1 - clamp((p - 0.85) / 0.1, 0, 1) * 0.5;
          }
          var mergeZone = document.getElementById("mergeZone");
          var mPanelL = document.getElementById("mPanelL");
          var mPanelR = document.getElementById("mPanelR");
          var mergeResult = document.getElementById("mergeResult");
          var mergeTitle = document.getElementById("mergeTitle");
          var mrBadge = document.getElementById("mrBadge");
          var mrTitle = document.getElementById("mrTitle");
          var mrItems = [].slice.call(document.querySelectorAll("#mrGrid .coa-item"));
          var mergeFeats = [].slice.call(document.querySelectorAll("[data-merge]"));
          var mergeMax = Math.max.apply(
            null,
            mergeFeats.map((f) => +f.dataset.merge),
          );
          var revealed = false;
          function tickMerge() {
            var p = scrollP(mergeZone);
            var revP = clamp(p / 0.28, 0, 1);
            mergeFeats.forEach((f) => {
              if (revP > (+f.dataset.merge / (mergeMax + 1)) * 0.85) f.classList.add("vis");
              else f.classList.remove("vis");
            });
            if (p > 0.3 && !revealed) {
              revealed = true;
              mPanelR.classList.add("revealed");
              document.getElementById("prefectTakeover").classList.add("shown");
            } else if (p <= 0.3 && revealed) {
              revealed = false;
              mPanelR.classList.remove("revealed");
              document.getElementById("prefectTakeover").classList.remove("shown");
            }
            var sP = clamp((p - 0.4) / 0.28, 0, 1);
            var ease = sP < 0.5 ? 4 * sP * sP * sP : 1 - (-2 * sP + 2) ** 3 / 2;
            mPanelL.style.transform = `translateX(${ease * 200}px) scale(${1 - ease * 0.08})`;
            mPanelR.style.transform = `translateX(${-ease * 200}px) scale(${1 - ease * 0.08})`;
            var panelOp = 1 - clamp((p - 0.56) / 0.12, 0, 1);
            mPanelL.style.opacity = panelOp;
            mPanelR.style.opacity = panelOp;
            var rP = clamp((p - 0.72) / 0.16, 0, 1);
            var rE = 1 - (1 - rP) ** 3;
            mergeResult.style.opacity = rE;
            mergeResult.style.pointerEvents = rP > 0.5 ? "auto" : "none";
            mergeResult.style.transform = `translate(-50%,-50%) scale(${0.9 + rE * 0.1})`;
            mergeTitle.style.opacity = 1 - clamp((p - 0.64) / 0.12, 0, 1);
            // Stagger badge → title → bullets (one at a time, delayed after title)
            var bE = e3(clamp((rP - 0.0) / 0.45, 0, 1));
            var tE = e3(clamp((rP - 0.3) / 0.45, 0, 1));
            mrBadge.style.opacity = bE;
            mrBadge.style.transform = "translateY(" + (1 - bE) * 16 + "px)";
            mrTitle.style.opacity = tE;
            mrTitle.style.transform = "translateY(" + (1 - tE) * 20 + "px)";
            // Bullets start after title is done (p > 0.87), one at a time
            var bltP = clamp((p - 0.87) / 0.12, 0, 1);
            mrItems.forEach((item, i) => {
              var iE = e3(clamp((bltP - i / 7) / (2 / 7), 0, 1));
              item.style.opacity = iE;
              item.style.transform = "translateY(" + (1 - iE) * 10 + "px)";
            });
          }
          var bridgeZone = document.getElementById("bridgeZone");
          var brEls = ["brIntro", "brLabel", "brName", "brPills", "brHeadline", "brSub"].map((id) =>
            document.getElementById(id),
          );
          var brTimings = [
            [0.0, 0.15],
            [0.15, 0.25],
            [0.22, 0.38],
            [0.42, 0.58],
            [0.58, 0.72],
            [0.72, 0.85],
          ];
          function tickBridge() {
            var p = scrollP(bridgeZone);
            brEls.forEach((el, i) => {
              var t = clamp((p - brTimings[i][0]) / (brTimings[i][1] - brTimings[i][0]), 0, 1);
              el.style.opacity = t;
              el.style.transform = `translateY(${(1 - t) * 24}px)`;
            });
          }
          var ticking = false;
          window.addEventListener("scroll", () => {
            if (!ticking) {
              requestAnimationFrame(() => {
                tickCor();
                tickMerge();
                tickBridge();
                ticking = false;
              });
              ticking = true;
            }
          });
          tickCor();
          tickMerge();
          tickBridge();
        })();
      },
    },
    {
      route: "/blog/agent-isnt-hard-part",
      css: BLOG_CSS,
      body: `
<a href="/solutions/chain-of-action" class="back-link">← Chain of Action</a>
<article class="blog">
  <div class="tags"><span class="tag">AI</span><span class="tag">MCP</span><span class="tag">Product</span></div>
  <div class="date">March 2026</div>
  <h1>The Agent Isn't the Hard&nbsp;Part</h1>
  <div class="author">
    <div class="author-pic">BE</div>
    <div><div class="author-name">Bill Easton</div><div class="author-title">Product &amp; AI Engineering</div></div>
  </div>
  <p>Every time I talk to a team building AI agents, we end up debating frameworks. Pydantic AI or LangChain? But honestly, the reasoning layer isn't what keeps me up at night.</p>
  <p>Here's what actually happens in production: your agent reasons perfectly. It picks the right tool. It calls it with the right parameters. And then the Slack API rate-limits. The database query times out. The third step of a five-step operation crashes. And because the tool is a single function call, the agent retries <em>everything</em> — re-fetching data it already has, re-calling APIs that already succeeded, re-paying for LLM calls that already ran.</p>
  <p>Everyone's excited about the cars right now — Cursor, Devin, Claude Code. But without infrastructure designed for them, you just have an expensive vehicle stuck on a dirt road.</p>
  <p>Your developers aren't building AI anymore. They're writing ad-hoc retry loops and error handlers. At Prefect, we call this negative engineering — and we've spent six years building tools to eliminate it.</p>

  <p>There's one important exception worth calling out. PydanticAI's Prefect integration makes the <em>agent</em> durable — wrapping model calls, tool invocations, and MCP communication as Prefect tasks with retries and caching. That's powerful, but it protects the agent's <em>calling</em> side. When the tool itself — the Slack API, the database query, the five-step pipeline — fails mid-execution, the agent still retries everything from scratch. PydanticAI makes the agent durable. Chain of Action makes the <em>tool</em> durable.</p>

  <h2>What we're building</h2>
  <p>Prefect already ships an MCP server that gives agents read-only access to the control plane — monitoring deployments, querying flow runs, diagnosing failures. Chain of Action is the write complement: agents don't just observe your workflows, they trigger them.</p>

  <p>The idea is brutally simple: a bridge that turns your Prefect deployments into MCP tools with zero code changes. You write standard Python, add an <code>@flow</code> decorator, and attach the <code>mcp-tool</code> tag.</p>
  
  <div class="codeblock">
<span class="cmt"># Your existing code. Just add a tag.</span><br/>
<span class="dec">@flow</span>(name=<span class="str">"quarterly-report"</span>)<br/>
<span class="kw">def</span> quarterly_report(quarter: str, year: int = 2025):<br/>
&nbsp;&nbsp;&nbsp;&nbsp;data = fetch_sales_data(quarter)<br/>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="kw">return</span> build_report(data)<br/><br/>
quarterly_report.deploy(<br/>
&nbsp;&nbsp;&nbsp;&nbsp;name=<span class="str">"production"</span>,<br/>
&nbsp;&nbsp;&nbsp;&nbsp;tags=[<span class="str">"mcp-tool"</span>, <span class="str">"mcp-artifacts"</span>],<br/>
)
  </div>

  <p>Our FastMCP adapter dynamically reads the OpenAPI schema from your deployment and registers a flawless MCP tool. When the agent calls it, we proxy the execution over to your infrastructure. Instantly, your brittle agent tool inherits Prefect's automatic retries, caching, and observability. No YAML, no complex DSLs. Just Python.</p>
  
  <p>For platform engineers, this means you can finally let agents use your existing workflows securely. For AI engineers, it simply means your tools stop crashing halfway through.</p>
  
  <p>Over the next 90 days, we're testing one bet: will AI engineers adopt an orchestrator if the friction is just <code>pip install</code> and a tag? We think the answer is obvious. But we're engineers — we'd rather measure than assume.</p>

  <p>There's a secondary signal I'm watching closely: does the PydanticAI integration create a pull effect? If teams already using <code>PrefectAgent</code> for durable agent execution naturally want their Prefect deployments callable as tools too, that's a strong signal that both sides of the durable execution story belong together.</p>

  <p>Elevate your script into a production tool. Then commit your work and get back to building.</p>
</article>`,
    },
    {
      route: "/blog/prefect-owns-execution-layer",
      css: BLOG_CSS,
      body: `
<a href="/solutions/chain-of-action" class="back-link">← Chain of Action</a>
<article class="blog">
  <div class="tags"><span class="tag">AI</span><span class="tag">Strategy</span><span class="tag">MCP</span></div>
  <div class="date">March 2026</div>
  <h1>Why Prefect Already Owns the Agent Execution&nbsp;Layer</h1>
  <div class="author">
    <div class="author-pic">BE</div>
    <div><div class="author-name">Bill Easton</div><div class="author-title">Product &amp; AI Engineering</div></div>
  </div>
  <p>Everyone's building agent tool frameworks from scratch right now. Retries, caching, distributed locks, observability — the works. But building those primitives well takes years. We know, because we've been building them for six.</p>

  <p>Airflow was the first successful implementation of workflows-as-code, but writing Airflow DAGs feels like writing Airflow code — not Python. Temporal forces you to learn a rigid, opinionated framework. Dagster expects you to dress your functions up in an asset costume. No asset costume required here.</p>

  <p>We're not building a new orchestrator. We're connecting what Prefect already has:</p>

  <div class="asset-grid">
    <div class="asset-card">
      <span class="asset-tag at-have">Already built</span>
      <h4>Typed parameter schemas</h4>
      <p>Every deployment exposes <code>parameter_openapi_schema</code> — JSON Schema derived from Python type hints. This is exactly what MCP tools need for input validation.</p>
    </div>
    <div class="asset-card">
      <span class="asset-tag at-have">Already built</span>
      <h4>FastMCP</h4>
      <p>Prefect maintains FastMCP (think "Flask for AI tools") — the leading open-source MCP framework. Provider architecture, background tasks via Docket, Horizon Deploy for managed hosting.</p>
    </div>
    <div class="asset-card">
      <span class="asset-tag at-have">Already built</span>
      <h4>Artifacts API</h4>
      <p>Tables, markdown, and links — structured outputs that LLMs can reason over natively. No parsing HTML or scraping logs.</p>
    </div>
    <div class="asset-card">
      <span class="asset-tag at-have">Already built</span>
      <h4>PydanticAI durable execution</h4>
      <p>Native <code>PrefectAgent</code> wrapper makes agent runs durable. Model calls, tool invocations, and MCP communication become retryable Prefect tasks. Validates market demand at the framework level.</p>
    </div>
    <div class="asset-card">
      <span class="asset-tag at-have">Already built</span>
      <h4>Prefect MCP Server (read-only)</h4>
      <p>Official MCP server gives agents diagnostic access to deployments, flow runs, logs, and events. The read side of agent-Prefect interaction. Chain of Action adds the write side.</p>
    </div>
    <div class="asset-card">
      <span class="asset-tag at-new">New</span>
      <h4>Chain of Action adapter</h4>
      <p>The bridge layer. Discovers tagged deployments, registers MCP tools, brokers execution. The only new code in this proposal.</p>
    </div>
  </div>

  <h2>The competitive landscape</h2>
  <p>The fact that PydanticAI chose Prefect (alongside Temporal and Inngest) as one of its three native durable execution backends tells you the agent framework ecosystem specifically values Prefect's execution model. But let's be honest about where things stand:</p>

  <table class="comp-table">
    <tr><th></th><th>Prefect</th><th>Temporal</th><th>Airflow</th><th>Dagster</th></tr>
    <tr><td>MCP server ecosystem</td><td class="yes">&#10003; FastMCP + Horizon</td><td class="no">&#10007;</td><td class="no">&#10007;</td><td class="no">&#10007;</td></tr>
    <tr><td>PydanticAI native support</td><td class="yes">&#10003; PrefectAgent</td><td class="yes">&#10003; TemporalAgent</td><td class="no">&#10007;</td><td class="no">&#10007;</td></tr>
    <tr><td>Deployment → tool schema path</td><td class="yes">&#10003; parameter_openapi_schema</td><td class="no">&#10007;</td><td class="no">&#10007;</td><td class="no">&#10007;</td></tr>
    <tr><td>Structured artifact responses</td><td class="yes">&#10003; Tables, markdown, links</td><td class="no">&#10007;</td><td class="no">&#10007;</td><td class="no">&#10007;</td></tr>
    <tr><td>Managed tool hosting + governance</td><td class="yes">&#10003; Horizon</td><td class="no">&#10007;</td><td class="no">&#10007;</td><td class="no">&#10007;</td></tr>
    <tr><td>Just Python (no DSL/constraints)</td><td class="yes">&#10003;</td><td class="no">Deterministic replay constraints</td><td class="no">DAG-only</td><td class="no">Asset model required</td></tr>
  </table>

  <p>Temporal deserves respect here — their PydanticAI integration means they also offer agent-side durability. But Temporal has no MCP server ecosystem (no FastMCP equivalent, no Horizon equivalent), requires deterministic replay constraints that don't apply to Prefect's model, and doesn't have the deployment-to-tool schema translation path. To match Chain of Action, they'd need to build all of this from scratch.</p>

  <h2>The flywheel</h2>
  <p>Here's what gets me excited about this: the business model aligns naturally.</p>

  <p>Prefect Cloud charges per seat — more tool calls don't increase costs. Horizon charges for managed server hosting and governance. Chain of Action bridges both: existing Cloud customers discover Horizon through agent tooling (deploy your adapter via Horizon Deploy, govern access through Horizon Gateway), and AI-first teams discover Cloud through Horizon's deployment catalog. Each product drives adoption of the other without cannibalization.</p>

  <p>If you're running Prefect Cloud today, you probably have dozens of workflows that would make fantastic agent tools. Tag a deployment, and it's a tool. You didn't rewrite anything. You didn't learn a new framework. Your existing monitoring, retries, and caching just... work.</p>

  <p>If you're a Horizon user governing AI agents, you've probably noticed that single-shot tool calls are fragile. Wrapping that logic in a Prefect flow gives you the durability you're missing — and you can see exactly what the agent executed.</p>

  <p>Everyone's excited about the cars right now. Claude Code, Cursor, Devin. But highways made cars transformative. Chain of Action is the highway.</p>
</article>`,
    },
    {
      route: "/blog/chain-of-action-first-90-days",
      css: BLOG_CSS,
      body: `
<a href="/solutions/chain-of-action" class="back-link">← Chain of Action</a>
<article class="blog">
  <div class="tags"><span class="tag">AI</span><span class="tag">Engineering</span><span class="tag">MCP</span></div>
  <div class="date">March 2026</div>
  <h1>Building Chain of Action: The First 90&nbsp;Days</h1>
  <div class="author">
    <div class="author-pic">BE</div>
    <div><div class="author-name">Bill Easton</div><div class="author-title">Product &amp; AI Engineering</div></div>
  </div>
  <p>Slapping a tag on a flow to make an MCP tool sounds great, but the actual engineering here is tricky. Here's what we learned building it.</p>

  <h2>The architecture</h2>
  <p>The key technical insight was that FastMCP 3.0's Provider architecture makes dynamic tool registration clean. Rather than calling <code>add_tool()</code> (which is designed for Python callables), we subclass <code>Tool</code> directly. <code>PrefectTool</code> extends FastMCP's <code>Tool</code> class, accepts the deployment's JSON Schema as its <code>parameters</code> dict, and implements <code>run()</code> to call <code>trigger_and_wait()</code>. A <code>PrefectProvider</code> subclasses FastMCP's <code>Provider</code> and returns these instances from <code>_list_tools()</code>.</p>

  <p>The deployment's <code>parameter_openapi_schema</code> passes through untouched — no code generation, no dynamic Pydantic models, no function signature introspection. We tested against deployments with nested Pydantic models, Optional fields, Enum types, and complex defaults. Everything passes through correctly because we're not reconstructing the schema, just forwarding it.</p>

  <h2>The elephant in the room</h2>
  <p>The hardest part of this isn't the schema translation. It's the authentication.</p>

  <p>Prefect Cloud (where your flows run) and Horizon (where tools are governed) use fundamentally different authentication models. If we want that one-click "Enable Bridge" experience inside Horizon, we have to seamlessly sync identities and securely vault credentials across two totally different clouds. If we mess up the proxying, well, we'd rather not.</p>

  <p>Since cross-cloud auth is such a huge technical blocker, our MVP completely sidesteps it. We're decoupling the auth layer by shipping a self-hosted, open-source adapter first. You pass it your API keys locally via environment variables, and it just works.</p>

  <p>This lets our five-person team prove the core orchestrator loop fast, without waiting for internal backend alignments. It also tests the biggest market risk: do developers actually want to write tools this way?</p>

  <h2>Risks and how we're handling them</h2>

  <p><strong>Dynamic tool registration (solved).</strong> Our initial concern was that FastMCP's <code>add_tool()</code> expects Python callables with type hints for introspection. Passing explicit JSON Schema at runtime isn't a documented pattern. We bypassed <code>add_tool()</code> entirely by subclassing <code>Tool</code> directly. FastMCP 3.0's architecture treats servers as providers, and providers can return any <code>Tool</code> instance — the <code>parameters</code> dict is passed through to the MCP protocol layer as-is. The <code>pydantic.create_model()</code> fallback was not needed.</p>

  <p><strong>Latency (mitigated).</strong> Flow runs take seconds to minutes. Synchronous MCP calls block the agent. We use FastMCP 3.0's background task system, powered by Docket — Prefect's open-sourced distributed task scheduler that processes millions of concurrent tasks daily in Prefect Cloud. Our <code>PrefectTool</code> uses <code>TaskConfig(mode='optional')</code>, so clients that support the MCP background task protocol get async execution automatically, while clients that don't still work synchronously.</p>

  <p><strong>Competing with Prefect's own roadmap (acknowledged).</strong> Prefect may already be building this internally. The official Prefect MCP server is read-only today, but the team could extend it to support deployment triggering at any time. Our mitigation: ship fast and open-source. If Prefect builds this natively, the adapter's patterns — tag-based modes, artifact responses, Provider subclass — can inform their implementation. The goal is to prove the concept and generate adoption signal, not to own the codebase forever.</p>

  <h2>How we're sequencing it</h2>
  <p><strong>Weeks 1–2: Spike &amp; prove.</strong> Dynamic tool registration spike. The adapter registers tools from deployment schemas. Tested against 20 real deployments with varying parameter complexity. Built the discovery → registration → execution loop end-to-end. The Provider/Tool subclass approach in FastMCP 3.0 worked cleanly — no code generation needed. <strong>Gate: tools register and execute against 18/20 test deployments</strong> (2 failures due to custom Pydantic validators that don't serialize to JSON Schema).</p>

  <p><strong>Weeks 3–4: Dogfood.</strong> Live testing with Claude Desktop to ensure the LLM can actually reason over the artifacts we return. Validate that Markdown and table artifacts give the model enough context to keep working without hallucinating.</p>

  <p><strong>Weeks 5–6: Open-source.</strong> Publish the local adapter on PyPI. Once we have real workspaces relying on the <code>mcp-tool</code> tag, we'll dedicate the rest of the quarter to the heavy engineering: building the managed identity bridge natively into Horizon.</p>

  <p>If the Russian proverb holds true, our first pancake might be a bit lumpy. We'll adapt quickly.</p>
</article>`,
    },
  ];

  // ── Script execution with Shadow DOM proxy ────────────────────────────────
  // Pages with scroll animations need their scripts to query the shadow root
  // instead of the real document, and listen to the overlay's scroll instead
  // of window's scroll.
  function executePageScript(scriptFn, shadowRoot, scrollEl) {
    const proxyDoc = {
      getElementById: (id) => shadowRoot.getElementById(id),
      querySelector: (sel) => shadowRoot.querySelector(sel),
      querySelectorAll: (sel) => shadowRoot.querySelectorAll(sel),
    };
    const proxyWin = {
      addEventListener(evt, handler, opts) {
        if (evt === "scroll") scrollEl.addEventListener("scroll", handler, opts);
        else window.addEventListener(evt, handler, opts);
      },
      get innerHeight() {
        return window.innerHeight;
      },
      get innerWidth() {
        return window.innerWidth;
      },
    };
    scriptFn(proxyDoc, proxyWin);
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  function getNavHeight() {
    for (const sel of ["header", "nav", '[class*="navbar"]']) {
      const el = document.querySelector(sel);
      if (el) {
        const b = el.getBoundingClientRect().bottom;
        if (b > 0 && b < 200) return b;
      }
    }
    return 72;
  }

  const SCROLL_WRAP_ID = "pdt-scroll-wrap";

  function showPage(page) {
    if (document.getElementById(HOST_ID)) return;

    // z-index 40: below prefect.io's nav (z-index:50) so nav dropdowns appear
    // above the overlay. We start from top:0 (covering the full viewport) and
    // pad the content down by the nav height so the hero starts below the nav.
    const navH = getNavHeight();
    const host = document.createElement("div");
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "40",
      overflow: "hidden",
    });

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap">
      <style>
        :host { display: block; }
        #${SCROLL_WRAP_ID} { height: 100%; overflow-y: auto; overflow-x: hidden; }
        ${page.css.replace(":root{", ":host{")}
      </style>
      <div id="${SCROLL_WRAP_ID}" style="--nav-h:${navH}px;">
        <div style="font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;background:#0B0F1A;color:#FFF;-webkit-font-smoothing:antialiased;padding-top:${navH}px;">
          ${page.body}
        </div>
      </div>`;

    document.body.appendChild(host);
    document.documentElement.style.setProperty("overflow", "hidden", "important");

    // Intercept clicks on internal page links inside the shadow DOM.
    // Without this, <a href="/blog/..."> inside the shadow would let the
    // browser navigate away instead of switching the overlay to that page.
    shadow.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
      // Hash links: scroll the shadow root's scroll container to the target element
      if (href.startsWith("#")) {
        const target = shadow.getElementById(href.slice(1));
        if (target) {
          e.preventDefault();
          const scrollWrap = shadow.getElementById(SCROLL_WRAP_ID);
          const offset =
            target.getBoundingClientRect().top - scrollWrap.getBoundingClientRect().top;
          scrollWrap.scrollBy({ top: offset, behavior: "smooth" });
        }
        return;
      }
      if (href.startsWith("http")) return;
      const match = PAGES.find((p) => p.route === href);
      if (match) {
        e.preventDefault();
        hidePage();
        history.pushState(null, "", href);
        showPage(match);
      }
    });

    if (page.script) {
      const scrollWrap = shadow.getElementById(SCROLL_WRAP_ID);
      executePageScript(page.script, shadow, scrollWrap);
    }
  }

  function hidePage() {
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
    document.documentElement.style.removeProperty("overflow");
  }

  function isOverlayActive() {
    return !!document.getElementById(HOST_ID);
  }

  // ── Solutions dropdown banner injection ───────────────────────────────────
  // The Prefect nav uses Radix UI NavigationMenu. The Solutions dropdown
  // content panel is always present in the DOM (Radix renders all panels
  // up-front and hides them via CSS). It lives in a viewport portal outside
  // the <ul>, identified via the Solutions button's aria-controls attribute.
  //
  // We inject a full-width "Workflows as AI Tools" promotional banner at the
  // bottom of the Solutions dropdown grid, spanning both columns.

  const BANNER_ID = "pdt-solutions-banner";

  function findSolutionsPanel() {
    // Find the Solutions trigger button by text content
    for (const btn of document.querySelectorAll("button[aria-controls]")) {
      if (btn.textContent.trim().startsWith("Solutions")) {
        const panelId = btn.getAttribute("aria-controls");
        return panelId ? document.getElementById(panelId) : null;
      }
    }
    return null;
  }

  function injectSolutionsBanner() {
    if (document.getElementById(BANNER_ID)) return;

    const panel = findSolutionsPanel();
    if (!panel) return;

    // The inner grid is the first child of the content panel
    const grid = panel.querySelector(".grid");
    if (!grid) return;

    // Create a full-width grid cell spanning both columns
    const cell = document.createElement("div");
    cell.style.cssText =
      "grid-column:1/-1;padding-top:4px;border-top:1px solid rgba(255,255,255,0.07);margin-top:4px;";

    const link = document.createElement("a");
    link.id = BANNER_ID;
    link.href = "/solutions/chain-of-action";
    link.style.cssText = [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "width:100%",
      "border-radius:8px",
      "padding:10px 12px",
      "text-decoration:none",
      "cursor:pointer",
      "background:rgba(46,221,181,0.06)",
      "border:1px solid rgba(46,221,181,0.2)",
      "transition:background 0.15s",
    ].join(";");

    link.innerHTML = `
      <span style="display:flex;align-items:center;gap:8px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="#2EDDB5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9"/>
          <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>
        </svg>
        <span style="font-size:13px;font-weight:600;color:#2EDDB5;">Workflows as AI Tools</span>
        <span style="display:inline-flex;align-items:center;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:#2EDDB5;color:#000;letter-spacing:.05em;line-height:1.2;">NEW</span>
      </span>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="#2EDDB5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
      </svg>`;

    link.addEventListener("mouseenter", () => {
      link.style.background = "rgba(46,221,181,0.12)";
    });
    link.addEventListener("mouseleave", () => {
      link.style.background = "rgba(46,221,181,0.06)";
    });

    const page = PAGES.find((p) => p.route === "/solutions/chain-of-action");
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hidePage();
      history.pushState(null, "", "/solutions/chain-of-action");
      if (page) showPage(page);
    });

    cell.appendChild(link);
    grid.appendChild(cell);
  }

  // ── Restore normal navigation when a real nav link is clicked ─────────────

  const pageRoutes = new Set(PAGES.map((p) => p.route));

  document.addEventListener(
    "click",
    (e) => {
      if (!isOverlayActive()) return;
      const target = e.target.closest("a[href]");
      if (!target || target.id === BANNER_ID) return;

      // Ignore clicks inside the shadow overlay itself
      const host = document.getElementById(HOST_ID);
      if (host && e.composedPath().includes(host)) return;

      const href = target.getAttribute("href") || "";
      if (href && !pageRoutes.has(href) && !href.startsWith("#")) {
        hidePage();
      }
    },
    true,
  );

  // ── SPA navigation detection ───────────────────────────────────────────────

  function checkRoute() {
    const path = window.location.pathname;
    const match = PAGES.find((p) => p.route === path);
    if (match) {
      if (!isOverlayActive()) showPage(match);
    } else {
      hidePage();
    }
  }

  ["pushState", "replaceState"].forEach((method) => {
    const orig = history[method].bind(history);
    history[method] = (...args) => {
      orig(...args);
      checkRoute();
    };
  });

  window.addEventListener("popstate", checkRoute);

  // ── MutationObserver: re-inject after SPA re-renders the nav ──────────────

  let injectTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(injectTimer);
    injectTimer = setTimeout(injectSolutionsBanner, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  injectSolutionsBanner();
  checkRoute();
})();
