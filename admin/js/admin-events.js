/* ============================================================
   admin-events.js — Event Listings & Create Logic integrated
   ============================================================ */

import api from '/js/api.js';
import { supabase } from '/js/supabase-client.js';
import { openModal, closeModal, initModalClose, showToast, formatDate, formatDateRange, formatTime, capitalize, getParam, escapeHTML } from '/js/utils.js';

const PLACEHOLDER_POSTER = 'https://ui-avatars.com/api/?name=Event+Poster&background=1A1A6C&color=ffffff&size=500';

function getPosterUrl(e) {
  const url = e.poster || e.poster_url;
  if (!url) return PLACEHOLDER_POSTER;
  // Already an absolute URL (Supabase Storage CDN URL)
  if (url.startsWith('http') || url.startsWith('blob:')) return url;
  // Supabase Storage path — build public URL
  const { data } = supabase.storage.from('event-posters').getPublicUrl(url);
  return data?.publicUrl || PLACEHOLDER_POSTER;
}

let allEvents = [];
let filteredEvents = [];
let currentFilter = 'upcoming';
let uploadedPosterDataUrl = '';
let createCustomFields = [];

document.addEventListener('DOMContentLoaded', () => {
  initModalClose('createEventModal');

  setupEventListeners();
  setupPosterUpload();
  loadEvents();
});

function setupEventListeners() {
  // Modal open button
  const openBtn = document.getElementById('openCreateEventModalBtn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      resetForm();
      openModal('createEventModal');
    });
  }

  // Filter Pills click handlers
  const filterPills = document.querySelectorAll('#adminEventsFilterPills .pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      applyFiltersAndSearch();
    });
  });

  // Form submission handling
  const form = document.getElementById('createEventForm');
  if (form) {
    form.addEventListener('submit', handleCreateEvent);
  }

  // Add Field Button for Create Event Modal
  const addFieldBtn = document.getElementById('createAddFieldBtn');
  if (addFieldBtn) {
    addFieldBtn.addEventListener('click', () => {
      createCustomFields.push({
        id: Date.now(),
        field_label: '',
        field_type: 'TEXT',
        is_required: 0
      });
      renderCreateFormFields();
    });
  }

  // Fee Type change handler
  const feeTypeSelect = document.getElementById('eventFeeType');
  const feeAmountInput = document.getElementById('eventFeeAmount');
  if (feeTypeSelect && feeAmountInput) {
    feeTypeSelect.addEventListener('change', (e) => {
      if (e.target.value === 'PAID') {
        feeAmountInput.disabled = false;
        feeAmountInput.required = true;
      } else {
        feeAmountInput.disabled = true;
        feeAmountInput.required = false;
        feeAmountInput.value = '';
        validateField(feeAmountInput, true, 'feeError');
      }
    });
  }

  // Coordinators Dynamic Rows
  const addFacultyCoordBtn = document.getElementById('addFacultyCoordBtn');
  const facultyCoordinatorsContainer = document.getElementById('facultyCoordinatorsContainer');
  if (addFacultyCoordBtn) {
    addFacultyCoordBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.innerHTML = `
        <input type="text" class="form-input faculty-name" placeholder="Name (e.g. Dr. John Doe)" required />
        <input type="text" class="form-input faculty-designation" placeholder="Designation" required />
        <button type="button" class="btn btn-secondary remove-coord-btn" style="padding: 0 12px;">&times;</button>
      `;
      row.querySelector('.remove-coord-btn').addEventListener('click', () => row.remove());
      facultyCoordinatorsContainer.appendChild(row);
    });
  }

  const addStudentCoordBtn = document.getElementById('addStudentCoordBtn');
  const studentCoordinatorsContainer = document.getElementById('studentCoordinatorsContainer');
  if (addStudentCoordBtn) {
    addStudentCoordBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.innerHTML = `
        <input type="text" class="form-input student-name" placeholder="Name (e.g. Jane Doe)" required />
        <input type="tel" class="form-input student-phone" placeholder="Phone (e.g. 9876543210)" pattern="^[6-9][0-9]{9}$" title="Must be a valid 10-digit Indian phone number starting with 6-9" required />
        <button type="button" class="btn btn-secondary remove-coord-btn" style="padding: 0 12px;">&times;</button>
      `;
      row.querySelector('.remove-coord-btn').addEventListener('click', () => row.remove());
      studentCoordinatorsContainer.appendChild(row);
    });
  }
}

function renderCreateFormFields() {
  const container = document.getElementById('createCustomFieldsList');
  if (!container) return;

  if (createCustomFields.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); border: 1.5px dashed var(--border-card); border-radius: var(--radius-card); font-size: 13px;">
        No custom fields added. Default fields will be used.
      </div>
    `;
    return;
  }

  container.innerHTML = createCustomFields.map((f, index) => {
    const label = f.field_label || '';
    const type = (f.field_type || 'TEXT').toUpperCase();
    const required = f.is_required === 1;
    const id = f.id;

    return `
      <div class="field-item" style="margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 12px; align-items: center;">
          <input type="text" class="form-input" id="createFieldLabel_${id}" value="${label}" placeholder="Field Label (e.g. Branch)" oninput="updateCreateField(${id}, 'label', this.value)" />
          <select class="form-select" id="createFieldType_${id}" onchange="updateCreateField(${id}, 'type', this.value)">
            <option value="TEXT" ${type === 'TEXT' ? 'selected' : ''}>Single Text</option>
            <option value="EMAIL" ${type === 'EMAIL' ? 'selected' : ''}>Email Address</option>
            <option value="NUMBER" ${type === 'NUMBER' ? 'selected' : ''}>Number</option>
            <option value="TEL" ${type === 'TEL' ? 'selected' : ''}>Phone</option>
            <option value="TEXTAREA" ${type === 'TEXTAREA' ? 'selected' : ''}>Paragraph</option>
          </select>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 13px;">
            <input type="checkbox" id="createFieldReq_${id}" ${required ? 'checked' : ''} onchange="updateCreateField(${id}, 'req', this.checked)" /> Required
          </div>
          <button type="button" class="btn btn-danger btn-sm" onclick="deleteCreateCustomField(${id})" style="padding: 6px;">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

window.updateCreateField = (id, key, val) => {
  const field = createCustomFields.find(f => f.id === id);
  if (!field) return;
  if (key === 'label') field.field_label = val;
  if (key === 'type') field.field_type = val.toUpperCase();
  if (key === 'req') field.is_required = val ? 1 : 0;
};

// Sync all field values from DOM into the array (safety net before submit)
function syncCreateFieldsFromDOM() {
  createCustomFields.forEach(f => {
    const labelEl = document.getElementById(`createFieldLabel_${f.id}`);
    const typeEl = document.getElementById(`createFieldType_${f.id}`);
    const reqEl = document.getElementById(`createFieldReq_${f.id}`);
    if (labelEl) f.field_label = labelEl.value.trim();
    if (typeEl) f.field_type = typeEl.value.toUpperCase();
    if (reqEl) f.is_required = reqEl.checked ? 1 : 0;
  });
}

window.deleteCreateCustomField = (id) => {
  createCustomFields = createCustomFields.filter(f => f.id !== id);
  renderCreateFormFields();
};



// PREMIUM POSTER UPLOAD Drag & Drop Implementation
function setupPosterUpload() {
  const dropzone = document.getElementById('posterDropzone');
  const fileInput = document.getElementById('posterFileInput');
  const placeholder = document.getElementById('dropzonePlaceholder');
  const previewWrap = document.getElementById('posterPreviewWrap');
  const previewImg = document.getElementById('posterPreviewImg');
  const removeBtn = document.getElementById('removePosterBtn');
  const progressContainer = document.getElementById('uploadProgressContainer');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressText = document.getElementById('uploadProgressText');

  if (!dropzone || !fileInput) return;

  // Open file browser on click
  dropzone.addEventListener('click', (e) => {
    if (e.target !== removeBtn && !previewWrap.contains(e.target)) {
      fileInput.click();
    }
  });

  // Drag over
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  // Drag leave
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  // Drop event
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files; // assign drop files to the input
      handleFileSelection(files[0]);
    }
  });

  // Direct file input change
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  });

  // Remove uploaded poster
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetPosterState();
  });

  function handleFileSelection(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Invalid file format. Please upload an image.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size exceeds 5MB limit.', 'error');
      return;
    }

    // Start progress emulation
    progressContainer.classList.remove('hidden');
    placeholder.classList.add('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading poster... 0%';

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        // Load the image into preview
        const reader = new FileReader();
        reader.onload = (e) => {
          uploadedPosterDataUrl = e.target.result;
          previewImg.src = uploadedPosterDataUrl;
          progressContainer.classList.add('hidden');
          previewWrap.classList.remove('hidden');
          showToast('Poster uploaded successfully!', 'success');
        };
        reader.readAsDataURL(file);
      }
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `Uploading poster... ${progress}%`;
    }, 150);
  }

  function resetPosterState() {
    fileInput.value = '';
    uploadedPosterDataUrl = '';
    previewImg.src = '';
    previewWrap.classList.add('hidden');
    progressContainer.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
}

async function loadEvents() {
  const tbody = document.getElementById('adminEventsTableBody');
  if (!tbody) return;

  try {
    const res = await api.getEvents();
    allEvents = res.events || res || [];
    applyFiltersAndSearch();
  } catch (err) {
    console.error('Failed to load events:', err);
    allEvents = [];
    applyFiltersAndSearch();
    showToast('Could not load events from server.', 'error');
  }
}

function applyFiltersAndSearch() {
  filteredEvents = allEvents.filter(e => {
    const status = (e.status || '').toLowerCase();
    // Status Filter
    if (currentFilter === 'upcoming') {
      if (status !== 'upcoming' && status !== 'today') {
        return false;
      }
    } else if (currentFilter === 'completed') {
      if (status !== 'completed' && status !== 'archived') {
        return false;
      }
    }
    return true;
  });

  renderEventsTable();
}

function renderEventsTable() {
  const tbody = document.getElementById('adminEventsTableBody');
  if (!tbody) return;

  if (filteredEvents.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: var(--space-3xl); color: var(--text-muted);">
          No events match the search/filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredEvents.map(e => {
    const status = (e.status || 'upcoming').toLowerCase();
    const type = (e.type || e.event_type || 'internal').toLowerCase();
    const category = (e.event_category || 'Hackathon');
    const statusClass = status === 'upcoming' ? 'badge-upcoming' : status === 'today' ? 'badge-today' : 'badge-completed';
    const isInternal = type === 'internal';
    const typeClass = isInternal ? 'badge-primary' : 'badge-warning';

    return `
      <tr>
        <td style="text-align: center;">
          <div style="font-weight: 600; color: var(--text-heading); text-align: center;">${escapeHTML(e.title)}</div>
        </td>
        <td style="white-space: nowrap; font-weight: 500; text-align: center;">${formatDateRange(e.date || e.event_date, e.to_date)}</td>
        <td style="font-weight: 500; white-space: nowrap; text-align: center;">${formatTime24(e.from_time)}${e.to_time ? ' - ' + formatTime24(e.to_time) : ''}</td>
        <td style="text-align: center;">${escapeHTML(e.venue)}</td>
        <td style="text-align: center;">
          <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
            <span class="badge ${isInternal ? 'badge-internal' : 'badge-external'}">
              ${isInternal ? 'Internal' : 'External'}
            </span>
            <span style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 500;">
              ${escapeHTML(e.event_category || 'Event')}
            </span>
          </div>
        </td>
        <td style="font-weight: 700; text-align: center;">${e.registrationCount || 0}</td>
        <td style="text-align: center;"><span class="badge ${statusClass}">${capitalize(status)}</span></td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 6px; min-width: 80px; margin: 0 auto;">
            <a href="event-detail.html?id=${e.id || e.event_id}" class="btn btn-primary btn-sm">
              Manage
            </a>
            <button class="btn btn-danger btn-sm" onclick="deleteEvent('${e.id || e.event_id}')">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleCreateEvent(e) {
  e.preventDefault();

  // Sync custom field values from DOM before validating
  syncCreateFieldsFromDOM();

  const titleInput = document.getElementById('eventTitle');
  const descInput = document.getElementById('eventDescription');
  const dateInput = document.getElementById('eventDate');
  const toDateInput = document.getElementById('eventToDate');

  const venueInput = document.getElementById('eventVenue');
  const categoryInput = document.getElementById('eventCategory');
  const typeInput = document.getElementById('eventType');
  const fileInput = document.getElementById('posterFileInput');
  const feeTypeInput = document.getElementById('eventFeeType');
  const feeAmountInput = document.getElementById('eventFeeAmount');

  let isValid = true;
  let firstErrorInput = null;

  if (!titleInput.value.trim() || titleInput.value.trim().length < 3) { validateField(titleInput, false, 'titleError', 'Enter a valid Event name'); isValid = false; if (!firstErrorInput) firstErrorInput = titleInput; }
  else { validateField(titleInput, true, 'titleError'); }

  if (!descInput.value.trim()) { validateField(descInput, false, 'descriptionError', 'Description is required'); isValid = false; if (!firstErrorInput) firstErrorInput = descInput; }
  else { validateField(descInput, true, 'descriptionError'); }

  if (!dateInput.value) { validateField(dateInput, false, 'dateError', 'From Date is required'); isValid = false; if (!firstErrorInput) firstErrorInput = dateInput; }
  else {
    const today = new Date().toISOString().split('T')[0];
    if (dateInput.value < today) {
      validateField(dateInput, false, 'dateError', 'From Date cannot be before today');
      isValid = false;
      if (!firstErrorInput) firstErrorInput = dateInput;
    } else {
      validateField(dateInput, true, 'dateError');
    }
  }

  if (!toDateInput.value) { validateField(toDateInput, false, 'toDateError', 'To Date is required'); isValid = false; if (!firstErrorInput) firstErrorInput = toDateInput; }
  else {
    const today = new Date().toISOString().split('T')[0];
    if (toDateInput.value < today) {
      validateField(toDateInput, false, 'toDateError', 'To Date cannot be before today');
      isValid = false;
      if (!firstErrorInput) firstErrorInput = toDateInput;
    } else if (toDateInput.value < dateInput.value) {
      validateField(toDateInput, false, 'toDateError', 'To Date cannot be before From Date');
      isValid = false;
      if (!firstErrorInput) firstErrorInput = toDateInput;
    } else {
      validateField(toDateInput, true, 'toDateError');
    }
  }

  const fromTimeInput = document.getElementById('eventFromTime');
  if (fromTimeInput && !fromTimeInput.value) { validateField(fromTimeInput, false, 'fromTimeError', 'From Time is required'); isValid = false; if (!firstErrorInput) firstErrorInput = fromTimeInput; }
  else if (fromTimeInput) { validateField(fromTimeInput, true, 'fromTimeError'); }

  const toTimeInput = document.getElementById('eventToTime');
  if (fromTimeInput && fromTimeInput.value && toTimeInput && toTimeInput.value && dateInput.value && toDateInput.value) {
    const startDateTime = new Date(`${dateInput.value}T${fromTimeInput.value}`);
    const endDateTime = new Date(`${toDateInput.value}T${toTimeInput.value}`);
    if (endDateTime < startDateTime) {
      validateField(toTimeInput, false, 'toTimeError', 'End date/time cannot be before start date/time');
      isValid = false;
      if (!firstErrorInput) firstErrorInput = toTimeInput;
    } else {
      const diffMins = (endDateTime - startDateTime) / (1000 * 60);
      if (diffMins < 30) {
        validateField(toTimeInput, false, 'toTimeError', 'Event duration must be at least 30 minutes');
        isValid = false;
        if (!firstErrorInput) firstErrorInput = toTimeInput;
      } else {
        validateField(toTimeInput, true, 'toTimeError');
      }
    }
  } else if (toTimeInput) {
    validateField(toTimeInput, true, 'toTimeError');
  }

  if (!venueInput.value.trim()) { validateField(venueInput, false, 'venueError', 'Venue is required'); isValid = false; if (!firstErrorInput) firstErrorInput = venueInput; }
  else { validateField(venueInput, true, 'venueError'); }

  if (!categoryInput.value) { validateField(categoryInput, false, 'categoryError', 'Event Type selection is required'); isValid = false; if (!firstErrorInput) firstErrorInput = categoryInput; }
  else { validateField(categoryInput, true, 'categoryError'); }

  if (!typeInput.value) { validateField(typeInput, false, 'typeError', 'Registration Type is required'); isValid = false; if (!firstErrorInput) firstErrorInput = typeInput; }
  else { validateField(typeInput, true, 'typeError'); }

  if (feeTypeInput && feeTypeInput.value === 'PAID') {
    if (!feeAmountInput.value || feeAmountInput.value <= 0 || !/^\d+$/.test(feeAmountInput.value.trim())) {
      validateField(feeAmountInput, false, 'feeError', 'Valid Integer Fee Amount greater than 0 is required for Paid events');
      isValid = false;
      if (!firstErrorInput) firstErrorInput = feeAmountInput;
    } else {
      validateField(feeAmountInput, true, 'feeError');
    }
  }

  // Validate Registration Deadline
  const deadlineCreateInput = document.getElementById('eventDeadline');
  if (deadlineCreateInput && deadlineCreateInput.value) {
    const today = new Date().toISOString().split('T')[0];
    if (deadlineCreateInput.value < today) {
      validateField(deadlineCreateInput, false, 'deadlineError', 'Registration Deadline cannot be before today');
      isValid = false;
      if (!firstErrorInput) firstErrorInput = deadlineCreateInput;
    } else if (dateInput.value && deadlineCreateInput.value > dateInput.value) {
      validateField(deadlineCreateInput, false, 'deadlineError', 'Registration Deadline cannot be after the event start date');
      isValid = false;
      if (!firstErrorInput) firstErrorInput = deadlineCreateInput;
    } else {
      validateField(deadlineCreateInput, true, 'deadlineError');
    }
  }

  // Validate custom fields
  let customFieldsValid = true;
  createCustomFields.forEach(f => {
    const input = document.getElementById(`createFieldLabel_${f.id}`);
    if (!f.field_label.trim()) {
      customFieldsValid = false;
      if (input) input.style.borderColor = 'var(--accent-danger)';
      if (!firstErrorInput) firstErrorInput = input;
    } else {
      if (input) input.style.borderColor = 'var(--border-input)';
    }
  });

  if (!customFieldsValid) {
    isValid = false;
  }

  if (!isValid) {
    if (firstErrorInput) firstErrorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const saveBtn = document.getElementById('saveEventBtn');
  saveBtn.classList.add('btn-loading');
  saveBtn.textContent = '';

  // Construct FormData mapping directly to modules/events/create_event.php parameters
  const formData = new FormData();
  
  const facultyCoordinators = Array.from(document.querySelectorAll('#facultyCoordinatorsContainer > div')).map(row => {
    return {
      name: row.querySelector('.faculty-name').value.trim(),
      designation: row.querySelector('.faculty-designation').value.trim()
    };
  }).filter(c => c.name && c.designation);

  const studentCoordinators = Array.from(document.querySelectorAll('#studentCoordinatorsContainer > div')).map(row => {
    return {
      name: row.querySelector('.student-name').value.trim(),
      phone: row.querySelector('.student-phone').value.trim()
    };
  }).filter(c => c.name && c.phone);
  
  formData.append('faculty_coordinators', JSON.stringify(facultyCoordinators));
  formData.append('student_coordinators', JSON.stringify(studentCoordinators));
  
  formData.append('title', titleInput.value.trim());
  formData.append('description', descInput.value.trim());
  formData.append('event_date', dateInput.value);
  formData.append('to_date', toDateInput.value);
  formData.append('from_time', document.getElementById('eventFromTime').value);
  formData.append('to_time', document.getElementById('eventToTime').value);
  formData.append('venue', venueInput.value.trim());
  formData.append('event_category', categoryInput.value);
  formData.append('event_type', typeInput.value.toUpperCase());
  if (feeTypeInput) formData.append('fee_type', feeTypeInput.value);
  if (feeTypeInput && feeTypeInput.value === 'PAID' && feeAmountInput) {
    formData.append('fee_amount', feeAmountInput.value);
  }

  const maxCapacityInput = document.getElementById('eventMaxCapacity');
  const deadlineInput = document.getElementById('eventDeadline');
  if (maxCapacityInput && maxCapacityInput.value.trim() !== '') {
    formData.append('max_capacity', maxCapacityInput.value.trim());
  }
  if (deadlineInput && deadlineInput.value) {
    formData.append('registration_deadline', deadlineInput.value);
  }

  if (fileInput.files[0]) {
    formData.append('poster', fileInput.files[0]);
  }

  try {
    const res = await api.createEvent(formData);
    const eventId = res.event_id || res.event?.id || res.event?.event_id;

    if (createCustomFields.length > 0 && eventId) {
      try {
        console.log('Saving custom fields for event:', eventId, createCustomFields);
        const fieldRes = await api.saveFormFields(eventId, createCustomFields);
        console.log('Custom fields saved successfully:', fieldRes);
      } catch (err) {
        console.error('Failed to save custom fields:', err);
        showToast('Event created but custom fields failed to save: ' + (err.message || 'Unknown error'), 'warning');
      }
    } else if (createCustomFields.length > 0 && !eventId) {
      console.error('Event created but event_id not found in response:', res);
      showToast('Event created but could not save custom fields (missing event ID).', 'warning');
    }

    showToast('Event created successfully!', 'success');

    // Build a proper event object for the local list
    const createdEvent = {
      id: eventId,
      event_id: eventId,
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      date: dateInput.value,
      event_date: dateInput.value,
      to_date: toDateInput.value,
      from_time: document.getElementById('eventFromTime').value,
      to_time: document.getElementById('eventToTime').value,
      venue: venueInput.value.trim(),
      event_category: categoryInput.value,
      type: typeInput.value.toUpperCase(),
      event_type: typeInput.value.toUpperCase(),
      status: 'UPCOMING',
      registrationCount: 0,
      poster_url: res.poster_url || null
    };
    allEvents.unshift(createdEvent);
  } catch (err) {
    console.error('Event creation failed:', err);
    showToast('Failed to create event: ' + (err.message || 'Unknown error'), 'error');
  }

  saveBtn.classList.remove('btn-loading');
  saveBtn.textContent = 'Create Event';

  // Dismiss modal, restore state, rebuild tables
  closeModal('createEventModal');
  resetForm();
  applyFiltersAndSearch();
}

window.deleteEvent = async (id) => {
  if (!confirm('Are you absolutely sure you want to delete this event? This action is irreversible.')) return;

  try {
    await api.deleteEvent(id);
    showToast('Event deleted successfully.', 'success');
    allEvents = allEvents.filter(e => (e.id || e.event_id) !== id);
    applyFiltersAndSearch();
  } catch (err) {
    console.error('Failed to delete event:', err);
    showToast('Failed to delete event: ' + (err.message || 'Unknown error'), 'error');
  }
};

function resetForm() {
  document.getElementById('createEventForm').reset();
  const facultyCoordinatorsContainer = document.getElementById('facultyCoordinatorsContainer');
  if (facultyCoordinatorsContainer) facultyCoordinatorsContainer.innerHTML = '';
  const studentCoordinatorsContainer = document.getElementById('studentCoordinatorsContainer');
  if (studentCoordinatorsContainer) studentCoordinatorsContainer.innerHTML = '';
  uploadedPosterDataUrl = '';
  createCustomFields = [];
  renderCreateFormFields();
  
  const fileInput = document.getElementById('posterFileInput');
  if (fileInput) fileInput.value = '';

  // Reset visual error frames
  const inputs = document.querySelectorAll('.form-input, .form-textarea, .form-select');
  inputs.forEach(i => {
    i.classList.remove('error');
    i.classList.remove('success');
  });

  const errors = document.querySelectorAll('.form-error');
  errors.forEach(e => e.classList.add('hidden'));

  // Reset poster upload visualization
  const placeholder = document.getElementById('dropzonePlaceholder');
  const previewWrap = document.getElementById('posterPreviewWrap');
  const progressContainer = document.getElementById('uploadProgressContainer');

  if (placeholder) placeholder.classList.remove('hidden');
  if (previewWrap) previewWrap.classList.add('hidden');
  if (progressContainer) progressContainer.classList.add('hidden');
}

function validateField(input, isValid, errorId, message) {
  const err = document.getElementById(errorId);
  if (isValid) {
    input.classList.remove('error');
    input.classList.add('success');
    if (err) err.classList.add('hidden');
  } else {
    input.classList.add('error');
    input.classList.remove('success');
    if (err) {
      err.textContent = message;
      err.classList.remove('hidden');
    }
  }
}

function formatTime24(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  return `${h}:${m}`;
}
