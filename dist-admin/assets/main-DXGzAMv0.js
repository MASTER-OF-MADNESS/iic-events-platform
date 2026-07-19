import{a as m}from"./api-l1vd3iEV.js";import{e as d,f as v,a as f,h as l}from"./admin-auth-CT3N1p0P.js";import"https://esm.sh/@supabase/supabase-js@2.49.4";document.addEventListener("DOMContentLoaded",()=>{h()});async function h(){let n=null;try{n=await m.getStats(),u(n)}catch(e){console.warn("Could not fetch metrics from API",e);const a={totalEvents:0,upcomingEvents:0,totalRegistrations:0,certificatesGenerated:0,weeklyRegistrations:[0,0,0,0,0,0,0],typeBreakdown:{}};u(a),n=a}E(n.weeklyRegistrations||[0,0,0,0,0,0,0]);try{const e=await m.getEvents(),a=e.events||e||[];p(a),y(a)}catch(e){console.warn("Could not fetch events",e),p([]),y([])}}function p(n){const e=document.getElementById("upcomingEventsList");if(!e)return;const a=n.filter(t=>["upcoming","today"].includes((t.status||"").toLowerCase()));if(!a||a.length===0){e.innerHTML=`
      <tr>
        <td colspan="6" style="text-align: center; padding: var(--space-xl); color: var(--text-muted);">
          No upcoming events scheduled.
        </td>
      </tr>
    `;return}e.innerHTML=a.map(t=>{const r=(t.type||t.event_type||"").toLowerCase()==="internal"?"badge-primary":"badge-warning",o=s=>{if(!s)return"";const[c,g]=s.split(":");return`${c}:${g}`},i=o(t.from_time)+(t.to_time?" - "+o(t.to_time):"");return`
      <tr>
        <td style="text-align: center;">
          <div style="font-weight: 600; color: var(--text-heading); text-align: center;">${d(t.title)}</div>
        </td>
        <td style="white-space: nowrap; text-align: center;">${v(t.date||t.event_date)}</td>
        <td style="white-space: nowrap; text-align: center;">${i}</td>
        <td style="text-align: center;">${d(t.venue||"TBD")}</td>
        <td style="text-align: center;"><span class="badge ${r}">${f(t.type||t.event_type)}</span></td>
        <td style="font-weight: 700; color: var(--text-heading); text-align: center;">${t.registrationCount||0}</td>
      </tr>
    `}).join("")}function u(n){const e=document.getElementById("statTotalEvents"),a=document.getElementById("statUpcomingEvents"),t=document.getElementById("statTotalRegistrations"),r=document.getElementById("statCertificates");e&&l(e,n.totalEvents||0),a&&l(a,n.upcomingEvents||0),t&&l(t,n.totalRegistrations||0),r&&l(r,n.certificatesGenerated||n.certificatesIssued||0)}function E(n){const e=document.querySelectorAll(".analytics-chart-mock__bar"),a=document.getElementById("chartWeeklyTotal"),t=Math.max(...n,1),r=n.reduce((o,i)=>o+i,0);e.forEach((o,i)=>{const s=n[i]||0,c=Math.max(s/t*100,2);o.style.height=`${c}%`,o.setAttribute("data-value",s)}),a&&(a.textContent=`${r} registrations`)}function y(n){const e=document.getElementById("recentEventsTableBody");if(!e)return;const a=(n||[]).filter(t=>(t.status||"").toLowerCase()==="completed");if(a.length===0){e.innerHTML=`
      <tr>
        <td colspan="6" style="text-align: center; padding: var(--space-xl); color: var(--text-muted);">
          No completed events found.
        </td>
      </tr>
    `;return}e.innerHTML=a.map(t=>{const r=(t.type||t.event_type||"").toLowerCase()==="internal"?"badge-primary":"badge-warning",o=s=>{if(!s)return"";const[c,g]=s.split(":");return`${c}:${g}`},i=o(t.from_time)+(t.to_time?" - "+o(t.to_time):"");return`
      <tr>
        <td style="text-align: center;">
          <div style="font-weight: 600; color: var(--text-heading); text-align: center;">${d(t.title)}</div>
        </td>
        <td style="white-space: nowrap; text-align: center;">${v(t.date||t.event_date)}</td>
        <td style="white-space: nowrap; text-align: center;">${i}</td>
        <td style="text-align: center;">${d(t.venue||"TBD")}</td>
        <td style="text-align: center;"><span class="badge ${r}">${f(t.type||t.event_type)}</span></td>
        <td style="font-weight: 700; color: var(--text-heading); text-align: center;">${t.registrationCount||0}</td>
      </tr>
    `}).join("")}
