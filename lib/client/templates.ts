// Hand-written starter shown without an AI key. Clearly labeled as a template in the UI.
export const STARTER_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fieldnote — habit journal</title>
<style>
:root{--ink:#1b1a17;--paper:#f6f2ea;--line:#ddd5c6;--acc:#e8492a;--mut:#6f6a60}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
header{display:flex;justify-content:space-between;align-items:center;padding:22px 6vw;border-bottom:1px solid var(--line)}
.logo{font:600 20px Georgia,serif;letter-spacing:-.02em}.logo b{color:var(--acc)}
main{max-width:980px;margin:0 auto;padding:48px 6vw}
h1{font:400 clamp(40px,7vw,72px)/1 Georgia,serif;letter-spacing:-.03em;margin:0 0 14px}h1 em{color:var(--acc)}
.lede{color:var(--mut);max-width:520px;margin:0 0 36px}
form{display:flex;gap:8px;margin-bottom:24px}input{flex:1;padding:13px 14px;border:1px solid var(--line);border-radius:10px;background:#fff;font:inherit}
button{font:inherit;cursor:pointer;border:0;border-radius:10px;padding:12px 18px;background:var(--ink);color:var(--paper)}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
th,td{padding:12px;border-bottom:1px solid var(--line);text-align:center}th:first-child,td:first-child{text-align:left}
th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);font-weight:600}
.dot{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);background:none;padding:0}.dot.on{background:var(--acc);border-color:var(--acc)}
.streak{font-variant-numeric:tabular-nums;color:var(--acc);font-weight:600}.del{background:none;color:var(--mut);padding:4px 8px}
footer{color:var(--mut);font-size:13px;margin-top:22px}
</style></head><body>
<header><div class="logo">field<b>note</b></div><span style="color:var(--mut);font-size:14px" id="today"></span></header>
<main><h1>Small habits,<br><em>kept honestly.</em></h1><p class="lede">Track a handful of daily habits for the week. Everything stays in this browser.</p>
<form id="f"><input id="name" placeholder="Add a habit, e.g. Read 20 pages" required maxlength="60"><button>Add habit</button></form>
<table><thead><tr id="head"><th>Habit</th></tr></thead><tbody id="body"></tbody></table>
<footer id="sum"></footer></main>
<script>
const days=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return d});
const key=d=>d.toISOString().slice(0,10);
let habits=JSON.parse(localStorage.getItem('fn')||'null')||[{name:'Walk 30 minutes',done:[]},{name:'No phone after 10pm',done:[]}];
const save=()=>localStorage.setItem('fn',JSON.stringify(habits));
document.getElementById('today').textContent=new Date().toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric'});
document.getElementById('head').innerHTML='<th>Habit</th>'+days.map(d=>'<th>'+d.toLocaleDateString('en-US', {weekday:'short'})+'</th>').join('')+'<th>Streak</th><th></th>';
function streak(h){let s=0;for(let i=6;i>=0;i--){if(h.done.includes(key(days[i])))s++;else if(i<6)break;}return s}
function render(){document.getElementById('body').innerHTML=habits.map((h,i)=>'<tr><td>'+h.name.replace(/</g,'&lt;')+'</td>'+days.map(d=>'<td><button aria-label="toggle" class="dot '+(h.done.includes(key(d))?'on':'')+'" data-i="'+i+'" data-d="'+key(d)+'"></button></td>').join('')+'<td class="streak">'+streak(h)+'</td><td><button class="del" data-del="'+i+'">Remove</button></td></tr>').join('');
const total=habits.reduce((a,h)=>a+h.done.filter(x=>days.some(d=>key(d)===x)).length,0);document.getElementById('sum').textContent=total+' check-ins this week across '+habits.length+' habits.';}
document.body.addEventListener('click',e=>{const t=e.target;if(t.dataset.d){const h=habits[t.dataset.i];h.done=h.done.includes(t.dataset.d)?h.done.filter(x=>x!==t.dataset.d):[...h.done,t.dataset.d];save();render()}if(t.dataset.del){habits.splice(t.dataset.del,1);save();render()}});
document.getElementById('f').addEventListener('submit',e=>{e.preventDefault();const n=document.getElementById('name');habits.push({name:n.value.trim(),done:[]});n.value='';save();render()});
render();
</script></body></html>`;

export const STARTERS = [
  { title: 'SaaS landing page', prompt: 'A landing page for "Ledgerly", bookkeeping for freelancers: hero with product screenshot made in CSS, three feature rows, pricing with monthly/yearly toggle, FAQ accordion, and a footer. Editorial typography, warm off-white palette.' },
  { title: 'Store dashboard', prompt: 'An analytics dashboard for a small coffee-bean online store: sidebar, KPI cards, a revenue chart drawn with SVG, a sortable recent-orders table and a working date-range filter. Realistic mock data.' },
  { title: 'Booking app', prompt: 'A booking page for a one-person yoga studio: weekly class schedule, class detail drawer, booking form with validation, and a confirmation state saved to localStorage.' },
];
