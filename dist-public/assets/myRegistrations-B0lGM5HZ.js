import{s as g}from"./supabase-client-Ba9QOxWH.js";/* empty css             */import{o as w,i as x,a as _,u as k,s as C,b as E,j as y,l as $,c as m}from"./auth-DxzHnmx4.js";/* empty css               */import"https://esm.sh/@supabase/supabase-js@2.49.4";let d=[],n="all";document.addEventListener("DOMContentLoaded",()=>{w(),x(),_(),k(),C(),L(),S(),A()});function L(){document.querySelectorAll(".dropdown").forEach(t=>{var e;(e=t.querySelector("button"))==null||e.addEventListener("click",s=>{s.stopPropagation(),t.classList.toggle("open")})}),document.addEventListener("click",()=>document.querySelectorAll(".dropdown.open").forEach(t=>t.classList.remove("open")))}function S(){document.querySelectorAll("#regFilterPills .pill").forEach(t=>{t.addEventListener("click",()=>{document.querySelectorAll("#regFilterPills .pill").forEach(e=>e.classList.remove("active")),t.classList.add("active"),n=t.dataset.filter,c()})})}async function A(){const t=document.getElementById("regList");t.innerHTML=`<div style="display:flex;flex-direction:column;gap:16px;">${Array(3).fill(`
    <div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:var(--radius-card);padding:16px;display:flex;gap:16px;">
      <div class="skeleton" style="width:100px;height:120px;border-radius:8px;flex-shrink:0;"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:10px;padding-top:4px;">
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line long"></div>
        <div class="skeleton skeleton-line medium"></div>
      </div>
    </div>`).join("")}</div>`;try{const e=await E.getMyRegs();d=e.registrations||e||[],c()}catch(e){console.error("Failed to load registrations:",e),d=[],c(),y("Could not load registrations.","error")}}function c(){const t=document.getElementById("regList"),e=document.getElementById("regCount"),s=d.filter(i=>{const r=((i.event||i).status||"").toLowerCase();return n==="all"?!0:r===n});if(e&&(e.textContent=`${s.length} registration${s.length!==1?"s":""}`),!s.length){t.innerHTML=`
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <h3 class="empty-state__title">No registrations found</h3>
        <p class="empty-state__text">${n==="all"?"You haven't registered for any events yet.":`No ${n} events.`}</p>
        <a href="events.html" class="btn btn-primary">Browse Events</a>
      </div>`;return}t.innerHTML=s.map(i=>M(i)).join("")}function M(t){var v;const e=t.event||t,s=(e.status||"upcoming").toLowerCase(),i=t.attended!==void 0?t.attended:t.attendance_status==="PRESENT"||t.attendance==="PRESENT",l=t.certificate||{},r=l.certificate_url||t.certificateUrl||t.cert_url,f=r&&(l.generated_status==="YES"||t.hasCert);let p=e.date||e.event_date?$(e.date||e.event_date):"—";if(e.from_time){let u=m(e.from_time);e.to_time&&(u+=" - "+m(e.to_time)),p+=" • "+u}const h=s==="completed"?"badge-success":s==="today"?"badge-warning":"badge-primary",b=s==="completed"?"Completed":s==="today"?"Today":"Upcoming",a=e.poster||e.poster_url;let o=a;return a&&(a.startsWith("http")||a.startsWith("blob:")?o=a:o=((v=g.storage.from("event-posters").getPublicUrl(a).data)==null?void 0:v.publicUrl)||o),`
  <div class="my-reg-card">
    <img class="my-reg-card__thumb"
         src="${o}"
         alt="${e.title||"Event"}" loading="lazy" />
    <div class="my-reg-card__body">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div class="my-reg-card__title">${e.title||"Unknown Event"}</div>
        <span class="badge ${h}">${b}</span>
      </div>
      <div class="my-reg-card__meta">
        <span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${p}
        </span>
        <span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;margin-right:4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${e.venue||"IIC Campus"}
        </span>
        ${s==="completed"&&i!==null&&i!==void 0?`<span>Attendance: <strong style="color:${i?"var(--accent-success)":"var(--accent-danger)"}">${i?"✓ Present":"✗ Absent"}</strong></span>`:""}
      </div>
      <div class="my-reg-card__actions">
        <a href="event-detail.html?id=${e.id||e.event_id||t.eventId}" class="btn btn-secondary btn-sm">View Event</a>
        ${f?`<button onclick="downloadCertificate('${r}')" class="btn btn-success btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Certificate
            </button>`:s==="completed"?'<span class="badge badge-muted">Certificate Pending</span>':""}
      </div>
    </div>
  </div>`}window.downloadCertificate=async t=>{try{const{data:e,error:s}=await g.storage.from("certificates").createSignedUrl(t,60);if(s||!(e!=null&&e.signedUrl))throw new Error("Failed to generate download link");const i=document.createElement("a");i.href=e.signedUrl,i.download=`Certificate_${t.split("/").pop()}`,document.body.appendChild(i),i.click(),document.body.removeChild(i)}catch{y("Failed to download certificate.","error")}};
