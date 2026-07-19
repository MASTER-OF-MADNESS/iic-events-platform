/* ============================================================
   admin-event-detail.js — Detail parameters & dynamic tabs integrated
   ============================================================ */

import api from '/js/api.js';
import { supabase } from '/js/supabase-client.js';
import { getParam, formatDate, showToast, escapeHTML } from '/js/utils.js';

function getPosterUrl(e) {
  const url = e.poster || e.poster_url;
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('blob:')) return url;
  const { data } = supabase.storage.from('event-posters').getPublicUrl(url);
  return data?.publicUrl || null;
}

let eventId = null;
let eventData = null;
let customFields = [];
let registrationsList = [];

// Certificates Counters
let certPending = 0;
let certGenerated = 0;
let certSent = 0;

document.addEventListener('DOMContentLoaded', () => {
  eventId = getParam('id');
  if (!eventId) {
    window.location.href = 'events.html';
    return;
  }

  setupTabs();
  setupFormBuilder();
  setupCertificatePanel();
  setupCoordinatorButtons();
  loadEventDetail();
});

function setupCoordinatorButtons() {
  const editAddFacultyCoordBtn = document.getElementById('editAddFacultyCoordBtn');
  if (editAddFacultyCoordBtn) {
    editAddFacultyCoordBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.innerHTML = `
        <input type="text" class="form-input faculty-name" placeholder="Name (e.g. Dr. John Doe)" required />
        <input type="text" class="form-input faculty-designation" placeholder="Designation" required />
        <button type="button" class="btn btn-secondary remove-coord-btn" style="padding: 0 12px;">&times;</button>
      `;
      row.querySelector('.remove-coord-btn').addEventListener('click', () => row.remove());
      document.getElementById('editFacultyCoordinatorsContainer').appendChild(row);
    });
  }

  const editAddStudentCoordBtn = document.getElementById('editAddStudentCoordBtn');
  if (editAddStudentCoordBtn) {
    editAddStudentCoordBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.innerHTML = `
        <input type="text" class="form-input student-name" placeholder="Name (e.g. Jane Doe)" required />
        <input type="tel" class="form-input student-phone" placeholder="Phone (e.g. 9876543210)" pattern="^[6-9][0-9]{9}$" title="Must be a valid 10-digit Indian phone number starting with 6-9" required />
        <button type="button" class="btn btn-secondary remove-coord-btn" style="padding: 0 12px;">&times;</button>
      `;
      row.querySelector('.remove-coord-btn').addEventListener('click', () => row.remove());
      document.getElementById('editStudentCoordinatorsContainer').appendChild(row);
    });
  }
}


// Setup admin dynamic tab switches
function setupTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPanel = document.getElementById(`panel-${tab.dataset.tab}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }

      // Re-render placeholders if switching to certificates tab
      if (tab.dataset.tab === 'certificates' && typeof renderPlaceholders === 'function') {
        // slight timeout to allow the DOM to render the block display and get a non-zero clientWidth
        setTimeout(() => renderPlaceholders(), 50);
      }
    });
  });
}

async function loadEventDetail() {
  try {
    const data = await api.getEvent(eventId);
    eventData = data.event || data;
    
    // Load custom form schema
    try {
      const formData = await api.getFormFields(eventId);
      customFields = formData.form?.fields || formData.fields || [];
    } catch {
      customFields = eventData.formFields || [];
    }

    renderDetails(eventData);
  } catch (err) {
    console.error('Failed to load event:', err);
    showToast('Could not load event details.', 'error');
    window.location.href = 'events.html';
  }
}

async function renderDetails(e) {
  // Global Headings
  const topbarTitle = document.getElementById('topbarEventTitle');
  const topbarBadge = document.getElementById('adminEventStatusBadge');
  if (topbarTitle) topbarTitle.textContent = e.title;
  if (topbarBadge) {
    const status = (e.status || 'upcoming').toLowerCase();
    topbarBadge.textContent = status.toUpperCase();
    topbarBadge.className = `badge ${status === 'upcoming' ? 'badge-upcoming' : status === 'today' ? 'badge-today' : 'badge-completed'}`;
  }

  // Hide Certificates tab if event is not completed
  const certTabBtn = document.querySelector('.admin-tab[data-tab="certificates"]');
  if (certTabBtn) {
    const status = (e.status || '').toLowerCase();
    const eventDate = new Date(e.date || e.event_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    if (status === 'completed' || status === 'archived' || eventDate < now) {
      certTabBtn.style.display = 'block'; // or 'inline-block' depending on CSS, but it uses display:flex for container so block is fine
    } else {
      certTabBtn.style.display = 'none';
    }
  }

  // Panel 1: Event Info inputs
  document.getElementById('editTitle').value = e.title || '';
  document.getElementById('editDescription').value = e.description || '';
  document.getElementById('editDate').value = e.date || e.event_date || '';
  document.getElementById('editToDate').value = e.to_date || '';
  document.getElementById('editFromTime').value = e.from_time || e.time || '';
  document.getElementById('editToTime').value = e.to_time || '';
  document.getElementById('editVenue').value = e.venue || '';
  document.getElementById('editCategory').value = e.event_category || e.category || 'Hackathon';
  document.getElementById('editType').value = (e.type || e.event_type || 'internal').toLowerCase();
  document.getElementById('editCapacity').value = e.max_capacity || '';

  // ── Dynamic date picker constraints ──
  const todayStr = new Date().toISOString().split('T')[0];
  const editDateEl = document.getElementById('editDate');
  const editToDateEl = document.getElementById('editToDate');
  const editDeadlineEl = document.getElementById('editDeadline');

  editDateEl.removeAttribute('min');
  editToDateEl.setAttribute('min', editDateEl.value || '');
  editDeadlineEl.removeAttribute('min');
  if (editDateEl.value) editDeadlineEl.setAttribute('max', editDateEl.value);

  editDateEl.addEventListener('change', () => {
    const fromVal = editDateEl.value;
    editToDateEl.setAttribute('min', fromVal || '');
    if (editDateEl.value) editDeadlineEl.setAttribute('max', fromVal);
    // If To Date is now before From Date, clear it
    if (editToDateEl.value && editToDateEl.value < fromVal) editToDateEl.value = fromVal;
    // If Deadline is now after From Date, clear it
    if (editDeadlineEl.value && editDeadlineEl.value > fromVal) editDeadlineEl.value = fromVal;
  });

  const feeTypeEl = document.getElementById('editFeeType');
  const feeAmountEl = document.getElementById('editFeeAmount');
  if (feeTypeEl) feeTypeEl.value = e.fee_type || 'FREE';
  if (feeAmountEl && feeTypeEl) {
    feeAmountEl.value = e.fee_amount || '';
    if (feeTypeEl.value === 'PAID') {
      feeAmountEl.disabled = false;
      feeAmountEl.required = true;
    } else {
      feeAmountEl.disabled = true;
      feeAmountEl.required = false;
    }
    
    feeTypeEl.addEventListener('change', (ev) => {
      if (ev.target.value === 'PAID') {
        feeAmountEl.disabled = false;
        feeAmountEl.required = true;
      } else {
        feeAmountEl.disabled = true;
        feeAmountEl.required = false;
        feeAmountEl.value = '';
      }
    });
  }

  document.getElementById('editDeadline').value = e.registration_deadline || '';
  document.getElementById('editEmailTemplate').value = e.email_template || '';
  document.getElementById('editEmailSubject').value = e.email_subject || '';

  // Populate Coordinators
  const facultyCoordinatorsContainer = document.getElementById('editFacultyCoordinatorsContainer');
  const studentCoordinatorsContainer = document.getElementById('editStudentCoordinatorsContainer');
  
  if (facultyCoordinatorsContainer) {
    facultyCoordinatorsContainer.innerHTML = '';
    const faculty = e.faculty_coordinators || [];
    faculty.forEach(f => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.innerHTML = `
        <input type="text" class="form-input faculty-name" placeholder="Name (e.g. Dr. John Doe)" value="${f.name || ''}" required />
        <input type="text" class="form-input faculty-designation" placeholder="Designation" value="${f.designation || ''}" required />
        <button type="button" class="btn btn-secondary remove-coord-btn" style="padding: 0 12px;">&times;</button>
      `;
      row.querySelector('.remove-coord-btn').addEventListener('click', () => row.remove());
      facultyCoordinatorsContainer.appendChild(row);
    });
  }

  if (studentCoordinatorsContainer) {
    studentCoordinatorsContainer.innerHTML = '';
    const students = e.student_coordinators || [];
    students.forEach(s => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.innerHTML = `
        <input type="text" class="form-input student-name" placeholder="Name (e.g. Jane Doe)" value="${s.name || ''}" required />
        <input type="tel" class="form-input student-phone" placeholder="Phone (e.g. 9876543210)" value="${s.phone || ''}" pattern="^[6-9][0-9]{9}$" title="Must be a valid 10-digit Indian phone number starting with 6-9" required />
        <button type="button" class="btn btn-secondary remove-coord-btn" style="padding: 0 12px;">&times;</button>
      `;
      row.querySelector('.remove-coord-btn').addEventListener('click', () => row.remove());
      studentCoordinatorsContainer.appendChild(row);
    });
  }

  // Populate poster preview if event has a poster
  const posterUrl = getPosterUrl(e);
  if (posterUrl) {
    const editPosterPreviewImg = document.getElementById('editPosterPreviewImg');
    const editPosterPreviewWrap = document.getElementById('editPosterPreviewWrap');
    const editDropzonePlaceholder = document.getElementById('editDropzonePlaceholder');

    if (editPosterPreviewImg) editPosterPreviewImg.src = posterUrl;
    if (editPosterPreviewWrap) editPosterPreviewWrap.classList.remove('hidden');
    if (editDropzonePlaceholder) editDropzonePlaceholder.classList.add('hidden');
  }

  // Event info form handler
  const form = document.getElementById('editEventForm');
  form.onsubmit = async (evt) => {
    evt.preventDefault();
    const saveBtn = document.getElementById('saveEventInfoBtn');
    saveBtn.classList.add('btn-loading');
    saveBtn.textContent = '';

    const facultyCoordinators = Array.from(document.querySelectorAll('#editFacultyCoordinatorsContainer > div')).map(row => {
      return {
        name: row.querySelector('.faculty-name').value.trim(),
        designation: row.querySelector('.faculty-designation').value.trim()
      };
    }).filter(c => c.name && c.designation);

    const studentCoordinators = Array.from(document.querySelectorAll('#editStudentCoordinatorsContainer > div')).map(row => {
      return {
        name: row.querySelector('.student-name').value.trim(),
        phone: row.querySelector('.student-phone').value.trim()
      };
    }).filter(c => c.name && c.phone);

    // ── Title Validation ──
    const editTitleVal = document.getElementById('editTitle').value.trim();
    if (!editTitleVal || editTitleVal.length < 3) {
      showToast('Enter a valid Event name', 'error');
      saveBtn.classList.remove('btn-loading');
      saveBtn.textContent = 'Save Changes';
      return;
    }

    // ── Date Validation ──
    const editDateVal = document.getElementById('editDate').value;
    const editToDateVal = document.getElementById('editToDate').value;
    const editDeadlineVal = document.getElementById('editDeadline').value;
    const today = new Date().toISOString().split('T')[0];

    if (editDateVal && editDateVal < today) {
      showToast('From Date cannot be before today.', 'error');
      saveBtn.classList.remove('btn-loading');
      saveBtn.textContent = 'Save Changes';
      return;
    }
    if (editToDateVal && editToDateVal < today) {
      showToast('To Date cannot be before today.', 'error');
      saveBtn.classList.remove('btn-loading');
      saveBtn.textContent = 'Save Changes';
      return;
    }
    if (editDateVal && editToDateVal && editToDateVal < editDateVal) {
      showToast('To Date cannot be before From Date.', 'error');
      saveBtn.classList.remove('btn-loading');
      saveBtn.textContent = 'Save Changes';
      return;
    }
    if (editDeadlineVal && editDeadlineVal < today) {
      showToast('Registration Deadline cannot be before today.', 'error');
      saveBtn.classList.remove('btn-loading');
      saveBtn.textContent = 'Save Changes';
      return;
    }
    if (editDeadlineVal && editDateVal && editDeadlineVal > editDateVal) {
      showToast('Registration Deadline cannot be after the event start date.', 'error');
      saveBtn.classList.remove('btn-loading');
      saveBtn.textContent = 'Save Changes';
      return;
    }

    // ── Duration Validation ──
    const editFromTimeVal = document.getElementById('editFromTime').value;
    const editToTimeVal = document.getElementById('editToTime').value;
    if (editFromTimeVal && editToTimeVal && editDateVal && editToDateVal) {
      const startDateTime = new Date(`${editDateVal}T${editFromTimeVal}`);
      const endDateTime = new Date(`${editToDateVal}T${editToTimeVal}`);
      if (endDateTime < startDateTime) {
        showToast('End date/time cannot be before start date/time.', 'error');
        saveBtn.classList.remove('btn-loading');
        saveBtn.textContent = 'Save Changes';
        return;
      }
      const diffMins = (endDateTime - startDateTime) / (1000 * 60);
      if (diffMins < 30) {
        showToast('Event duration must be at least 30 minutes.', 'error');
        saveBtn.classList.remove('btn-loading');
        saveBtn.textContent = 'Save Changes';
        return;
      }
    }

    // ── Fee Validation ──
    const editFeeTypeVal = document.getElementById('editFeeType').value;
    const editFeeAmountVal = document.getElementById('editFeeAmount').value.trim();
    if (editFeeTypeVal === 'PAID') {
      const amount = parseFloat(editFeeAmountVal);
      if (!editFeeAmountVal || isNaN(amount) || amount <= 0 || !/^\d+$/.test(editFeeAmountVal)) {
        showToast('Paid events require a valid integer fee amount greater than 0.', 'error');
        saveBtn.classList.remove('btn-loading');
        saveBtn.textContent = 'Save Changes';
        return;
      }
    }

    const formData = new FormData();
    formData.append('title', document.getElementById('editTitle').value.trim());
    formData.append('description', document.getElementById('editDescription').value.trim());
    formData.append('date', document.getElementById('editDate').value);
    formData.append('to_date', document.getElementById('editToDate').value);
    formData.append('venue', document.getElementById('editVenue').value.trim());
    formData.append('event_category', document.getElementById('editCategory').value);
    formData.append('type', document.getElementById('editType').value.toUpperCase());
    formData.append('fee_type', document.getElementById('editFeeType').value);
    
    if (document.getElementById('editFeeType').value === 'PAID') {
      formData.append('fee_amount', document.getElementById('editFeeAmount').value.trim());
    }
    
    formData.append('max_capacity', document.getElementById('editCapacity').value.trim());
    formData.append('registration_deadline', document.getElementById('editDeadline').value || '');
    formData.append('from_time', document.getElementById('editFromTime').value);
    formData.append('to_time', document.getElementById('editToTime').value);
    formData.append('email_template', document.getElementById('editEmailTemplate').value.trim());
    formData.append('email_subject', document.getElementById('editEmailSubject').value.trim());
    formData.append('faculty_coordinators', JSON.stringify(facultyCoordinators));
    formData.append('student_coordinators', JSON.stringify(studentCoordinators));

    const posterInput = document.getElementById('editPosterFileInput');
    if (posterInput && posterInput.files[0]) {
      formData.append('poster', posterInput.files[0]);
    }

    try {
      await api.updateEvent(eventId, formData);
      showToast('Event details updated successfully.', 'success');
      await loadEventDetail();
    } catch (err) {
      showToast('Failed to update event details: ' + (err.message || 'Unknown error'), 'error');
    }
    saveBtn.classList.remove('btn-loading');
    saveBtn.textContent = 'Save Changes';
  };

  // Placeholder insertion logic
  const placeholders = document.querySelectorAll('.insert-placeholder');
  const emailTemplateArea = document.getElementById('editEmailTemplate');
  
  placeholders.forEach(el => {
    el.addEventListener('click', () => {
      const textToInsert = el.textContent;
      const startPos = emailTemplateArea.selectionStart || 0;
      const endPos = emailTemplateArea.selectionEnd || 0;
      const text = emailTemplateArea.value;
      
      emailTemplateArea.value = text.substring(0, startPos) + textToInsert + text.substring(endPos, text.length);
      emailTemplateArea.focus();
      emailTemplateArea.selectionStart = startPos + textToInsert.length;
      emailTemplateArea.selectionEnd = startPos + textToInsert.length;
    });
  });

  const isCompleted = (e.status || '').toLowerCase() === 'completed';
  if (isCompleted) {
    // Disable all inputs in editEventForm
    const formInputs = document.getElementById('editEventForm').querySelectorAll('input, select, textarea, button');
    formInputs.forEach(el => el.disabled = true);
    
    // Hide the save button entirely
    const saveBtn = document.getElementById('saveEventInfoBtn');
    if (saveBtn) saveBtn.style.display = 'none';

    // Disable poster dropzone & remove button
    const posterDropzone = document.getElementById('editPosterDropzone');
    if (posterDropzone) posterDropzone.style.pointerEvents = 'none';
    const removePosterBtn = document.getElementById('editRemovePosterBtn');
    if (removePosterBtn) removePosterBtn.style.display = 'none';

    // Disable Add Coordinator buttons
    const editAddFacultyCoordBtn = document.getElementById('editAddFacultyCoordBtn');
    if (editAddFacultyCoordBtn) editAddFacultyCoordBtn.style.display = 'none';
    const editAddStudentCoordBtn = document.getElementById('editAddStudentCoordBtn');
    if (editAddStudentCoordBtn) editAddStudentCoordBtn.style.display = 'none';

    // Hide remove coordinator buttons if any were already rendered
    document.querySelectorAll('#editEventForm .remove-coord-btn').forEach(btn => btn.style.display = 'none');

    // Disable Form Builder
    const addFieldBtn = document.getElementById('addFieldBtn');
    const saveFormBuilderBtn = document.getElementById('saveFormBuilderBtn');
    if (addFieldBtn) addFieldBtn.style.display = 'none';
    if (saveFormBuilderBtn) saveFormBuilderBtn.style.display = 'none';
    
    // Rename "Registrations" to "Participants"
    const regsTab = document.querySelector('.admin-tab[data-tab="registrations"]');
    if (regsTab) regsTab.textContent = 'Participants';
    
    const regsTitle = document.querySelector('#panel-registrations h2');
    if (regsTitle) regsTitle.textContent = 'Participants';
  }

  // Panel 2: Form Builder Load
  renderFormFields();

  // Panel 3: Load Registrations
  await loadRegistrations();
  
  // Panel 4: Load Certificate Counters
  try {
    const certsRes = await api.getCertificates(eventId);
    const certs = certsRes.certificates || [];
    certGenerated = certs.length;
    certSent = certs.filter(c => c.email_sent === 'YES').length;
    updateCertificateUI();
  } catch (err) {
    console.error('Could not load certificate stats', err);
  }
}

// ══ CUSTOM FORM BUILDER IMPLEMENTATION ══
function setupFormBuilder() {
  const addBtn = document.getElementById('addFieldBtn');
  const saveBtn = document.getElementById('saveFormBuilderBtn');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const fieldId = Date.now();
      customFields.push({
        id: fieldId,
        field_label: '',
        field_type: 'TEXT',
        is_required: 0
      });
      renderFormFields();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.classList.add('btn-loading');
      saveBtn.textContent = '';

      // Populate input labels/types from form
      let isValid = true;
      customFields.forEach(f => {
        const id = f.id || f.field_id;
        const labelInput = document.getElementById(`fieldLabel_${id}`);
        const typeSelect = document.getElementById(`fieldType_${id}`);
        const reqToggle = document.getElementById(`fieldReq_${id}`);

        if (labelInput && labelInput.value.trim() === '') {
          isValid = false;
          labelInput.style.borderColor = 'var(--accent-danger)';
        } else if (labelInput) {
          f.field_label = labelInput.value.trim();
        }

        if (typeSelect) f.field_type = typeSelect.value.toUpperCase();
        if (reqToggle) f.is_required = reqToggle.checked ? 1 : 0;
      });

      if (!isValid) {
        showToast('Please specify labels for all custom fields.', 'error');
        saveBtn.classList.remove('btn-loading');
        saveBtn.textContent = 'Save Form Abstractions';
        return;
      }

      try {
        console.log('Saving form fields for event:', eventId, customFields);
        const res = await api.saveFormFields(eventId, customFields);
        console.log('Form fields saved:', res);
        showToast('Registration form saved successfully!', 'success');
      } catch (err) {
        console.error('Failed to save form fields:', err);
        showToast('Failed to Save', 'error');
      }
      saveBtn.classList.remove('btn-loading');
      saveBtn.textContent = 'Save Form Fields';
    });
  }
}

// ══ DRAG-AND-DROP REORDER FOR FORM FIELDS ══
let dragSrcIndex = null;

function initFieldDragListeners() {
  const container = document.getElementById('customFieldsList');
  if (!container) return;

  const items = container.querySelectorAll('.field-item');
  items.forEach(item => {
    const handle = item.querySelector('.field-item__drag');
    if (!handle) return;

    // Only start drag from the handle
    handle.addEventListener('mousedown', () => {
      item.setAttribute('draggable', 'true');
    });

    // Prevent drag from inputs/selects
    item.querySelectorAll('input, select, button').forEach(el => {
      el.addEventListener('mousedown', (e) => e.stopPropagation());
    });

    item.addEventListener('dragstart', (e) => {
      dragSrcIndex = parseInt(item.dataset.index);
      item.classList.add('field-item--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.index);
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('field-item--dragover');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('field-item--dragover');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('field-item--dragover');
      const targetIndex = parseInt(item.dataset.index);
      if (dragSrcIndex !== null && dragSrcIndex !== targetIndex) {
        // Sync current input values before reorder
        syncFieldValues();
        // Reorder
        const [moved] = customFields.splice(dragSrcIndex, 1);
        customFields.splice(targetIndex, 0, moved);
        renderFormFields();
      }
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('field-item--dragging');
      item.setAttribute('draggable', 'false');
      dragSrcIndex = null;
      // Clean up any lingering dragover states
      container.querySelectorAll('.field-item--dragover').forEach(el => el.classList.remove('field-item--dragover'));
    });
  });
}

// Sync input values back into customFields before reorder so edits aren't lost
function syncFieldValues() {
  customFields.forEach(f => {
    const id = f.id || f.field_id;
    const labelInput = document.getElementById(`fieldLabel_${id}`);
    const typeSelect = document.getElementById(`fieldType_${id}`);
    const reqToggle = document.getElementById(`fieldReq_${id}`);
    if (labelInput) f.field_label = labelInput.value.trim();
    if (typeSelect) f.field_type = typeSelect.value.toUpperCase();
    if (reqToggle) f.is_required = reqToggle.checked ? 1 : 0;
  });
}

function renderFormFields() {
  const container = document.getElementById('customFieldsList');
  if (!container) return;

  if (customFields.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: var(--space-lg); color: var(--text-muted); border: 1.5px dashed var(--border-card); border-radius: var(--radius-card); font-size: 13px;">
        No custom registration parameters constructed yet. Click "Add Field" to build forms dynamically.
      </div>
    `;
    return;
  }

  container.innerHTML = customFields.map((f, index) => {
    const label = f.field_label || f.label || '';
    const type = (f.field_type || f.type || 'TEXT').toUpperCase();
    const required = f.is_required === 1 || f.required;
    const id = f.id || f.field_id || index;

    const isCompleted = (eventData?.status || '').toLowerCase() === 'completed';

    return `
      <div class="field-item" data-index="${index}">
        <div class="field-item__drag" style="${isCompleted ? 'display:none;' : ''}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></svg>
        </div>

        <div style="flex: 1; display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 12px; align-items: center; width: 100%;">
          <!-- Label Input -->
          <div class="form-group" style="gap: 2px;">
            <input type="text" class="form-input" id="fieldLabel_${id}" value="${label}" placeholder="Field Label (e.g. Branch name)" style="padding: 8px 12px; font-size: var(--text-sm);" ${isCompleted ? 'disabled' : ''} />
          </div>

          <!-- Type Select -->
          <div class="form-group" style="gap: 2px;">
            <select class="form-select" id="fieldType_${id}" style="padding: 8px 12px; font-size: var(--text-sm);" ${isCompleted ? 'disabled' : ''}>
              <option value="TEXT" ${type === 'TEXT' ? 'selected' : ''}>Single Text</option>
              <option value="EMAIL" ${type === 'EMAIL' ? 'selected' : ''}>Email Address</option>
              <option value="NUMBER" ${type === 'NUMBER' ? 'selected' : ''}>Number</option>
              <option value="TEL" ${type === 'TEL' ? 'selected' : ''}>Phone Number</option>
              <option value="TEXTAREA" ${type === 'TEXTAREA' ? 'selected' : ''}>Long Answer Paragraph</option>
            </select>
          </div>

          <!-- Required check -->
          <div style="display: flex; align-items: center; gap: 8px; font-size: var(--text-sm); font-weight: 500;">
            <input type="checkbox" id="fieldReq_${id}" ${required ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent-primary);" ${isCompleted ? 'disabled' : ''} />
            Required
          </div>

          <!-- Delete Field -->
          <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="deleteCustomField(${id})" style="border-radius: var(--radius-btn); padding: 8px; ${isCompleted ? 'display:none;' : ''}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach drag-and-drop listeners after rendering
  initFieldDragListeners();
}

window.deleteCustomField = (id) => {
  customFields = customFields.filter(f => (f.id || f.field_id) !== id);
  renderFormFields();
};

// ══ REGISTRATIONS PIPELINE ══
async function loadRegistrations() {
  const tbody = document.getElementById('regsTableBody');
  const theadRow = document.getElementById('regsTableHeaderRow');
  if (!tbody || !theadRow) return;

  try {
    const res = await api.getEventRegs(eventId);
    // Backend returns 'attendance' array with participant_name/participant_email fields
    const rawList = res.attendance || res.registrations || [];
    registrationsList = rawList.map(r => ({
      name: r.participant_name || r.name || '',
      email: r.participant_email || r.email || '',
      registered_at: r.registered_at || '',
      registration_id: r.registration_id || '',
      attendance_status: r.attendance_status || 'ABSENT',
      ...r
    }));
    renderRegsTable();
  } catch (err) {
    console.error('Failed to load registrations:', err);
    registrationsList = [];
    renderRegsTable();
  }
}

function renderRegsTable() {
  const tbody = document.getElementById('regsTableBody');
  const theadRow = document.getElementById('regsTableHeaderRow');
  if (!tbody || !theadRow) return;

  if (registrationsList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: var(--space-2xl); color: var(--text-muted);">
          No registrations submitted for this event yet.
        </td>
      </tr>
    `;
    return;
  }

  // Determine dynamic headers (Name, Email, Date Applied + Custom Fields)
  const baseHeaders = ['Name', 'Email', 'Mail Sent', 'Date Applied'];
  const customLabels = customFields.map(f => f.field_label || f.label);
  const allHeaders = [...baseHeaders, ...customLabels];

  theadRow.innerHTML = allHeaders.map(h => `<th style="text-align: center;">${escapeHTML(h)}</th>`).join('');

  tbody.innerHTML = registrationsList.map(r => {
    let mailSentBadge = '<span style="color:var(--text-muted);background:var(--bg-section);padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;margin: 0 auto;display: inline-block;">No</span>';
    if (r.email_sent === 'YES') {
      mailSentBadge = '<span class="badge badge-internal" style="margin: 0 auto; display: inline-block; text-transform: none;">Yes</span>';
    } else if (r.email_sent === 'QUEUED') {
      mailSentBadge = '<span style="color:#2563eb;background:#dbeafe;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;margin: 0 auto;display: inline-block;">Queued</span>';
    }

    const cells = [
      `<td style="text-align: center;"><div style="font-weight:600; color:var(--text-heading); text-align: center;">${escapeHTML(r.name || 'Anonymous Student')}</div></td>`,
      `<td style="text-align: center;">${escapeHTML(r.email || '—')}</td>`,
      `<td style="text-align: center;">${mailSentBadge}</td>`,
      `<td style="white-space:nowrap; text-align: center;">${formatDate(r.createdAt || r.dateApplied || r.registered_at)}</td>`
    ];

    // Append dynamic cells
    customFields.forEach(f => {
      const label = f.field_label || f.label;
      const answer = (r.customAnswers && r.customAnswers[label]) || r[label] || '—';
      cells.push(`<td style="text-align: center;">${escapeHTML(answer)}</td>`);
    });

    return `<tr>${cells.join('')}</tr>`;
  }).join('');

  // Handle native CSV Export Download
  const exportBtn = document.getElementById('exportCSVBtn');
  
  if (exportBtn) {
    exportBtn.onclick = () => exportToCSV(allHeaders);
  }
}

function exportToCSV(headers) {
  let csvContent = "data:text/csv;charset=utf-8,";
  // Add Headers Row
  csvContent += headers.map(h => `"${h}"`).join(",") + "\n";

  // Add Data Rows
  registrationsList.forEach(r => {
    let mailSentText = 'No';
    if (r.email_sent === 'YES') {
      mailSentText = 'Yes';
    } else if (r.email_sent === 'QUEUED') {
      mailSentText = 'Queued';
    }
    const row = [
      r.name || '',
      r.email || '',
      mailSentText,
      formatDate(r.createdAt || r.dateApplied || r.registered_at)
    ];

    customFields.forEach(f => {
      const label = f.field_label || f.label;
      const answer = (r.customAnswers && r.customAnswers[label]) || r[label] || '';
      row.push(answer);
    });

    csvContent += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const safeEventName = (eventData.title || 'event').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  link.setAttribute("download", `${safeEventName}_registrations.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV export downloaded!', 'success');
}


// ══ TAB PANEL 5: CERTIFICATES DISTRIBUTOR PANEL ══
function setupCertificatePanel() {
  updateCertificateUI();
  initCertificateBuilder();

  const generateBtn = document.getElementById('generateCertsBtn');
  const sendBtn = document.getElementById('sendCertsBtn');

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      if (registrationsList.length === 0) {
        showToast('No registrations exist to generate certificates for.', 'warning');
        return;
      }

      generateBtn.classList.add('btn-loading');
      generateBtn.textContent = '';

      try {
        await api.generateCerts(eventId);
        certGenerated = registrationsList.length;
        certPending = 0;
        updateCertificateUI();
        showToast('Certificates generated successfully!', 'success');
      } catch (err) {
        showToast('Failed to generate certificates: ' + (err?.message || 'Unknown error'), 'error');
      }

      generateBtn.classList.remove('btn-loading');
      generateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
        Generate Certificates
      `;
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      if (certGenerated === 0) {
        showToast('Please generate certificates first before dispatching.', 'warning');
        return;
      }

      sendBtn.classList.add('btn-loading');
      sendBtn.textContent = '';

      try {
        await api.sendCerts(eventId);
        certSent = certGenerated;
        certGenerated = 0;
        updateCertificateUI();
        showToast('Interactive digital certificates sent to student inboxes!', 'success');
      } catch (err) {
        showToast('Failed to send certificates: ' + (err?.message || 'Unknown error'), 'error');
      }

      sendBtn.classList.remove('btn-loading');
      sendBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Send Certificates via Email
      `;
    });
  }

  // Download All Certificates
  const downloadBtn = document.getElementById('downloadAllCertsBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      downloadBtn.classList.add('btn-loading');
      downloadBtn.textContent = '';

      try {
        // Fetch certificate list from the backend
        const res = await api.getCertificates(eventId);
        const certs = res.certificates || [];

        if (certs.length === 0) {
          showToast('No certificates have been generated yet. Generate certificates first.', 'warning');
          downloadBtn.classList.remove('btn-loading');
          downloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download All (ZIP)`;
          return;
        }

        // Download each certificate
        let downloaded = 0;
        for (const cert of certs) {
          if (cert.certificate_url) {
            const { data, error } = await supabase.storage.from('certificates').createSignedUrl(cert.certificate_url, 3600);
            if (error || !data?.signedUrl) continue;

            const link = document.createElement('a');
            link.href = data.signedUrl;
            link.download = cert.certificate_url.split('/').pop();
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            downloaded++;
            // Small delay between downloads to prevent browser blocking
            await new Promise(r => setTimeout(r, 300));
          }
        }

        showToast(`${downloaded} certificate(s) downloaded successfully!`, 'success');
      } catch (err) {
        showToast('Could not fetch or download certificates.', 'error');
      }

      downloadBtn.classList.remove('btn-loading');
      downloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download All (ZIP)`;
    });
  }
}

function updateCertificateUI() {
  const pendingEl = document.getElementById('certCounterPending');
  const genEl = document.getElementById('certCounterGenerated');
  const sentEl = document.getElementById('certCounterSent');

  if (pendingEl) pendingEl.textContent = certPending;
  if (genEl) genEl.textContent = certGenerated;
  if (sentEl) sentEl.textContent = certSent;
}

// ==========================================
// CERTIFICATE BUILDER LOGIC (Transplanted)
// ==========================================

let placeholders = {};
let activeElementKey = 'student_name';

function getCurrentScale() {
  const canvas = document.getElementById('certCanvas');
  const img = document.getElementById('certCanvasImg');
  if (!canvas || !img || !img.naturalWidth) return 1;
  // Fallback to 1 if clientWidth is 0 (e.g. hidden tab)
  return (canvas.clientWidth / img.naturalWidth) || 1;
}

async function initCertificateBuilder() {
  const fileInput = document.getElementById('templateFileInput');
  const btnUploadMiddle = document.getElementById('btnUploadTemplateMiddle');
  const btnSave = document.getElementById('btnSavePlaceholders');
  
  if (fileInput) {
    fileInput.addEventListener('change', handleUploadTemplate);
  }
  // The middle button already has onclick="document.getElementById('templateFileInput').click()"
  // so we only need the change handler on the file input
  if (btnSave) {
    btnSave.addEventListener('click', () => handleSavePlaceholders(false));
  }
  
  const propFontFamily = document.getElementById('propFontFamily');
  const propFontSize = document.getElementById('propFontSize');
  const propFontColor = document.getElementById('propFontColor');
  const propAlign = document.getElementById('propAlign');
  const propQrSize = document.getElementById('propQrSize');
  const btnRemoveElement = document.getElementById('btnRemoveElement');
  
  if (propFontFamily) propFontFamily.addEventListener('change', updateActiveProp);
  if (propFontSize) {
    const propFontSizeSelect = document.getElementById('propFontSizeSelect');
    
    propFontSize.addEventListener('input', () => {
      // Sync select background choice if the user types a preset size
      if (propFontSizeSelect) {
        if (Array.from(propFontSizeSelect.options).some(o => o.value == propFontSize.value)) {
          propFontSizeSelect.value = propFontSize.value;
        } else {
          propFontSizeSelect.value = ''; // custom typed size
        }
      }
      updateActiveProp();
    });
    
    if (propFontSizeSelect) {
      propFontSizeSelect.addEventListener('change', () => {
        propFontSize.value = propFontSizeSelect.value;
        updateActiveProp();
      });
    }
  }
  if (propFontColor) propFontColor.addEventListener('input', updateActiveProp);
  if (propAlign) propAlign.addEventListener('change', updateActiveProp);
  if (propQrSize) propQrSize.addEventListener('input', updateActiveProp);
  if (btnRemoveElement) btnRemoveElement.addEventListener('click', handleRemoveActiveElement);
  
  const placeholderPills = document.querySelectorAll('.placeholder-pill');
  placeholderPills.forEach(pill => {
    pill.addEventListener('click', () => handleAddPlaceholder(pill.dataset.key));
  });

  // Re-render placeholders on window resize so they stay visually anchored to the image correctly
  window.addEventListener('resize', () => {
    if (Object.keys(placeholders).length > 0) {
      renderPlaceholders();
    }
  });

  // Preview Certificate button
  const btnPreview = document.getElementById('btnPreviewCertificate');
  if (btnPreview) {
    btnPreview.addEventListener('click', generateCertificatePreview);
  }

  // Preview modal close
  const previewOverlay = document.getElementById('certPreviewOverlay');
  const previewCloseBtn = document.getElementById('certPreviewCloseBtn');
  if (previewCloseBtn) {
    previewCloseBtn.addEventListener('click', () => {
      previewOverlay.classList.remove('active');
      document.body.style.overflow = '';
    });
  }
  if (previewOverlay) {
    previewOverlay.addEventListener('click', (e) => {
      if (e.target === previewOverlay) {
        previewOverlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // Preview download button
  const previewDownloadBtn = document.getElementById('certPreviewDownloadBtn');
  if (previewDownloadBtn) {
    previewDownloadBtn.addEventListener('click', () => {
      const canvas = document.getElementById('certPreviewCanvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'certificate_preview_Jane_Doe.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  // Escape key to close preview
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewOverlay && previewOverlay.classList.contains('active')) {
      previewOverlay.classList.remove('active');
    }
  });

  await loadTemplateAndPlaceholders();
}

async function loadTemplateAndPlaceholders(directUrl) {
  const builderBody = document.getElementById('certBuilderBody');
  const noTemplateMsg = document.getElementById('noTemplateMsg');
  const canvasImg = document.getElementById('certCanvasImg');
  const canvas = document.getElementById('certCanvas');
  
  const btnSave = document.getElementById('btnSavePlaceholders');
  
  if (!eventId) return;

  const cacheBust = '?t=' + Date.now();
  
  const getPublicUrl = (path) => supabase.storage.from('cert-templates').getPublicUrl(path).data.publicUrl;
  
  let urlsToTry = [];
  if (directUrl) {
    urlsToTry.push(getPublicUrl(directUrl));
  } else {
    urlsToTry = [
      getPublicUrl(`${eventId}/template.png`),
      getPublicUrl(`${eventId}/template.jpg`),
      getPublicUrl(`${eventId}/template.jpeg`)
    ];
  }
  
  let urlIndex = 0;
  
  const img = new Image();
  img.onload = async () => {
    if (builderBody) builderBody.style.display = 'block';
    if (noTemplateMsg) noTemplateMsg.style.display = 'none';
    if (btnSave) btnSave.disabled = false;
    
    if (canvasImg) canvasImg.src = img.src;
    
    try {
      const phData = await api.getPlaceholders(eventId);
      placeholders = phData.placeholders || {};
      if (Array.isArray(placeholders)) placeholders = {};
    } catch (e) {
      placeholders = {};
    }
    
    renderPlaceholders();
    updatePillStates();
    setActiveElement(null);
  };
  img.onerror = () => {
    urlIndex++;
    if (urlIndex < urlsToTry.length) {
      img.src = urlsToTry[urlIndex] + cacheBust;
    } else {
      if (builderBody) builderBody.style.display = 'none';
      if (noTemplateMsg) noTemplateMsg.style.display = 'block';
      if (btnSave) btnSave.disabled = true;
      placeholders = {};
    }
  };
  img.src = urlsToTry[0] + cacheBust;
}

async function handleUploadTemplate(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // Client-side validation for immediate feedback
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!allowedTypes.includes(file.type)) {
    showToast('Only PNG or JPG images are allowed.', 'error');
    e.target.value = '';
    return;
  }
  
  const maxSizeMB = 10;
  if (file.size > maxSizeMB * 1024 * 1024) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    showToast(`File is ${sizeMB} MB which exceeds the ${maxSizeMB} MB limit. Please use a smaller image.`, 'error');
    e.target.value = '';
    return;
  }
  
  const fd = new FormData();
  fd.append('template_image', file);
  fd.append('event_id', eventId);
  
  const btnUploadMiddle = document.getElementById('btnUploadTemplateMiddle');
  const fileInput = document.getElementById('templateFileInput');
  
  try {
    if (btnUploadMiddle) {
      btnUploadMiddle.textContent = 'Uploading...';
      btnUploadMiddle.disabled = true;
    }
    
    const res = await api.uploadCertTemplate(eventId, fileInput.files[0]);
    if (!res.success) throw new Error(res.message || 'Upload failed');
    
    if (fileInput) fileInput.value = '';
    showToast('Template background uploaded successfully', 'success');
    // Use the server-returned URL directly
    await loadTemplateAndPlaceholders(res.path);
  } catch (err) {
    showToast(err.message || 'Upload failed', 'error');
  } finally {
    if (btnUploadMiddle) {
      btnUploadMiddle.innerHTML = 'Upload Template Image';
      btnUploadMiddle.disabled = false;
    }
  }
}

function renderPlaceholders() {
  const canvas = document.getElementById('certCanvas');
  if (!canvas) return;
  canvas.querySelectorAll('.draggable-placeholder, .qr-placeholder').forEach(el => el.remove());
  
  const currentScale = getCurrentScale();

  Object.keys(placeholders).forEach(key => {
    const data = placeholders[key];
    const el = document.createElement('div');
    el.dataset.key = key;
    
    if (key === 'qr_code') {
      el.className = 'qr-placeholder';
      el.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
      el.style.left = `${(data.x || 0) * currentScale}px`;
      el.style.top = `${(data.y || 0) * currentScale}px`;
      el.style.width = `${(data.width || 120) * currentScale}px`;
      el.style.height = `${(data.height || 120) * currentScale}px`;
    } else {
      el.className = 'draggable-placeholder';
      el.textContent = getLabelForKey(key);
      el.style.left = `${(data.x || 0) * currentScale}px`;
      el.style.top = `${(data.y || 0) * currentScale}px`;
      el.style.fontSize = `${(data.fontSize || 20) * currentScale}px`;
      el.style.fontFamily = data.fontFamily || 'Poppins';
      el.style.color = data.fontColor || '#000000';
      el.style.textAlign = data.alignment || 'center';
    }
    
    makeDraggable(el, key);
    el.addEventListener('mousedown', () => setActiveElement(key));
    canvas.appendChild(el);
  });
}

function getLabelForKey(key) {
  const map = {
    'student_name': '[Student Name]',
    'reg_number': '[Registration Number]',
    'event_name': '[Event Name]'
  };
  return map[key] || `[${key}]`;
}

function makeDraggable(el, key) {
  let isDragging = false;
  el.addEventListener('mousedown', (e) => {
    isDragging = true;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseFloat(el.style.left || 0);
    const startTop = parseFloat(el.style.top || 0);
    
    function onMouseMove(moveEvent) {
      if (!isDragging) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const newLeft = startLeft + dx;
      const newTop = startTop + dy;
      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;
      if (placeholders[key]) {
        const currentScale = getCurrentScale();
        placeholders[key].x = Math.round(newLeft / currentScale);
        placeholders[key].y = Math.round(newTop / currentScale);
      }
    }
    function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function setActiveElement(key) {
  activeElementKey = key;
  const canvas = document.getElementById('certCanvas');
  const editingLabel = document.getElementById('editingLabel');
  const btnRemoveElement = document.getElementById('btnRemoveElement');
  const textProps = document.getElementById('textProps');
  const qrProps = document.getElementById('qrProps');
  const propFontFamily = document.getElementById('propFontFamily');
  const propFontSize = document.getElementById('propFontSize');
  const propFontColor = document.getElementById('propFontColor');
  const propAlign = document.getElementById('propAlign');
  const propQrSize = document.getElementById('propQrSize');

  if (canvas) {
    canvas.querySelectorAll('.draggable-placeholder, .qr-placeholder').forEach(el => {
      el.classList.toggle('active', el.dataset.key === key);
    });
  }
  
  if (!key || !placeholders[key]) {
    if (editingLabel) editingLabel.textContent = 'None';
    if (btnRemoveElement) btnRemoveElement.style.display = 'none';
    if (textProps) textProps.style.display = 'none';
    if (qrProps) qrProps.style.display = 'none';
    return;
  }
  
  if (editingLabel) editingLabel.textContent = `{{${key}}}`;
  if (btnRemoveElement) btnRemoveElement.style.display = 'inline-block';
  
  const data = placeholders[key];
  if (key === 'qr_code') {
    if (textProps) textProps.style.display = 'none';
    if (qrProps) qrProps.style.display = 'block';
    if (propQrSize) propQrSize.value = data.width || 120;
  } else {
    if (textProps) textProps.style.display = 'grid';
    if (qrProps) qrProps.style.display = 'none';
    if (propFontFamily) propFontFamily.value = data.fontFamily || 'Poppins';
    if (propFontSize && document.activeElement !== propFontSize) {
      propFontSize.value = data.fontSize || 20;
      const propFontSizeSelect = document.getElementById('propFontSizeSelect');
      if (propFontSizeSelect) {
        if (Array.from(propFontSizeSelect.options).some(o => o.value == propFontSize.value)) {
          propFontSizeSelect.value = propFontSize.value;
        } else {
          propFontSizeSelect.value = '';
        }
      }
    }
    if (propFontColor) propFontColor.value = data.fontColor || '#000000';
    if (propAlign) propAlign.value = data.alignment || 'center';
  }
}

function updateActiveProp() {
  if (!activeElementKey || !placeholders[activeElementKey]) return;
  const data = placeholders[activeElementKey];
  const propQrSize = document.getElementById('propQrSize');
  const propFontFamily = document.getElementById('propFontFamily');
  const propFontSize = document.getElementById('propFontSize');
  const propFontColor = document.getElementById('propFontColor');
  const propAlign = document.getElementById('propAlign');
  
  if (activeElementKey === 'qr_code') {
    data.width = parseInt(propQrSize.value, 10) || 120;
    data.height = parseInt(propQrSize.value, 10) || 120;
  } else {
    data.fontFamily = propFontFamily.value;
    data.fontSize = parseInt(propFontSize.value, 10) || 0;
    data.fontColor = propFontColor.value;
    data.alignment = propAlign ? propAlign.value : (data.alignment || 'center');
  }
  
  renderPlaceholders();
  setActiveElement(activeElementKey);
}

function handleAddPlaceholder(key) {
  if (placeholders[key]) return;
  placeholders[key] = { x: 100, y: 100 };
  if (key === 'qr_code') {
    placeholders[key].width = 120;
    placeholders[key].height = 120;
  } else {
    placeholders[key].fontFamily = 'Poppins';
    placeholders[key].fontSize = 28;
    placeholders[key].fontColor = '#1B005D';
    placeholders[key].alignment = 'center';
  }
  renderPlaceholders();
  updatePillStates();
  setActiveElement(key);
}

function handleRemoveActiveElement() {
  if (!activeElementKey) return;
  delete placeholders[activeElementKey];
  renderPlaceholders();
  updatePillStates();
  setActiveElement(null);
}

function updatePillStates() {
  document.querySelectorAll('.placeholder-pill').forEach(pill => {
    if (placeholders[pill.dataset.key]) {
      pill.classList.add('added');
    } else {
      pill.classList.remove('added');
    }
  });
}

async function handleSavePlaceholders(silent = false) {
  if (!eventId) return false;
  const btnSave = document.getElementById('btnSavePlaceholders');
  try {
    if (btnSave) btnSave.textContent = 'Saving...';
    const res = await api.saveCertConfig(eventId, placeholders);
    if (!res.success) throw new Error(res.message || 'Failed to save configuration');
    if (!silent) showToast('Configuration saved successfully.', 'success');
    return true;
  } catch (err) {
    if (!silent) showToast(err.message || 'Failed to save configuration', 'error');
    return false;
  } finally {
    if (btnSave) btnSave.textContent = 'Save Configuration';
  }
}

// ==========================================
// CERTIFICATE PREVIEW LOGIC
// ==========================================

async function generateCertificatePreview() {
  const canvasImg = document.getElementById('certCanvasImg');
  const previewOverlay = document.getElementById('certPreviewOverlay');
  const previewCanvas = document.getElementById('certPreviewCanvas');
  const btnPreview = document.getElementById('btnPreviewCertificate');

  if (!canvasImg || !canvasImg.src || !canvasImg.naturalWidth) {
    showToast('Please upload a certificate template first.', 'warning');
    return;
  }

  if (Object.keys(placeholders).length === 0) {
    showToast('No placeholders have been added. Add at least one placeholder to preview.', 'warning');
    return;
  }

  // Show loading state on button
  const origHTML = btnPreview.innerHTML;
  btnPreview.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Generating...';
  btnPreview.disabled = true;

  try {
    // Load the template image at full resolution
    const templateImg = new Image();
    templateImg.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      templateImg.onload = resolve;
      templateImg.onerror = () => reject(new Error('Failed to load template image'));
      templateImg.src = canvasImg.src;
    });

    const imgW = templateImg.naturalWidth;
    const imgH = templateImg.naturalHeight;

    // Set up canvas at full template resolution
    previewCanvas.width = imgW;
    previewCanvas.height = imgH;
    const ctx = previewCanvas.getContext('2d');

    // Draw the template background
    ctx.drawImage(templateImg, 0, 0, imgW, imgH);

    // Sample data values
    const sampleValues = {
      'student_name': 'Jane Doe',
      'reg_number': '22DDD0001',
      'event_name': eventData ? eventData.title : 'Sample Event'
    };

    // Load fonts and draw text placeholders
    for (const [field, value] of Object.entries(sampleValues)) {
      if (!placeholders[field]) continue;
      const ph = placeholders[field];
      const x = parseInt(ph.x) || 0;
      const y = parseInt(ph.y) || 0;
      const fontSize = parseInt(ph.fontSize) || 20;
      const fontColor = ph.fontColor || '#1B005D';
      const alignment = ph.alignment || 'center';
      const fontFamily = ph.fontFamily || 'Poppins';

      ctx.font = `${fontSize}px ${fontFamily}, sans-serif`;
      ctx.fillStyle = fontColor;

      // Measure text for alignment
      const metrics = ctx.measureText(value);
      const textWidth = metrics.width;

      let drawX = x;
      if (alignment === 'center') drawX = x - textWidth / 2;
      else if (alignment === 'right') drawX = x - textWidth;

      // y is the visual center, adjust for canvas baseline
      const drawY = y + fontSize * 0.35; // approximate vertical centering

      ctx.fillText(value, drawX, drawY);
    }

    // Draw QR code if placeholder exists
    if (placeholders['qr_code']) {
      const qrPh = placeholders['qr_code'];
      const qrX = parseInt(qrPh.x) || 0;
      const qrY = parseInt(qrPh.y) || 0;
      const qrW = parseInt(qrPh.width) || 120;
      const qrH = parseInt(qrPh.height) || 120;

      // Draw white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(qrX, qrY, qrW, qrH);

      // Draw black quiet border/container
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, Math.round(qrW * 0.02));
      ctx.strokeRect(qrX, qrY, qrW, qrH);

      // Helper to draw a QR locator square
      const drawLocator = (lx, ly, size) => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(lx, ly, size, size);
        ctx.fillStyle = '#FFFFFF';
        const innerGap = Math.round(size * 0.14);
        ctx.fillRect(lx + innerGap, ly + innerGap, size - innerGap * 2, size - innerGap * 2);
        ctx.fillStyle = '#000000';
        const centerGap = Math.round(size * 0.28);
        ctx.fillRect(lx + centerGap, ly + centerGap, size - centerGap * 2, size - centerGap * 2);
      };

      // Locator size: ~30% of the total width
      const locSize = Math.round(qrW * 0.28);

      // Top-Left locator
      drawLocator(qrX + Math.round(qrW * 0.08), qrY + Math.round(qrH * 0.08), locSize);
      // Top-Right locator
      drawLocator(qrX + qrW - locSize - Math.round(qrW * 0.08), qrY + Math.round(qrH * 0.08), locSize);
      // Bottom-Left locator
      drawLocator(qrX + Math.round(qrW * 0.08), qrY + qrH - locSize - Math.round(qrH * 0.08), locSize);

      // Draw random pixels to simulate QR data modules
      ctx.fillStyle = '#000000';
      const modSize = Math.max(2, Math.round(qrW * 0.04));
      for (let x = qrX + Math.round(qrW * 0.08); x < qrX + qrW - Math.round(qrW * 0.08); x += modSize) {
        for (let y = qrY + Math.round(qrH * 0.08); y < qrY + qrH - Math.round(qrH * 0.08); y += modSize) {
          // Skip locator regions
          const inTopLeft = x < qrX + locSize + Math.round(qrW * 0.1) && y < qrY + locSize + Math.round(qrH * 0.1);
          const inTopRight = x > qrX + qrW - locSize - Math.round(qrW * 0.1) && y < qrY + locSize + Math.round(qrH * 0.1);
          const inBottomLeft = x < qrX + locSize + Math.round(qrW * 0.1) && y > qrY + qrH - locSize - Math.round(qrH * 0.1);

          if (!inTopLeft && !inTopRight && !inBottomLeft) {
            if (Math.random() > 0.5) {
              ctx.fillRect(x, y, modSize, modSize);
            }
          }
        }
      }
    }

    // Show the preview modal
    previewOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

  } catch (err) {
    console.error('Preview generation failed:', err);
    showToast('Failed to generate preview: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    btnPreview.innerHTML = origHTML;
    btnPreview.disabled = false;
  }
}

