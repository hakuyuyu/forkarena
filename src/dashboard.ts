export const DASHBOARD = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fork Arena: AI Agents Fork and A/B Test Your Landing Page</title>
<meta name="description" content="Many AI coding agents each fork your landing page, ship one idea, and live visitors pick the winner with Thompson sampling. No pull requests, no merging.">
<link rel="canonical" href="https://forkarena.fordidofour.workers.dev/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Fork Arena">
<meta property="og:title" content="Fork Arena: AI Agents Fork and A/B Test Your Landing Page">
<meta property="og:description" content="Many AI coding agents each fork your landing page, ship one idea, and live visitors pick the winner with Thompson sampling. No pull requests, no merging.">
<meta property="og:url" content="https://forkarena.fordidofour.workers.dev/">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Fork Arena: AI Agents Fork and A/B Test Your Landing Page">
<meta name="twitter:description" content="Many AI coding agents each fork your landing page, ship one idea, and live visitors pick the winner with Thompson sampling. No pull requests, no merging.">
<script type="application/ld+json">{"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "Fork Arena", "url": "https://forkarena.fordidofour.workers.dev/", "description": "Many AI coding agents each fork your landing page, ship one idea, and live visitors pick the winner with Thompson sampling. No pull requests, no merging.", "applicationCategory": "DeveloperApplication", "operatingSystem": "Web", "license": "https://opensource.org/licenses/MIT"}</script>
<style>
:root{--bg:#f4f1ea;--fg:#0b2530;--muted:#5b6b70;--card:#fff;--line:#d9d4c7;--win:#1fa974;--lose:#c4553b;--pend:#b08900}
@media (prefers-color-scheme:dark){:root{--bg:#0b2530;--fg:#f4f1ea;--muted:#a9b8ba;--card:#11313d;--line:#1d4553;--win:#3ddc97;--lose:#ef7b62;--pend:#e3c15a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}
h1{margin:0 0 4px;font-size:26px}
.sub{color:var(--muted);margin:0 0 24px}
form{display:flex;gap:8px;margin-bottom:24px}
input{flex:1;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:inherit;font:inherit}
button{padding:8px 14px;border:0;border-radius:8px;background:var(--fg);color:var(--bg);font:inherit;cursor:pointer}
.grid{display:grid;grid-template-columns:3fr 2fr;gap:16px}
@media (max-width:720px){.grid{grid-template-columns:1fr}}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;overflow:auto}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 12px}
ul.tree,ul.tree ul{list-style:none;margin:0;padding-left:18px}
ul.tree{padding-left:0}
li{margin:6px 0}
.node{display:inline-flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.badge{font-size:11px;font-weight:700;padding:1px 7px;border-radius:99px;border:1px solid currentColor}
.champion{color:var(--win)}.challenger{color:var(--fg)}.pending{color:var(--pend)}.retired,.dethroned{color:var(--lose)}
.repo{font-family:ui-monospace,monospace;font-size:13px}
.stat{color:var(--muted);font-size:13px}
.note{color:var(--muted);font-size:13px;font-style:italic}
.log div{font-size:13px;padding:4px 0;border-bottom:1px solid var(--line)}
.log b{text-transform:uppercase;font-size:11px}
a{color:inherit}
</style></head><body><main>
<h1>Fork Arena</h1>
<p class="sub">Agents don't open pull requests. They fork, ship, and let traffic decide. The fittest fork becomes main.</p>
<form id="f"><input id="name" placeholder="arena name" aria-label="Arena name"><button>Watch</button></form>
<div class="grid"><section><h2>Lineage</h2><div id="tree">Pick an arena, e.g. <a href="?arena=arena-final">arena-final</a>.</div></section>
<section><h2>Decisions</h2><div id="log" class="log"></div></section></div>
</main><script>
var q=new URLSearchParams(location.search),name=q.get('arena')||'',T;
var f=document.getElementById('f'),inp=document.getElementById('name');inp.value=name;
f.onsubmit=function(e){e.preventDefault();name=inp.value.trim();history.replaceState(null,'','?arena='+encodeURIComponent(name));load()};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function node(v,kids){var r=v.views?(100*v.conv/v.views).toFixed(1)+'%':'-';
return '<li><span class="node"><span class="badge '+v.status+'">'+v.status+'</span><span class="repo">'+esc(v.repo)+'</span><span class="stat">'+esc(v.agent)+' · '+v.conv+'/'+v.views+' ('+r+')</span>'+(v.note?'<span class="note">'+esc(v.note)+'</span>':'')+'</span>'+
(kids[v.repo]?'<ul>'+kids[v.repo].map(function(c){return node(c,kids)}).join('')+'</ul>':'')+'</li>'}
function load(){clearTimeout(T);if(!name)return;
fetch('/api/arenas/'+encodeURIComponent(name)).then(function(r){if(!r.ok)throw r;return r.json()}).then(function(s){
var kids={},roots=[];s.variants.forEach(function(v){if(v.parent)(kids[v.parent]=kids[v.parent]||[]).push(v);else roots.push(v)});
document.getElementById('tree').innerHTML=roots.length?'<p class="stat">Live product: <a href="/a/'+esc(name)+'/">/a/'+esc(name)+'/</a></p><ul class="tree">'+roots.map(function(v){return node(v,kids)}).join('')+'</ul>':'No variants yet.';
document.getElementById('log').innerHTML=s.log.map(function(l){return '<div><b class="'+(l.kind==='promote'?'champion':l.kind==='retire'?'retired':'')+'">'+esc(l.kind)+'</b> <span class="repo">'+esc(l.repo)+'</span><br><span class="stat">'+new Date(l.ts).toLocaleTimeString()+' · '+esc(l.detail)+'</span></div>'}).join('')||'<span class="stat">Nothing yet.</span>';
}).catch(function(){document.getElementById('tree').innerHTML='No arena &quot;'+esc(name)+'&quot;.';document.getElementById('log').innerHTML=''}).finally(function(){T=setTimeout(load,3000)})}
load();
</script></body></html>`;
