const socket=io();
const modal=document.getElementById("modal"), body=document.getElementById("modalBody"), toastEl=document.getElementById("toast");
let securityToken=localStorage.getItem("securityToken")||"";
let currentReportId=null;

function toast(msg){toastEl.textContent=msg;toastEl.classList.remove("hidden");setTimeout(()=>toastEl.classList.add("hidden"),5000)}
function closeModal(){modal.classList.add("hidden")}
function openReport(type){
 body.innerHTML=`<div class="tag">${type==="lost"?"REPORT A LOST ITEM":"REPORT A FOUND ITEM"}</div><h2>${type==="lost"?"I Lost an Item":"I Found an Item"}</h2><p>Give us the details so the campus security team can help.</p>
 <form class="form" onsubmit="submitReport(event,'${type}')">
 <div class="field"><label>Item name</label><input id="item" required placeholder="e.g. Black wallet, keys, ID card"></div>
 <div class="field"><label>Category</label><select id="category" required><option value="">Select category</option><option>Electronics</option><option>Documents / ID</option><option>Keys</option><option>Wallet / Money</option><option>Bag / Accessories</option><option>Other</option></select></div>
 <div class="field"><label>Location</label><input id="location" required placeholder="Library, Canteen, Block A"></div>
 <div class="field"><label>Date & time</label><input id="date" type="datetime-local" required></div>
 <div class="field"><label>Description</label><textarea id="description" required placeholder="Color, brand, unique marks"></textarea></div>
 <div class="field"><label>Your name</label><input id="name" required></div><div class="field"><label>Contact / email</label><input id="contact" required></div>
 <div class="actions2"><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn">Submit Report →</button></div></form>`;
 modal.classList.remove("hidden");
}
async function submitReport(e,type){
 e.preventDefault();
 const data={type,item:item.value.trim(),category:category.value,location:location.value.trim(),date:date.value,description:description.value.trim(),name:name.value.trim(),contact:contact.value.trim()};
 const res=await fetch("/api/reports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 const out=await res.json(); if(!res.ok)return alert(out.error||"Submission failed");
 currentReportId=out.report.id; socket.emit("joinReport",currentReportId);
 if(type==="found") showDeposit(out.report); else showSuccess(out.report);
}
function showSuccess(r){body.innerHTML=`<div style="text-align:center;padding:15px"><div class="depositIcon">✓</div><h2>Lost Item Reported</h2><p>Reference ID: <span class="ref">${r.id}</span><br><br>Keep this page open. You'll receive a real-time alert if security verifies a match.</p><button class="btn" onclick="closeModal()">Done</button></div>`}
function showDeposit(r){body.innerHTML=`<div class="deposit"><div class="depositIcon">▣</div><h2>Drop the item in the box</h2><p>Your found-item report <span class="ref">${r.id}</span> was sent to security.</p><div class="depositBox"><strong>OPEN THE KIOSK DRAWER</strong><p>Place the found item safely inside the physical box/drawer below the screen, then confirm here.</p></div><div class="actions2"><button class="btn secondary" onclick="closeModal()">Later</button><button class="btn green" onclick="deposit('${r.id}')">✓ Item Deposited</button></div></div>`}
async function deposit(id){const r=await fetch("/api/reports/"+id+"/deposit",{method:"POST"});const x=await r.json();body.innerHTML=`<div style="text-align:center;padding:15px"><div class="depositIcon">✓</div><h2>Item Secured</h2><p>Security has been notified in real time.<br>Reference ID: <span class="ref">${x.id}</span></p><button class="btn" onclick="closeModal()">Done</button></div>`}
socket.on("depositRequired",d=>{if(d.reportId===currentReportId)showDeposit({id:d.reportId})});
socket.on("possibleMatch",d=>{if(d.lost.id===currentReportId||d.found.id===currentReportId){toast("Possible match found. Security is reviewing your report.");}});
socket.on("matchVerified",d=>{if(d.lost.id===currentReportId||d.found.id===currentReportId){toast("Security verified a match. Please follow the campus verification/return instructions.");}});
socket.on("depositConfirmed",r=>toast("Your found item was recorded as deposited."));

function securityLogin(){
 body.innerHTML=`<div class="tag">AUTHORIZED ACCESS</div><h2>Security Login</h2><p>Access matching reports, alerts and verification tools.</p><form class="form" onsubmit="login(event)"><div class="field"><label>Email</label><input id="email" type="email" required placeholder="security@campus.edu"></div><div class="field"><label>Password</label><input id="password" type="password" required></div><div class="actions2"><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn">Sign in</button></div></form><p style="font-size:12px;background:#f5f7f5;padding:10px;border-radius:9px"><b>Demo:</b> security@campus.edu / admin123</p>`;
 modal.classList.remove("hidden");
}
async function login(e){e.preventDefault();const r=await fetch("/api/security/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.value,password:password.value})});const x=await r.json();if(!r.ok)return alert(x.error);securityToken=x.token;localStorage.setItem("securityToken",securityToken);closeModal();document.getElementById("home").classList.add("hidden");document.getElementById("security").classList.remove("hidden");socket.emit("joinSecurity",securityToken);loadSecurity()}
function logout(){securityToken="";localStorage.removeItem("securityToken");location.reload()}
async function loadSecurity(){if(!securityToken)return;const r=await fetch("/api/reports",{headers:{Authorization:"Bearer "+securityToken}});if(!r.ok)return logout();const data=await r.json();render(data)}
socket.on("connect",()=>{if(securityToken){socket.emit("joinSecurity",securityToken);loadSecurity()}});
socket.on("newReport",()=>{if(securityToken)loadSecurity()});
socket.on("matchAlert",a=>{if(securityToken){toast(`🔔 ${a.score}% possible match: ${a.lost.item}`);loadSecurity()}});
socket.on("reportUpdated",()=>{if(securityToken)loadSecurity()});
socket.on("matchVerified",()=>{if(securityToken)loadSecurity()});
socket.on("stats",s=>{if(securityToken){sLost.textContent=s.lost;sFound.textContent=s.found;sMatch.textContent=s.matches;sPending.textContent=s.pending}});
function render(data){
 const lost=data.filter(x=>x.type==="lost"),found=data.filter(x=>x.type==="found");
 const matches=[];lost.forEach(l=>found.forEach(f=>{let s=0;if(l.category===f.category)s+=30;if(l.location.toLowerCase()===f.location.toLowerCase())s+=25;if(l.item.toLowerCase()===f.item.toLowerCase())s+=30;if(s>=45)matches.push({l,f,s})}));
 sLost.textContent=lost.length;sFound.textContent=found.length;sMatch.textContent=matches.length;sPending.textContent=data.filter(x=>["pending","deposited"].includes(x.status)).length;
 alerts.innerHTML=matches.length?matches.sort((a,b)=>b.s-a.s).map(m=>`<div class="alert"><div class="top"><b>Possible Match: ${esc(m.l.item)}</b><span class="badge">${m.s}% MATCH</span></div><div class="detail"><b>Lost:</b> ${esc(m.l.location)} · ${esc(m.l.category)}<br><b>Found:</b> ${esc(m.f.location)} · ${esc(m.f.category)}<br>${esc(m.f.description)}</div><div class="actions"><button class="yes" onclick="verify('${m.l.id}','${m.f.id}')">Verify & Notify</button><button class="no" onclick="dismiss('${m.f.id}')">Dismiss</button></div></div>`).join(""):`<div class="empty">No possible matches yet.<br>New reports appear here automatically.</div>`;
 reports.innerHTML=data.slice(0,20).map(r=>`<div class="report"><div class="top"><b>${esc(r.item)}</b><span class="badge">${esc(r.status.toUpperCase())}</span></div><div class="detail"><b>${r.type.toUpperCase()}</b> · ${esc(r.category)} · ${esc(r.location)}<br>${esc(r.name)} · ${esc(r.contact)}<br><span class="ref">${r.id}</span></div></div>`).join("")||`<div class="empty">No reports yet.</div>`;
}
async function verify(id,matchedId){const r=await fetch("/api/reports/"+id+"/verify",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+securityToken},body:JSON.stringify({matchedId})});const x=await r.json();if(!r.ok)return alert(x.error);alert("Match verified. Security can now contact the student and perform personal verification before returning the item.");loadSecurity()}
async function dismiss(id){await fetch("/api/reports/"+id+"/dismiss",{method:"POST",headers:{Authorization:"Bearer "+securityToken}});loadSecurity()}
function esc(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});
