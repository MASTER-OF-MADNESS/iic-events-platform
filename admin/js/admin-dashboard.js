/* ============================================================
   admin-dashboard.js — Dashboard UI Logic (Real DB Data)
   ============================================================ */

/* ============================================================
   admin-dashboard.js — Dashboard (Supabase backend)
   All api.* calls now go through Supabase SDK via api.js
   ============================================================ */
import api from '/js/api.js';
import { animateCounter, formatDate, capitalize, escapeHTML, formatTime } from '/js/utils.js';

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
});

async function loadDashboardData() {
  let stats = null;

  try {
    stats = await api.getStats();
    updateMetrics(stats);
  } catch (err) {
    console.warn("Could not fetch metrics from API", err);
    const fallbackStats = {
      totalEvents: 0,
      upcomingEvents: 0,
      totalRegistrations: 0,
      certificatesGenerated: 0,
      weeklyRegistrations: [0, 0, 0, 0, 0, 0, 0],
      typeBreakdown: {}
    };
    updateMetrics(fallbackStats);
    stats = fallbackStats;
  }

  // Update chart and breakdown with real data
  updateBarChart(stats.weeklyRegistrations || [0, 0, 0, 0, 0, 0, 0]);

  try {
    const allEventsRes = await api.getEvents();
    const allEvents = allEventsRes.events || allEventsRes || [];
    renderUpcomingEvents(allEvents);
    renderRecentEvents(allEvents);
  } catch (err) {
    console.warn("Could not fetch events", err);
    renderUpcomingEvents([]);
    renderRecentEvents([]);
  }
}

function renderUpcomingEvents(events) {
  const container = document.getElementById('upcomingEventsList');
  if (!container) return;

  const upcoming = events.filter(e => ['upcoming', 'today'].includes((e.status || '').toLowerCase()));

  if (!upcoming || upcoming.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: var(--space-xl); color: var(--text-muted);">
          No upcoming events scheduled.
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = upcoming.map(e => {
    const typeClass = (e.type || e.event_type || '').toLowerCase() === 'internal' ? 'badge-primary' : 'badge-warning';

    const formatTime = t => {
      if (!t) return '';
      const [h, m] = t.split(':');
      return `${h}:${m}`;
    };
    const timeStr = formatTime(e.from_time) + (e.to_time ? ' - ' + formatTime(e.to_time) : '');

    return `
      <tr>
        <td style="text-align: center;">
          <div style="font-weight: 600; color: var(--text-heading); text-align: center;">${escapeHTML(e.title)}</div>
        </td>
        <td style="white-space: nowrap; text-align: center;">${formatDate(e.date || e.event_date)}</td>
        <td style="white-space: nowrap; text-align: center;">${timeStr}</td>
        <td style="text-align: center;">${escapeHTML(e.venue || 'TBD')}</td>
        <td style="text-align: center;"><span class="badge ${typeClass}">${capitalize(e.type || e.event_type)}</span></td>
        <td style="font-weight: 700; color: var(--text-heading); text-align: center;">${e.registrationCount || 0}</td>
      </tr>
    `;
  }).join('');
}

function updateMetrics(stats) {
  const totalEventsEl = document.getElementById('statTotalEvents');
  const upcomingEventsEl = document.getElementById('statUpcomingEvents');
  const totalRegsEl = document.getElementById('statTotalRegistrations');
  const certsEl = document.getElementById('statCertificates');

  if (totalEventsEl) animateCounter(totalEventsEl, stats.totalEvents || 0);
  if (upcomingEventsEl) animateCounter(upcomingEventsEl, stats.upcomingEvents || 0);
  if (totalRegsEl) animateCounter(totalRegsEl, stats.totalRegistrations || 0);
  if (certsEl) animateCounter(certsEl, stats.certificatesGenerated || stats.certificatesIssued || 0);
}

/* ── Bar Chart (Weekly Registrations) ── */
function updateBarChart(weeklyData) {
  const bars = document.querySelectorAll('.analytics-chart-mock__bar');
  const totalEl = document.getElementById('chartWeeklyTotal');

  const max = Math.max(...weeklyData, 1); // avoid division by zero
  const total = weeklyData.reduce((a, b) => a + b, 0);

  bars.forEach((bar, i) => {
    const val = weeklyData[i] || 0;
    const pct = Math.max((val / max) * 100, 2); // min 2% so bar is visible
    bar.style.height = `${pct}%`;
    bar.setAttribute('data-value', val);
  });

  if (totalEl) {
    totalEl.textContent = `${total} registrations`;
  }
}


/* ── Recent Events Table ── */
function renderRecentEvents(events) {
  const tbody = document.getElementById('recentEventsTableBody');
  if (!tbody) return;

  const completedEvents = (events || []).filter(e => (e.status || '').toLowerCase() === 'completed');

  if (completedEvents.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: var(--space-xl); color: var(--text-muted);">
          No completed events found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = completedEvents.map(e => {
    const typeClass = (e.type || e.event_type || '').toLowerCase() === 'internal' ? 'badge-primary' : 'badge-warning';

    const formatTime = t => {
      if (!t) return '';
      const [h, m] = t.split(':');
      return `${h}:${m}`;
    };
    const timeStr = formatTime(e.from_time) + (e.to_time ? ' - ' + formatTime(e.to_time) : '');

    return `
      <tr>
        <td style="text-align: center;">
          <div style="font-weight: 600; color: var(--text-heading); text-align: center;">${escapeHTML(e.title)}</div>
        </td>
        <td style="white-space: nowrap; text-align: center;">${formatDate(e.date || e.event_date)}</td>
        <td style="white-space: nowrap; text-align: center;">${timeStr}</td>
        <td style="text-align: center;">${escapeHTML(e.venue || 'TBD')}</td>
        <td style="text-align: center;"><span class="badge ${typeClass}">${capitalize(e.type || e.event_type)}</span></td>
        <td style="font-weight: 700; color: var(--text-heading); text-align: center;">${e.registrationCount || 0}</td>
      </tr>
    `;
  }).join('');
}
