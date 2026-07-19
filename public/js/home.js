import api from './api.js';
import { updateNavbar, setActiveNavLink } from './auth.js';
import { initNavbarScroll, initMobileNav, formatDate, formatDateRange, formatTime, showSkeletons } from './utils.js';

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  initMobileNav();
  updateNavbar();
  setActiveNavLink();
  initDropdowns();
  loadAllEvents();
  initFilterPills();
  initSearchBar();
});

/* ── Dropdown Toggle ── */
function initDropdowns() {
  document.querySelectorAll('.dropdown').forEach(dd => {
    const btn = dd.querySelector('button');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dd.classList.toggle('open');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown.open').forEach(dd => dd.classList.remove('open'));
  });
}

/* ── All Events (shared data for carousel + grid) ── */
let allEvents = [];
let homeEvents = [];
let paginatedEventsList = [];
let currentFilter = 'all';
let currentPage = 1;
const PAGE_SIZE = 12;

async function loadAllEvents() {
  const grid = document.getElementById('allEventsGrid');
  if (grid) showSkeletons(grid, PAGE_SIZE);

  try {
    const data = await api.getEvents();
    allEvents = data.events || data || [];
  } catch {
    allEvents = [];
  }
  
  const activeStatuses = ['UPCOMING', 'TODAY'];
  homeEvents = allEvents.filter(e => activeStatuses.includes((e.status || '').toUpperCase()));
  buildCarousel(homeEvents);
  
  // Sort ALL events for the grid: UPCOMING -> TODAY -> COMPLETED
  const statusOrder = { 'UPCOMING': 1, 'TODAY': 2, 'COMPLETED': 3 };
  allEvents.sort((a, b) => {
    const statusA = (a.status || '').toUpperCase();
    const statusB = (b.status || '').toUpperCase();
    const orderA = statusOrder[statusA] || 4;
    const orderB = statusOrder[statusB] || 4;
    return orderA - orderB;
  });

  applyFilterAndRender();
}

function applyFilterAndRender() {
  if (currentFilter === 'all') {
    paginatedEventsList = [...allEvents];
  } else {
    paginatedEventsList = allEvents.filter(e => (e.status || '').toUpperCase() === currentFilter);
  }
  currentPage = 1;
  renderGrid();
}

/* ── Hero Carousel ── */
let carouselTimer = null;
let currentSlide = 0;

function buildCarousel(events) {
  const container = document.getElementById('heroSlides');
  const dotsContainer = document.getElementById('heroDots');
  if (!container) return;

  const slides = events.length > 0 ? events.slice(0, 10) : [{
    event_id: '', title: 'No Upcoming Events', event_date: '', venue: 'Check back soon!', poster: null
  }];

  let bgContainer = document.getElementById('heroBackgrounds');
  if (!bgContainer) {
    bgContainer = document.createElement('div');
    bgContainer.id = 'heroBackgrounds';
    bgContainer.className = 'hp-hero__backgrounds';
    const heroSection = document.getElementById('heroCarousel');
    heroSection.insertBefore(bgContainer, heroSection.firstChild);
  }

  bgContainer.innerHTML = slides.map((ev, i) => {
    const posterUrl = ev.poster || `https://ui-avatars.com/api/?name=${encodeURIComponent(ev.title || 'IIC Event')}&background=1a1a6c&color=ffffff&size=500`;
    return `<div class="hp-hero__bg-item ${i === 0 ? 'active' : ''}" style="background-image: url('${posterUrl}')"></div>`;
  }).join('');

  container.innerHTML = slides.map((ev, i) => {
    const date = formatDateRange(ev.event_date, ev.to_date);
    let time = '';
    if (ev.from_time) {
      time = formatTime(ev.from_time);
      if (ev.to_time) {
        time += ' - ' + formatTime(ev.to_time);
      }
    }
    const category = ev.event_category || 'Event';
    const dateCategoryText = time ? `${date} • ${time}` : (date || '');
    const posterUrl = ev.poster;
    const detailHref = ev.event_id ? `event-detail.html?id=${ev.event_id}` : 'events.html';

    return `
      <div class="hp-hero__slide ${i === 0 ? 'hp-hero__slide--active' : ''}" data-index="${i}" data-poster="${posterUrl}">
        <div class="hp-hero__content-wrapper">
          <div class="hp-hero__info">
            <div class="hp-hero__date-label">${dateCategoryText}</div>
            <h2 class="hp-hero__title">${ev.title || ''}</h2>
            <div class="hp-hero__venue">${ev.venue || ''}</div>
            <div class="hp-hero__price">${category}</div>
            <a href="${detailHref}" class="hp-hero__cta">Register</a>
          </div>
          <div class="hp-hero__poster">
            <img src="${posterUrl}" alt="${ev.title || 'Event Poster'}" />
          </div>
        </div>
      </div>`;
  }).join('');

  // Analyze brightness after DOM insertion
  document.querySelectorAll('.hp-hero__slide').forEach(slide => {
    const posterUrl = slide.dataset.poster;
    if (!posterUrl) return;

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = this.width || 1;
      canvas.height = this.height || 1;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this, 0, 0);
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 40) {
          r += data[i]; g += data[i+1]; b += data[i+2];
        }
        const count = data.length / 40;
        const brightness = ((r / count) * 299 + (g / count) * 587 + (b / count) * 114) / 1000;
        const slideIndex = parseInt(slide.dataset.index);
        const bgItems = document.querySelectorAll('.hp-hero__bg-item');
        const bgItem = bgItems[slideIndex];
        if (brightness < 128) {
          slide.classList.add('hp-hero__slide--dark-bg');
          if (bgItem) bgItem.classList.add('hp-hero__bg-item--dark-bg');
        } else {
          slide.classList.add('hp-hero__slide--light-bg');
          if (bgItem) bgItem.classList.add('hp-hero__bg-item--light-bg');
        }
      } catch (e) {
        slide.classList.add('hp-hero__slide--light-bg');
        const slideIndex = parseInt(slide.dataset.index);
        const bgItems = document.querySelectorAll('.hp-hero__bg-item');
        const bgItem = bgItems[slideIndex];
        if (bgItem) bgItem.classList.add('hp-hero__bg-item--light-bg');
      }
    };
    img.onerror = () => {
      slide.classList.add('hp-hero__slide--light-bg');
      const slideIndex = parseInt(slide.dataset.index);
      const bgItems = document.querySelectorAll('.hp-hero__bg-item');
      const bgItem = bgItems[slideIndex];
      if (bgItem) bgItem.classList.add('hp-hero__bg-item--light-bg');
    };
    img.src = posterUrl;
  });

  // Dots
  if (dotsContainer && slides.length > 1) {
    dotsContainer.innerHTML = slides.map((_, i) =>
      `<button class="hp-hero__dot ${i === 0 ? 'hp-hero__dot--active' : ''}" data-slide="${i}" aria-label="Slide ${i + 1}"></button>`
    ).join('');
    dotsContainer.addEventListener('click', e => {
      const dot = e.target.closest('[data-slide]');
      if (dot) goToSlide(parseInt(dot.dataset.slide));
    });
  }

  // Auto-rotate
  if (slides.length > 1) {
    carouselTimer = setInterval(() => {
      goToSlide((currentSlide + 1) % slides.length);
    }, 5000);
  }

  // Arrows
  const prevBtn = document.getElementById('heroPrevBtn');
  const nextBtn = document.getElementById('heroNextBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (carouselTimer) clearInterval(carouselTimer);
      let idx = currentSlide - 1;
      if (idx < 0) idx = slides.length - 1;
      goToSlide(idx);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (carouselTimer) clearInterval(carouselTimer);
      let idx = (currentSlide + 1) % slides.length;
      goToSlide(idx);
    });
  }
}

function goToSlide(index) {
  currentSlide = index;
  const container = document.getElementById('heroSlides');
  if (container) {
    container.style.transform = `translateX(-${index * 100}%)`;
  }
  document.querySelectorAll('.hp-hero__slide').forEach((s, i) => {
    s.classList.toggle('hp-hero__slide--active', i === index);
  });
  document.querySelectorAll('.hp-hero__dot').forEach((d, i) => {
    d.classList.toggle('hp-hero__dot--active', i === index);
  });
  document.querySelectorAll('.hp-hero__bg-item').forEach((bg, i) => {
    bg.classList.toggle('active', i === index);
  });
}

/* ── Event Grid & Pagination ── */
let loadedRows = 1;
let isLoadingRow = false;
let rowObserver = null;
const ITEMS_PER_ROW = 4;

function generateCardHTML(ev) {
  const date = formatDateRange(ev.event_date, ev.to_date);
  const category = ev.event_category || 'Event';
  let timeStr = '';
  if (ev.from_time) {
    timeStr = formatTime(ev.from_time);
    if (ev.to_time) {
      timeStr += ' - ' + formatTime(ev.to_time);
    }
  }
  const dateCategoryText = timeStr ? `${date} • ${timeStr}` : (date || '');
  const posterUrl = ev.poster;
  const id = ev.event_id || ev.id || '';
  const isCompleted = (ev.status || '').toLowerCase() === 'completed';
  const completedClass = isCompleted ? ' hp-card--completed' : '';

  return `
    <a href="event-detail.html?id=${id}" class="hp-card${completedClass}">
      <div class="hp-card__img">
        <img src="${posterUrl}" alt="${ev.title || ''}" loading="lazy" />
      </div>
      <div class="hp-card__body">
        <div class="hp-card__date">${dateCategoryText}</div>
        <div class="hp-card__title">${ev.title || 'Untitled Event'}</div>
        <div class="hp-card__venue">${ev.venue || ''}</div>
        <div class="hp-card__price">${category}</div>
      </div>
    </a>`;
}

function renderGrid() {
  const grid = document.getElementById('allEventsGrid');
  const empty = document.getElementById('allEventsEmpty');
  const pagination = document.getElementById('allEventsPagination');
  if (!grid) return;

  // Cleanup old observer and sentinel
  if (rowObserver) {
    rowObserver.disconnect();
    rowObserver = null;
  }
  const existingSentinel = document.getElementById('gridSentinel');
  if (existingSentinel) existingSentinel.remove();

  if (!paginatedEventsList || paginatedEventsList.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    if (pagination) pagination.style.display = 'none';
    return;
  }
  if (empty) empty.classList.add('hidden');

  const totalPages = Math.ceil(paginatedEventsList.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  loadedRows = 0;
  isLoadingRow = false;
  
  // Hide pagination while rows are still loading
  if (pagination) pagination.style.display = 'none';

  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageEvents = paginatedEventsList.slice(startIdx, startIdx + PAGE_SIZE);
  const initialEvents = pageEvents.slice(0, ITEMS_PER_ROW);

  // Show skeletons for the first row too
  grid.innerHTML = Array(initialEvents.length).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line long"></div>
        <div class="skeleton skeleton-line medium"></div>
        <div class="skeleton skeleton-btn"></div>
      </div>
    </div>`).join('');

  // After a brief shimmer, replace with real cards
  setTimeout(() => {
    grid.innerHTML = initialEvents.map((ev, i) => {
      const html = generateCardHTML(ev);
      // Inject staggered animation delay
      return html.replace('class="hp-card', `style="--card-delay:${i * 0.08}s" class="hp-card`);
    }).join('');
    loadedRows = 1;

    // Check if we need more rows for this page
    if (pageEvents.length > ITEMS_PER_ROW) {
      // Add Sentinel for IntersectionObserver
      const sentinel = document.createElement('div');
      sentinel.id = 'gridSentinel';
      sentinel.style.width = '100%';
      sentinel.style.height = '10px';
      sentinel.style.gridColumn = '1 / -1';
      grid.parentNode.insertBefore(sentinel, grid.nextSibling);

      rowObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoadingRow && loadedRows < 3) {
          loadNextRow(pageEvents);
        }
      }, { rootMargin: '150px' }); // Trigger slightly before it comes fully into view
      rowObserver.observe(sentinel);
    } else {
      // Show pagination immediately if no more rows needed
      renderPagination(totalPages, pagination);
    }
  }, 400);
}

function loadNextRow(pageEvents) {
  const grid = document.getElementById('allEventsGrid');
  const pagination = document.getElementById('allEventsPagination');
  if (!grid) return;

  isLoadingRow = true;
  
  // 1. Insert Skeletons for exactly 1 row (up to 4 items depending on what's left)
  const startIdx = loadedRows * ITEMS_PER_ROW;
  const nextEvents = pageEvents.slice(startIdx, startIdx + ITEMS_PER_ROW);
  if (nextEvents.length === 0) return;

  const skeletonHtml = Array(nextEvents.length).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line long"></div>
        <div class="skeleton skeleton-line medium"></div>
        <div class="skeleton skeleton-btn"></div>
      </div>
    </div>`).join('');

  const skeletonContainer = document.createElement('div');
  skeletonContainer.style.display = 'contents';
  skeletonContainer.className = 'skeleton-row-container';
  skeletonContainer.innerHTML = skeletonHtml;
  grid.appendChild(skeletonContainer);

  // 2. Simulate delay for Zomato effect, then render real data
  setTimeout(() => {
    // Verify container still exists in case user navigated away super fast
    if (!document.body.contains(skeletonContainer)) return;

    skeletonContainer.remove();
    const cardsHtml = nextEvents.map((ev, i) => {
      const html = generateCardHTML(ev);
      return html.replace('class="hp-card', `style="--card-delay:${i * 0.08}s" class="hp-card`);
    }).join('');
    grid.insertAdjacentHTML('beforeend', cardsHtml);
    
    loadedRows++;
    isLoadingRow = false;

    // Check if we reached the max rows (3) or run out of items on this page
    if (loadedRows >= 3 || (startIdx + ITEMS_PER_ROW) >= pageEvents.length) {
      if (rowObserver) {
        rowObserver.disconnect();
        rowObserver = null;
      }
      const sentinel = document.getElementById('gridSentinel');
      if (sentinel) sentinel.remove();
      
      const totalPages = Math.ceil(paginatedEventsList.length / PAGE_SIZE);
      renderPagination(totalPages, pagination);
    }
  }, 400); // 400ms shimmer delay
}

function renderPagination(totalPages, container) {
  if (!container) return;
  if (totalPages <= 1) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  
  let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
  </button>`;

  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
  </button>`;

  container.innerHTML = html;

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const targetPage = parseInt(btn.dataset.page);
      if (targetPage >= 1 && targetPage <= totalPages) {
        currentPage = targetPage;
        // Re-render grid (which resets to 1 row and starts observing again)
        renderGrid();
        document.getElementById('allEventsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/* ── Filter Pills / Dropdown ── */
function initFilterPills() {
  document.querySelectorAll('.hp-filter-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.hp-filter-item').forEach(p => {
        p.classList.remove('active');
        const icon = p.querySelector('.check-icon');
        if (icon) icon.style.opacity = '0';
      });
      item.classList.add('active');
      const icon = item.querySelector('.check-icon');
      if (icon) icon.style.opacity = '1';
      
      currentFilter = item.dataset.filter;
      applyFilterAndRender();
      
      // Close dropdown
      const dropdown = item.closest('.dropdown');
      if (dropdown) dropdown.classList.remove('open');
    });
  });
}

/* ── Search Bar ── */
function initSearchBar() {
  const searchInput = document.getElementById('homeSearchBar');
  const searchResults = document.getElementById('homeSearchResults');
  
  if (!searchInput || !searchResults) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query.length < 2) {
      searchResults.style.display = 'none';
      return;
    }
    
    const matches = allEvents.filter(ev => 
      (ev.title || '').toLowerCase().includes(query) || 
      (ev.venue || '').toLowerCase().includes(query) ||
      (ev.event_category || '').toLowerCase().includes(query)
    ).slice(0, 5); // top 5 results

    if (matches.length === 0) {
      searchResults.innerHTML = '<div style="padding:12px 16px;color:var(--text-muted);font-size:14px;text-align:center;">No events found</div>';
      searchResults.style.display = 'block';
      return;
    }

    searchResults.innerHTML = matches.map(ev => {
      const posterUrl = ev.poster;
      return `
        <a href="event-detail.html?id=${ev.event_id}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;text-decoration:none;border-bottom:1px solid var(--border-card);transition:background 0.2s;" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
          <img src="${posterUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;" />
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--text-heading);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ev.title}</div>
            <div style="font-size:12px;color:var(--text-muted);">${formatDate(ev.event_date)} • ${ev.venue || 'TBA'}</div>
          </div>
        </a>
      `;
    }).join('');
    
    // Remove last border bottom
    const lastA = searchResults.querySelector('a:last-child');
    if (lastA) lastA.style.borderBottom = 'none';

    searchResults.style.display = 'block';
  });

  // Hide when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });

  // Show again when clicking input if there's a query
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 2) {
      searchResults.style.display = 'block';
    }
  });
}
