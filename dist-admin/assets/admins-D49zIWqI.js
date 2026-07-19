import{a as r}from"./api-l1vd3iEV.js";import{s as a,o as m,g as l,i as c,c as u,f as y}from"./admin-auth-CT3N1p0P.js";import"https://esm.sh/@supabase/supabase-js@2.49.4";let o=[];const i=()=>{const t=l();if(!t||t.role!=="SUPER_ADMIN"){window.location.replace("index.html");return}c("addAdminModal"),s();const e=document.getElementById("addAdminForm");e&&e.addEventListener("submit",p)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",i):i();async function s(){const t=document.getElementById("adminsTableBody");if(t){t.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Loading admins...</td></tr>';try{const e=await r.getAdmins();o=e.admins||e||[],g()}catch(e){console.error("Failed to load admins:",e),t.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--accent-danger)">Failed to load admins.</td></tr>'}}}function g(){const t=document.getElementById("adminsTableBody");if(!t)return;if(o.length===0){t.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">No admins found.</td></tr>';return}const e=l();t.innerHTML=o.map(n=>{const d=e&&(e.id===(n.admin_id||n.id)||e.email===n.email);return`
      <tr>
        <td style="text-align: center;">
          <div style="font-weight:600;color:var(--text-heading);text-align: center;">${n.name}</div>
        </td>
        <td style="text-align: center;">${(n.email||"").toLowerCase()}</td>
        <td style="text-align: center;">
          <span class="badge badge-internal" style="text-transform: none;">${n.role==="SUPER_ADMIN"?"Super Admin":"Admin"}</span>
        </td>
        <td style="text-align: center;">${n.created_at?y(n.created_at):"—"}</td>
        <td style="text-align: center;">
          <div style="display:flex;gap:8px;justify-content: center;">
            ${d?'<span style="color:var(--text-muted);font-size:var(--text-sm);margin: 0 auto;">—</span>':`
            <button class="btn btn-secondary btn-sm" style="color:var(--accent-danger);border-color:var(--accent-danger);margin: 0 auto;" onclick="removeAdmin('${n.admin_id||n.id}')">
              Remove
            </button>
            `}
          </div>
        </td>
      </tr>
    `}).join("")}async function p(t){t.preventDefault();const e=document.getElementById("saveAdminBtn");e.classList.add("btn-loading"),e.textContent="";const n={name:document.getElementById("adminName").value.trim(),email:document.getElementById("adminEmail").value.trim(),password:document.getElementById("adminPassword").value,role:document.getElementById("adminRole").value};try{const d=await r.addAdmin(n);a(d.message||"Admin added successfully","success"),u("addAdminModal"),document.getElementById("addAdminForm").reset(),s()}catch(d){a(d.message||"Failed to add admin","error")}finally{e.classList.remove("btn-loading"),e.textContent="Add Admin"}}window.removeAdmin=async t=>{if(confirm("Are you sure you want to remove this admin? They will immediately lose access to the admin dashboard."))try{const e=await r.removeAdmin(t);a(e.message||"Admin removed successfully","success"),s()}catch(e){a(e.message||"Failed to remove admin","error")}};window.openModal=m;
