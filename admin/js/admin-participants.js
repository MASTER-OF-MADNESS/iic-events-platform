/**
 * admin-participants.js
 * Handles fetching events, displaying event list, and viewing participants for a selected event.
 */
import api from '/js/api.js';
import { formatDate, capitalize, showToast, getParam, escapeHTML } from '/js/utils.js';

// ── State ──
let allEvents = [];
let currentEvent = null;
let eventRegistrations = [];
let filteredRegistrations = [];
let customFields = [];

// ── DOM Elements ──
const views = {
  events: document.getElementById('eventsView'),
  participants: document.getElementById('participantsView')
};
const eventsListBody = document.getElementById('eventsListBody');
const participantsTableHeader = document.getElementById('participantsTableHeader');
const participantsTableBody = document.getElementById('participantsTableBody');

const searchInput = document.getElementById('participantSearchInput');
const statusFilter = document.getElementById('participantStatusFilter');
const backBtn = document.getElementById('backToEventsBtn');
const importBtn = document.getElementById('importParticipantsBtn');
const importCsvInput = document.getElementById('importCsvInput');

const statTotal = document.getElementById('statTotalParticipants');
const statPresent = document.getElementById('statPresentCount');
const statPending = document.getElementById('statPendingCount');
const currentEventTitle = document.getElementById('currentEventTitle');

// ── Init ──
async function init() {
  bindEvents();
  
  // Check for search query in URL
  const urlSearch = getParam('search');
  if (urlSearch && searchInput) {
    searchInput.value = urlSearch;
  }
  
  await loadEvents();
}

function bindEvents() {
  backBtn?.addEventListener('click', showEventsList);
  importBtn?.addEventListener('click', () => importCsvInput?.click());
  importCsvInput?.addEventListener('change', importCSV);
  
  searchInput?.addEventListener('input', (e) => {
    applyFilters();
    showSuggestions(e.target.value);
  });
  statusFilter?.addEventListener('change', applyFilters);
}

// ── Events List ──
async function loadEvents() {
  try {
    const res = await api.getEvents();
    const fetchedEvents = res.events || res || [];
    
    allEvents = fetchedEvents;
    
    // Sort events by date descending so newest are on top (optional but good UX)
    allEvents.sort((a, b) => {
      const dateA = new Date(a.date || a.event_date);
      const dateB = new Date(b.date || b.event_date);
      return dateB - dateA;
    });

    renderEventsTable();
  } catch (err) {
    console.error('Failed to load events', err);
    eventsListBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--accent-danger);font-size:13px;">Failed to load events.</td></tr>`;
  }
}

function renderEventsTable() {
  if (!eventsListBody) return;

  if (allEvents.length === 0) {
    eventsListBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:48px;color:#64748B;font-size:13px;">No events found on the platform.</td></tr>';
    return;
  }

  eventsListBody.innerHTML = allEvents.map(e => {
    const type = (e.type || e.event_type || 'internal').toLowerCase();
    const typeClass = type === 'internal' ? 'badge-primary' : 'badge-warning';

    return `
      <tr>
        <td style="font-weight:600;color:var(--text-heading);text-align: center;">${escapeHTML(e.title)}</td>
        <td style="text-align: center;">${formatDate(e.date || e.event_date)}</td>
        <td style="text-align: center;">${escapeHTML(e.venue || '—')}</td>
        <td style="text-align: center;"><span class="badge ${typeClass}">${escapeHTML(capitalize(type))}</span></td>
        <td style="font-weight:700;text-align: center;">${e.registrationCount || 0}</td>
        <td style="text-align: center;">
          <button class="btn btn-primary btn-sm" onclick="viewEventParticipants('${e.id || e.event_id}')" style="margin: 0 auto;">
            Upload Attendance
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Participants List ──
window.viewEventParticipants = async (eventId) => {
  currentEvent = allEvents.find(e => (e.id || e.event_id) == eventId);
  if (!currentEvent) return;

  // UI transition
  views.events.style.display = 'none';
  views.participants.style.display = 'block';
  importBtn.style.display = 'inline-flex';
  
  currentEventTitle.textContent = currentEvent.title;
  participantsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:48px;color:var(--text-muted);">Loading participants...</td></tr>`;
  
  // Reset filters if not already set by URL
  const urlSearch = getParam('search');
  if (!urlSearch) {
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
  }

  try {
    // Try to get form fields for custom columns
    try {
      const formData = await api.getFormFields(eventId);
      customFields = formData.form?.fields || formData.fields || [];
    } catch {
      customFields = [];
    }

    // Get registrations/attendance
    const res = await api.getEventRegs(eventId);
    const rawList = res.attendance || res.registrations || [];
    
    eventRegistrations = rawList.map(r => ({
      name: r.participant_name || r.name || '',
      email: r.participant_email || r.email || '',
      registered_at: r.registered_at || r.createdAt || r.dateApplied || '',
      attendance_status: r.attendance_status || 'ABSENT',
      ...r
    }));
    
    updateStats();
    applyFilters();
  } catch (err) {
    console.error('Failed to load participants', err);
    participantsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:48px;color:var(--accent-danger);">Failed to load participants.</td></tr>`;
  }
};

function showEventsList() {
  views.participants.style.display = 'none';
  views.events.style.display = 'block';
  importBtn.style.display = 'none';
  currentEvent = null;
}

function updateStats() {
  if (statTotal) statTotal.textContent = eventRegistrations.length;
  if (statPresent) statPresent.textContent = eventRegistrations.filter(p => p.attendance_status === 'PRESENT').length;
  if (statPending) statPending.textContent = eventRegistrations.filter(p => p.attendance_status !== 'PRESENT').length;
}

function applyFilters() {
  const query = (searchInput?.value || '').toLowerCase();
  const status = statusFilter?.value || '';

  filteredRegistrations = eventRegistrations.filter(p => {
    const matchSearch = !query || p.name.toLowerCase().includes(query) || p.email.toLowerCase().includes(query);
    const matchStatus = !status || p.attendance_status === status;
    return matchSearch && matchStatus;
  });

  renderParticipantsTable();
}

function renderParticipantsTable() {
  if (!participantsTableBody || !participantsTableHeader) return;

  // Build Headers
  const baseHeaders = ['Name', 'Email', 'Date Applied'];
  const customLabels = customFields.map(f => f.field_label || f.label);
  const allHeaders = [...baseHeaders, ...customLabels];

  participantsTableHeader.innerHTML = allHeaders.map(h => `<th style="text-align: center;">${escapeHTML(h)}</th>`).join('') + `<th style="width: 150px; text-align: center;">Attendance Status</th>`;

  if (filteredRegistrations.length === 0) {
    participantsTableBody.innerHTML = `<tr><td colspan="${allHeaders.length + 1}" style="text-align:center;padding:48px;color:#64748B;font-size:13px;">No participants match your filters.</td></tr>`;
    return;
  }

  participantsTableBody.innerHTML = filteredRegistrations.map(p => {
    const isPresent = p.attendance_status === 'PRESENT';
    const badgeClass = isPresent ? 'badge-success' : 'badge-danger';
    const statusText = isPresent ? 'Present' : 'Absent';
    
    const cells = [
      `<td style="font-weight:600;color:var(--text-heading);text-align: center;">${escapeHTML(p.name || '—')}</td>`,
      `<td style="text-align: center;">${escapeHTML(p.email || '—')}</td>`,
      `<td style="text-align: center;">${formatDate(p.registered_at)}</td>`
    ];

    // Add custom field cells
    customFields.forEach(f => {
      const label = f.field_label || f.label;
      const answer = (p.customAnswers && p.customAnswers[label]) || p[label] || '—';
      cells.push(`<td style="text-align: center;">${escapeHTML(answer)}</td>`);
    });

    // Add static attendance status badge
    cells.push(`
      <td style="text-align: center;">
        <span class="badge ${isPresent ? 'badge-success' : 'badge-danger'}">
          ${isPresent ? 'Present' : 'Absent'}
        </span>
      </td>
    `);

    return `<tr>${cells.join('')}</tr>`;
  }).join('');
}

window.toggleStudentAttendance = async (registrationId, isChecked) => {
  const status = isChecked ? 'PRESENT' : 'ABSENT';
  try {
    await api.toggleAttendance(registrationId, status);
    const reg = eventRegistrations.find(r => r.registration_id == registrationId || r.id == registrationId);
    if (reg) reg.attendance_status = status;
    updateStats();
    showToast(`Attendance marked as ${status}`, 'success');
    renderParticipantsTable(); // Refresh table to update colors/labels
  } catch (err) {
    showToast(err.message || 'Failed to update attendance.', 'error');
    renderParticipantsTable(); // Revert toggle visually on error
  }
};

async function importCSV(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const csvData = event.target.result;
    const lines = csvData.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
      showToast('Invalid or empty CSV file.', 'error');
      return;
    }
    
    const rows = lines.map(row => {
      const cells = [];
      let inQuotes = false;
      let curr = '';
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"' && row[i+1] === '"') {
          curr += '"';
          i++;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(curr.trim());
          curr = '';
        } else {
          curr += char;
        }
      }
      cells.push(curr.trim());
      return cells;
    });

    const headers = rows[0].map(h => h.toLowerCase());
    const nameIndex = headers.findIndex(h => h.includes('name'));
    const regIndex = headers.findIndex(h => h.includes('registration number') || h.includes('reg no') || h.includes('reg') || h.includes('registration'));
    
    let importedCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || row.join('') === '') continue;

      const name = nameIndex >= 0 ? row[nameIndex].toLowerCase() : '';
      const regNo = regIndex >= 0 ? row[regIndex].toLowerCase() : '';

      const match = eventRegistrations.find(p => {
        const pName = (p.name || '').toLowerCase().trim();
        
        let customRegNo = '';
        if (p.customAnswers) {
          const regKey = Object.keys(p.customAnswers).find(k => k.toLowerCase().includes('reg'));
          if (regKey) customRegNo = p.customAnswers[regKey];
        }
        
        let rootRegNo = p.registration_number || '';
        if (!rootRegNo) {
          const rKey = Object.keys(p).find(k => k.toLowerCase().includes('reg') && k !== 'registered_at' && k !== 'registration_id');
          if (rKey) rootRegNo = p[rKey];
        }
        
        const pRegNo = (rootRegNo || customRegNo || '').toString().toLowerCase().trim();
        const cleanRegNo = regNo.trim();
        const cleanName = name.trim();
        
        return (cleanRegNo && pRegNo && pRegNo === cleanRegNo) || (cleanName && pName && pName === cleanName);
      });

      if (match && match.attendance_status !== 'PRESENT') {
        try {
          await api.toggleAttendance(match.registration_id || match.id, 'PRESENT');
          match.attendance_status = 'PRESENT';
          importedCount++;
        } catch (err) {
          console.error('Failed to mark present for', match.name, err);
        }
      }
    }

    updateStats();
    renderParticipantsTable();
    showToast(`Successfully marked ${importedCount} participants as present!`, 'success');
  };
  
  reader.readAsText(file);
  e.target.value = '';
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ── Autocomplete ──
const suggestionsBox = document.getElementById('searchSuggestions');
function showSuggestions(query) {
  if (!suggestionsBox) return;
  if (!query) {
    suggestionsBox.style.display = 'none';
    return;
  }
  
  // Find names matching exactly the start of the word
  const matches = [...new Set(eventRegistrations
    .map(p => p.name || '')
    .filter(name => name.toLowerCase().startsWith(query.toLowerCase()))
  )].slice(0, 5); // Limit to 5 suggestions
  
  if (matches.length === 0) {
    suggestionsBox.style.display = 'none';
    return;
  }
  
  suggestionsBox.innerHTML = matches.map(name => `
    <div style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text-body); border-bottom: 1px solid var(--border-color);"
         onmouseover="this.style.backgroundColor='var(--bg-secondary)'"
         onmouseout="this.style.backgroundColor='white'"
         onclick="selectSuggestion('${escapeHTML(name)}')">
      ${escapeHTML(name)}
    </div>
  `).join('');
  
  suggestionsBox.style.display = 'block';
}

window.selectSuggestion = (name) => {
  if (searchInput) {
    searchInput.value = name;
    applyFilters();
  }
  if (suggestionsBox) {
    suggestionsBox.style.display = 'none';
  }
};

// Close suggestions if clicked outside
document.addEventListener('click', (e) => {
  if (suggestionsBox && searchInput && !searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = 'none';
  }
});
