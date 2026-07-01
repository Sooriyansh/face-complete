const LoadingManager = (() => {
  const profiles = [
    {
      match: ({ url }) => url.includes('/employee-face-login'),
      title: 'Face Sign In',
      success: 'Face sign-in completed successfully.',
      messages: [
        'Checking your sign-in details...',
        'Checking your face...',
        'Matching your face...',
        'Opening your secure account...',
        'Opening your overview...',
      ],
    },
    {
      match: ({ url }) => url.includes('/api/attendance/scan'),
      title: 'Marking Attendance',
      success: 'Attendance marked successfully.',
      messages: [
        'Checking your employee details...',
        'Checking your face photo...',
        'Matching your face...',
        'Saving attendance...',
        'Updating attendance record...',
      ],
    },
    {
      match: ({ url }) => url.includes('/api/students') || url.includes('/signup'),
      title: 'Face Registration',
      success: 'Face registered successfully.',
      messages: [
        'Checking your face photo...',
        'Capturing face photos...',
        'Creating your face profile...',
        'Securing your face profile...',
        'Uploading securely...',
        'Activating employee account...',
      ],
    },
    {
      match: ({ url }) => url.includes('/api/work-sessions/join'),
      title: 'Start Workday',
      success: 'Workday started successfully.',
      messages: [
        'Saving Work Plan...',
        'Starting your workday...',
        'Starting work activity tracking...',
        'Updating workday record...',
      ],
    },
    {
      match: ({ url }) => url.includes('/checkout'),
      title: 'Check Out',
      success: 'Daily report submitted successfully.',
      messages: [
        'Saving Daily Report...',
        'Updating workday record...',
        'Preparing activity summary...',
        'Finalizing Checkout...',
      ],
    },
    {
      match: ({ url }) => url.includes('/api/hrms/leaves'),
      title: 'Leave Request',
      success: 'Leave request processed successfully.',
      messages: [
        'Checking leave details...',
        'Submitting Leave Request...',
        'Updating Leave Balance...',
        'Updating leave record...',
      ],
    },
    {
      match: ({ url }) => url.includes('/export') || url.includes('/csv') || url.includes('/excel') || url.includes('/pdf'),
      title: 'Preparing Report',
      success: 'Report generated successfully.',
      messages: [
        'Preparing report data...',
        'Creating export file...',
        'Preparing download...',
        'Finalizing Report...',
      ],
    },
    {
      match: ({ url }) => url.includes('/api/hrms') || url.includes('/api/work-sessions') || url.includes('/api/system-events'),
      title: 'Overview Data Loading',
      success: 'Overview data loaded successfully.',
      messages: [
        'Loading reports and insights...',
        'Fetching Latest Records...',
        'Preparing saved records...',
        'Updating Overview...',
      ],
    },
  ];

  const fallbackProfile = {
    title: 'Processing Request',
    success: 'Process completed successfully.',
    messages: [
      'Preparing your request...',
      'Saving your request...',
      'Saving securely...',
      'Finishing up...',
    ],
  };

  let elements = null;
  let activeCount = 0;
  let progressTimer = null;
  let messageTimer = null;
  let hideTimer = null;
  let progress = 0;
  let messageIndex = 0;
  let currentProfile = fallbackProfile;
  let retryHandler = null;

  function getProfile(input = {}) {
    return profiles.find((profile) => profile.match(input)) || fallbackProfile;
  }

  function ensureElements() {
    if (elements) {
      return elements;
    }

    const overlay = document.createElement('div');
    overlay.className = 'global-loader-overlay';
    overlay.id = 'global-loader-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div class="global-loader-card" role="dialog" aria-modal="true" aria-labelledby="global-loader-title">
        <div class="global-loader-ring" style="--loader-progress: 0">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="global-loader-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#22d3ee"></stop>
                <stop offset="52%" stop-color="#a78bfa"></stop>
                <stop offset="100%" stop-color="#34d399"></stop>
              </linearGradient>
            </defs>
            <circle class="global-loader-track" cx="60" cy="60" r="52"></circle>
            <circle class="global-loader-progress" cx="60" cy="60" r="52"></circle>
          </svg>
          <div class="global-loader-percent">0%</div>
          <div class="global-loader-icon" aria-hidden="true">
            <i class="fa-solid fa-check"></i>
            <i class="fa-solid fa-xmark"></i>
          </div>
        </div>
        <div class="global-loader-copy">
          <p class="global-loader-kicker">Secure Processing</p>
          <h2 id="global-loader-title">Processing Request</h2>
          <p class="global-loader-message">Preparing your request...</p>
          <div class="global-loader-bar" aria-hidden="true"><span></span></div>
          <p class="global-loader-eta">Less than 10 seconds remaining</p>
        </div>
        <button type="button" class="global-loader-retry" hidden>
          <i class="fa-solid fa-rotate-right"></i> Retry
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    elements = {
      overlay,
      card: overlay.querySelector('.global-loader-card'),
      ring: overlay.querySelector('.global-loader-ring'),
      percent: overlay.querySelector('.global-loader-percent'),
      title: overlay.querySelector('#global-loader-title'),
      message: overlay.querySelector('.global-loader-message'),
      bar: overlay.querySelector('.global-loader-bar span'),
      eta: overlay.querySelector('.global-loader-eta'),
      retry: overlay.querySelector('.global-loader-retry'),
    };

    elements.retry.addEventListener('click', () => {
      const retry = retryHandler;
      hideLoader({ immediate: true });
      if (typeof retry === 'function') {
        retry();
      }
    });

    return elements;
  }

  function setState(state) {
    const ui = ensureElements();
    ui.overlay.dataset.state = state || 'loading';
  }

  function setProgress(value) {
    const ui = ensureElements();
    progress = Math.max(0, Math.min(100, Math.round(value)));
    ui.ring.style.setProperty('--loader-progress', progress);
    ui.percent.textContent = `${progress}%`;
    ui.bar.style.width = `${progress}%`;

    if (progress >= 88) {
      ui.eta.textContent = 'Finalizing process...';
    } else if (progress >= 65) {
      ui.eta.textContent = 'Almost done...';
    } else {
      ui.eta.textContent = 'Less than 10 seconds remaining';
    }
  }

  function updateMessage(message) {
    const ui = ensureElements();
    if (message) {
      ui.message.textContent = message;
    }
  }

  function stopTimers() {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }

    if (messageTimer) {
      window.clearInterval(messageTimer);
      messageTimer = null;
    }
  }

  function startAnimation() {
    stopTimers();
    messageIndex = 0;
    const messages = currentProfile.messages || fallbackProfile.messages;
    updateMessage(messages[0]);
    progressTimer = window.setInterval(() => {
      const ceiling = progress > 80 ? 94 : 88;
      if (progress < ceiling) {
        const step = progress < 35 ? 7 : progress < 70 ? 4 : 2;
        setProgress(Math.min(progress + step, ceiling));
      }
    }, 520);
    messageTimer = window.setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
      updateMessage(messages[messageIndex]);
    }, 1450);
  }

  function showLoader(options = {}) {
    const ui = ensureElements();
    currentProfile = options.profile || getProfile(options);
    retryHandler = options.retry || null;
    activeCount += options.joinExisting ? 0 : 1;

    window.clearTimeout(hideTimer);
    ui.title.textContent = options.title || currentProfile.title;
    ui.retry.hidden = true;
    setState('loading');
    setProgress(Number.isFinite(options.progress) ? options.progress : 4);
    updateMessage(options.message || currentProfile.messages[0]);
    ui.overlay.hidden = false;
    requestAnimationFrame(() => ui.overlay.classList.add('is-visible'));
    startAnimation();
  }

  function complete(message) {
    const ui = ensureElements();
    activeCount = Math.max(activeCount - 1, 0);
    if (activeCount > 0) {
      setState('loading');
      setProgress(Math.max(progress, 82));
      startAnimation();
      return;
    }

    stopTimers();
    setProgress(100);
    setState('success');
    ui.title.textContent = 'Done';
    updateMessage(message || currentProfile.success || fallbackProfile.success);
    ui.eta.textContent = 'Finalizing process...';
    hideTimer = window.setTimeout(() => hideLoader(), 850);
  }

  function fail(message, options = {}) {
    const ui = ensureElements();
    stopTimers();
    setState('error');
    ui.title.textContent = 'Request Failed';
    updateMessage(message || 'Network connection lost.');
    ui.eta.textContent = 'Please check the details and try again.';
    retryHandler = options.retry || retryHandler;
    ui.retry.hidden = typeof retryHandler !== 'function';
    activeCount = Math.max(activeCount - 1, 0);

    if (ui.retry.hidden) {
      hideTimer = window.setTimeout(() => hideLoader(), 1800);
    }
  }

  function hideLoader(options = {}) {
    if (activeCount > 0 && !options.force && !options.immediate) {
      return;
    }

    const ui = ensureElements();
    activeCount = 0;
    stopTimers();
    ui.overlay.classList.remove('is-visible');
    if (options.immediate) {
      ui.overlay.hidden = true;
      return;
    }

    hideTimer = window.setTimeout(() => {
      ui.overlay.hidden = true;
      setState('loading');
      setProgress(0);
    }, 220);
  }

  async function track(task, options = {}) {
    const delay = Number.isFinite(options.delay) ? options.delay : 500;
    let visible = false;
    let settled = false;
    const profile = options.profile || getProfile(options);
    const showTimer = window.setTimeout(() => {
      if (!settled && !options.silentLoader) {
        visible = true;
        showLoader({ ...options, profile });
      }
    }, delay);

    try {
      const result = await task();
      settled = true;
      window.clearTimeout(showTimer);
      if (visible) {
        complete(options.success || profile.success);
      }
      return result;
    } catch (error) {
      settled = true;
      window.clearTimeout(showTimer);
      if (visible) {
        fail(error.message, { retry: options.retry });
      }
      throw error;
    }
  }

  return {
    showLoader,
    updateProgress: setProgress,
    updateMessage,
    hideLoader,
    complete,
    fail,
    track,
    getProfile,
  };
})();

window.LoadingManager = LoadingManager;
window.showLoader = LoadingManager.showLoader;
window.updateProgress = LoadingManager.updateProgress;
window.updateMessage = LoadingManager.updateMessage;
window.hideLoader = LoadingManager.hideLoader;

function normalizeFetchOptions(options = {}) {
  const { loaderTitle, loaderMessage, loaderSuccess, loaderDelay, loaderSilent, loaderRetry, ...fetchOptions } = options;
  return {
    fetchOptions,
    loaderOptions: {
      title: loaderTitle,
      message: loaderMessage,
      success: loaderSuccess,
      delay: loaderDelay,
      silentLoader: loaderSilent,
      retry: loaderRetry,
    },
  };
}

async function fetchJson(url, options = {}) {
  const { fetchOptions, loaderOptions } = normalizeFetchOptions(options);
  const requestUrl = String(url || '');
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const profile = LoadingManager.getProfile({ url: requestUrl, method });
  const execute = async () => {
    const response = await fetch(url, fetchOptions);
  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();
  const payload = contentType.includes('application/json')
    ? JSON.parse(rawBody || '{}')
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        `Request failed with status ${response.status}. Server returned ${contentType || 'an unexpected response'}.`
    );
  }

  if (!payload) {
    throw new Error(
      `Expected JSON response from ${url}, but received ${contentType || 'non-JSON content'}.`
    );
  }

    return payload;
  };

  return LoadingManager.track(execute, {
    url: requestUrl,
    method,
    profile,
    ...loaderOptions,
  });
}

function showToast(message, type = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack || !message) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function initAdminEmployeeMessageTest() {
  const form = document.getElementById('admin-employee-message-form');
  if (!form) return;

  const status = document.getElementById('admin-employee-message-status');
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      recipientId: String(formData.get('recipientId') || '').trim(),
      recipientRole: 'employee',
      recipientModel: 'Student',
      title: String(formData.get('title') || '').trim(),
      message: String(formData.get('message') || '').trim(),
      type: 'General',
      priority: 'normal',
      actionUrl: '/employee',
    };

    if (!payload.recipientId || !payload.title || !payload.message) {
      if (status) status.textContent = 'Select employee, title, and message.';
      showToast('Please complete the test message form.', 'warning');
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (status) status.textContent = 'Sending test message...';

    try {
      await fetchJson('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        loaderSuccess: 'Test notification sent successfully.',
      });
      if (status) status.textContent = 'Sent. Check employee notification center or browser push.';
      showToast('Employee test notification sent.', 'success');
    } catch (error) {
      if (status) status.textContent = error.message;
      showToast(error.message, 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function inferFormLoader(form) {
  const action = String(form.getAttribute('action') || window.location.pathname).toLowerCase();
  const text = form.textContent.toLowerCase();

  if (action.includes('logout') || text.includes('logout')) {
    return {
      title: 'Logout',
      message: 'Closing Secure Sign In...',
      success: 'Logged out successfully.',
    };
  }

  if (action.includes('login') || text.includes('login')) {
    return {
      title: 'Sign In',
      message: 'Checking your sign-in details...',
      success: 'Sign In completed successfully.',
    };
  }

  if (action.includes('signup') || action.includes('register')) {
    return {
      title: 'Employee Registration',
      message: 'Creating your account...',
      success: 'Account created successfully.',
    };
  }

  return {
    title: 'Processing Request',
    message: 'Submitting your request...',
    success: 'Process completed successfully.',
  };
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || event.defaultPrevented) {
    return;
  }

  const method = String(form.getAttribute('method') || 'GET').toUpperCase();
  if (method !== 'POST') {
    return;
  }

  window.setTimeout(() => {
    if (!event.defaultPrevented) {
      LoadingManager.showLoader(inferFormLoader(form));
    }
  }, 0);
});

document.addEventListener('click', (event) => {
  const exportLink = event.target.closest('a[href*="/export"], a[href*="/csv"], a[href*="/excel"], a[href*="/pdf"]');
  if (!exportLink || event.defaultPrevented || exportLink.target === '_blank') {
    return;
  }

  LoadingManager.showLoader({
    title: 'Data Export',
    message: 'Preparing report data...',
    success: 'Export generated successfully.',
  });
  window.setTimeout(() => LoadingManager.complete('Export generated successfully.'), 1200);
});

function createCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  return cell;
}

function renderStudents(students) {
  const tableBody = document.getElementById('students-table-body');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!students.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No employees registered yet.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  students.slice(0, 12).forEach((student) => {
    const row = document.createElement('tr');
    const employeeCell = document.createElement('td');
    employeeCell.innerHTML = `<span class="person-cell"><span class="avatar">${String(student.name || 'EM').slice(0, 2).toUpperCase()}</span><strong>${student.name}</strong></span>`;
    row.appendChild(employeeCell);

    const labelCell = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = student.faceLabel;
    labelCell.appendChild(code);
    row.appendChild(labelCell);

    row.appendChild(createCell(student.joiningDate ? new Date(student.joiningDate).toLocaleDateString() : '-'));
    row.appendChild(createCell(student.department || '-'));
    const accessCell = document.createElement('td');
    accessCell.innerHTML = `<span class="status-badge enrollment-${String(student.enrollmentStatus || 'Pending').toLowerCase().replaceAll(' ', '-')}">${student.enrollmentStatus || 'Pending'}</span>`;
    row.appendChild(accessCell);
    tableBody.appendChild(row);
  });
}

function renderAttendance(records, elementId, columnCount) {
  const tableBody = document.getElementById(elementId);
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!records.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columnCount;
    cell.textContent = 'No attendance marked yet.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  records.forEach((record) => {
    const row = document.createElement('tr');
    row.appendChild(createCell(record.student?.name || record.faceLabel));

    if (columnCount >= 13) {
      row.appendChild(createCell(record.student?.rollNumber || record.student?._id || '-'));
      const labelCell = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = record.faceLabel;
      labelCell.appendChild(code);
      row.appendChild(labelCell);
      row.appendChild(createCell(record.student?.department || '-'));
      row.appendChild(createCell(record.dateKey || new Date(record.markedAt).toISOString().slice(0, 10)));
      row.appendChild(createCell(new Date(record.joinTime || record.markedAt).toLocaleString()));
      row.appendChild(createCell(record.checkOutTime ? new Date(record.checkOutTime).toLocaleString() : '-'));
      row.appendChild(createCell(Number(record.matchAccuracy || record.confidence || 0).toFixed(3)));
      const statusCell = document.createElement('td');
      const lateText = record.lateByMinutes ? ` (${record.lateByMinutes}m late)` : '';
      statusCell.innerHTML = `<span class="security-badge">${record.attendanceStatus || record.status || 'Present'}${lateText}</span>`;
      row.appendChild(statusCell);
      row.appendChild(createCell(record.deviceName || '-'));
      row.appendChild(createLocationCell(record.location));
      row.appendChild(createCell(record.recognitionMethod || 'Face Recognition'));
      row.appendChild(createCell(new Date(record.createdAt || record.markedAt).toLocaleString()));
      tableBody.appendChild(row);
      return;
    }

    if (columnCount >= 4) {
      const labelCell = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = record.faceLabel;
      labelCell.appendChild(code);
      row.appendChild(labelCell);
    }

    row.appendChild(createCell(new Date(record.markedAt).toLocaleString()));
    row.appendChild(createCell(Number(record.confidence || 0).toFixed(3)));

    if (columnCount >= 5) {
      row.appendChild(createLocationCell(record.location));
    }

    if (columnCount >= 6) {
      const statusCell = document.createElement('td');
      statusCell.innerHTML = '<span class="security-badge">Present</span>';
      row.appendChild(statusCell);
    }

    tableBody.appendChild(row);
  });
}

function createLocationCell(location) {
  const cell = document.createElement('td');

  if (location?.latitude == null || location?.longitude == null) {
    cell.textContent = '-';
    return cell;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy || 0);
  const link = document.createElement('a');
  link.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

  cell.appendChild(link);

  if (accuracy) {
    const accuracyText = document.createElement('span');
    accuracyText.className = 'location-accuracy';
    accuracyText.textContent = ` +/- ${Math.round(accuracy)}m`;
    cell.appendChild(accuracyText);
  }

  return cell;
}

function renderSystemEvents(events) {
  const tableBody = document.getElementById('system-events-body');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!events.length) {
    const item = document.createElement('div');
    item.innerHTML = '<span class="event-dot"></span><strong>No activity recorded yet</strong><p>Waiting for device activity updates.</p>';
    tableBody.appendChild(item);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement('div');
    item.className = 'event-row';
    const employeeName = event.employeeName || event.user || 'Unknown';
    item.setAttribute('data-user', employeeName);
    item.innerHTML = `
      <span class="event-dot"></span>
      <strong>${employeeName} · ${event.event}</strong>
      <p>${new Date(event.occurredAt).toLocaleString()} · ${event.meaning || event.provider || event.sourceLog || '-'} · Activity ID ${event.eventId || '-'}</p>
    `;
    tableBody.appendChild(item);
  });
}

function filterEventsByUser(userName) {
  const rows = document.querySelectorAll('.event-row');
  rows.forEach((row) => {
    if (userName === '' || row.getAttribute('data-user') === userName) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  });
}

function attachUserFilterListener() {
  const userFilter = document.getElementById('user-filter');
  if (userFilter) {
    document.querySelectorAll('.employee-filter-card').forEach((card) => {
      const user = card.dataset.user || '';
      if (user && !Array.from(userFilter.options).some((option) => option.value === user)) {
        const label = card.querySelector('strong')?.textContent || user;
        userFilter.appendChild(new Option(label, user));
      }
    });
    if (userFilter.dataset.listenerReady !== 'true') {
      userFilter.dataset.listenerReady = 'true';
      userFilter.addEventListener('change', (e) => {
        filterEventsByUser(e.target.value);
        refreshSystemEvents().catch(() => {});
      });
    }
  }
}

function updateSystemEventsSummary(data) {
  const count = document.getElementById('system-events-count');
  const range = document.getElementById('system-events-range');
  const sync = document.getElementById('system-events-sync');
  const lockCount = document.getElementById('system-events-lock-count');
  const signInCount = document.getElementById('system-events-signin-count');
  const signOutCount = document.getElementById('system-events-signout-count');
  const sleepCount = document.getElementById('system-events-sleep-count');
  const activeIdle = document.getElementById('system-events-active-idle');

  if (count) {
    count.textContent = String((data.events || []).length);
  }

  if (range && data.range?.start && data.range?.end) {
    const start = new Date(data.range.start);
    const end = new Date(data.range.end);
    range.textContent = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  if (sync) {
    sync.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const totals = data.summary?.totals || data.totals || {};
  if (lockCount) {
    lockCount.textContent = String(totals.lockUnlock || 0);
  }
  if (signInCount) {
    signInCount.textContent = String(totals.signIn || 0);
  }
  if (signOutCount) {
    signOutCount.textContent = String(totals.signOut || 0);
  }
  if (sleepCount) {
    sleepCount.textContent = String(totals.sleepWake || 0);
  }
  if (activeIdle) {
    activeIdle.textContent = `${formatShortDuration(totals.activeMs || 0)} / ${formatShortDuration(totals.idleMs || 0)}`;
  }
}

function renderSystemEventsLiveFeed(events) {
  const feed = document.getElementById('system-events-live-feed');
  if (!feed) return;
  const rows = (events || []).slice(0, 5);
  if (!rows.length) {
    feed.innerHTML = '<div><span class="live-dot"></span><strong>No activity recorded yet</strong><p>Waiting for Windows agent or attendance activity.</p></div>';
    return;
  }
  feed.innerHTML = '';
  rows.forEach((event) => {
    const item = document.createElement('div');
    const employeeName = event.employeeName || event.user || 'Unknown employee';
    item.innerHTML = `
      <span class="live-dot"></span>
      <strong>${escapeHtml(employeeName)} - ${escapeHtml(event.event || 'Activity')}</strong>
      <p>${escapeHtml(new Date(event.occurredAt).toLocaleString())} - ${escapeHtml(event.meaning || event.provider || event.sourceLog || '-')}</p>
    `;
    feed.appendChild(item);
  });
}

async function refreshHomeData() {
  const [studentsData, attendanceData] = await Promise.all([
    fetchJson('/api/students'),
    fetchJson('/api/attendance'),
  ]);

  renderStudents(studentsData.students || []);
  renderAttendance(attendanceData.records || [], 'attendance-table-body', 3);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(Math.floor(Number(ms || 0) / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatShortDuration(ms) {
  const totalMinutes = Math.max(Math.floor(Number(ms || 0) / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function normalizeStatusLabel(status) {
  return String(status || 'offline').replace(/_/g, ' ');
}

function updateSessionTimerFromData(startedAt, checkoutAt) {
  const timer = document.getElementById('session-timer');
  if (!timer) {
    return;
  }

  timer.dataset.startedAt = startedAt || '';
  timer.dataset.checkoutAt = checkoutAt || '';
}

function renderEmployeeSessionEvents(session) {
  const list = document.getElementById('employee-session-events');
  if (!list) {
    return;
  }

  const events = session?.events || [];
  list.innerHTML = '';

  if (!events.length) {
    list.innerHTML = '<div><span class="event-dot"></span><strong>Waiting for attendance</strong><p>Work activity such as device start, screen unlock, app use, and attendance will appear here.</p></div>';
    return;
  }

  events.slice(-12).reverse().forEach((event) => {
    const item = document.createElement('div');
    item.className = 'event-row-live';
    item.innerHTML = `
      <span class="event-dot"></span>
      <strong>${event.type || 'Activity'}</strong>
      <p>${new Date(event.occurredAt).toLocaleString()} · ${event.message || event.deviceInfo || event.category || 'Live activity update'}</p>
    `;
    list.appendChild(item);
  });
}

function renderEmployeeSession(data) {
  const session = data?.session;
  const statusText = document.getElementById('session-status-text');
  const detail = document.getElementById('session-status-detail');
  const dot = document.getElementById('session-state-dot');
  const eventCount = document.getElementById('session-event-count');
  const productivity = document.getElementById('session-productivity');
  const completeButton = document.getElementById('complete-daily-task');

  if (statusText) {
    statusText.textContent = session ? normalizeStatusLabel(session.liveStatus || session.status).toUpperCase() : 'PENDING ATTENDANCE';
  }

  if (detail) {
    detail.textContent = session
      ? session.status === 'checked_out'
        ? 'Device tracking is stopped for the rest of the day.'
        : 'Device tracking is active today.'
      : 'Mark attendance to start your workday.';
  }

  if (dot) {
    dot.className = `session-state ${session ? session.liveStatus || session.status : 'offline'}`;
  }

  if (eventCount) {
    eventCount.textContent = String(session?.eventCount || session?.events?.length || 0);
  }

  if (productivity) {
    productivity.textContent = `${session?.productivityScore || 0}%`;
  }

  if (completeButton) {
    completeButton.dataset.sessionId = session?._id || '';
    completeButton.disabled = !session || session.status === 'checked_out' || session.liveStatus === 'checked_out';
  }

  const checkoutButton = document.getElementById('checkout-work-button');
  if (checkoutButton) {
    checkoutButton.dataset.sessionId = session?._id || '';
    checkoutButton.disabled = !session || session.status === 'checked_out' || session.liveStatus === 'checked_out';
  }

  const joinButton = document.getElementById('join-work-button');
  if (joinButton) {
    joinButton.disabled = Boolean(session && session.status !== 'checked_out' && session.liveStatus !== 'checked_out');
  }

  const planPreview = document.getElementById('daily-plan-preview');
  if (planPreview) {
    planPreview.textContent = session?.dailyPlan || 'No work plan submitted yet. Click JOIN WORK to add today’s plan.';
  }

  const syncBadge = document.getElementById('session-sync-badge');
  if (syncBadge) {
    syncBadge.innerHTML = `<span class="live-dot"></span>${session && session.status !== 'checked_out' ? 'Work session active' : 'Ready'}`;
  }

  const permissionModal = document.getElementById('monitoring-permission-modal');
  if (permissionModal && session && session.status !== 'checked_out' && session.monitoringPermission === 'pending') {
    permissionModal.hidden = false;
  }

  updateSessionTimerFromData(session?.startedAt || '', session?.checkoutAt || '');
  renderEmployeeSessionEvents(session);
}

async function loadDailyWorkSession() {
  const consolePanel = document.getElementById('daily-work-session');
  if (!consolePanel) {
    return;
  }

  const employeeId = consolePanel.dataset.employeeId || '';
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
  const data = await fetchJson(`/api/work-sessions/today${query}`);
  renderEmployeeSession(data);
}

async function sendEmployeeActivity(type, metadata = {}) {
  const consolePanel = document.getElementById('daily-work-session');
  const completeButton = document.getElementById('complete-daily-task');
  const sessionId = completeButton?.dataset.sessionId || '';
  const permissionModal = document.getElementById('monitoring-permission-modal');

  if (!consolePanel || !sessionId || completeButton.disabled || (permissionModal && !permissionModal.hidden)) {
    return;
  }

  await fetchJson('/api/work-sessions/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employee: consolePanel.dataset.employeeId,
      type,
      occurredAt: new Date().toISOString(),
      deviceInfo: navigator.platform || 'Browser workstation',
      message: metadata.message || `${type} captured from employee workspace.`,
      metadata: {
        source: 'employee-work-session',
        ...metadata,
      },
    }),
  });
}

function startEmployeeActivityCollector() {
  const consolePanel = document.getElementById('daily-work-session');
  if (!consolePanel) {
    return;
  }

  sendEmployeeActivity('Active State', { message: 'Employee work session page became active.' }).catch(() => {});

  let lastInteraction = Date.now();
  ['keydown', 'mousemove', 'click'].forEach((eventName) => {
    window.addEventListener(eventName, () => {
      lastInteraction = Date.now();
    });
  });

  document.addEventListener('visibilitychange', () => {
    const type = document.hidden ? 'Idle State' : 'Active State';
    sendEmployeeActivity(type, { message: document.hidden ? 'Employee workspace moved to background.' : 'Employee workspace active again.' }).catch(() => {});
  });

  window.setInterval(() => {
    const idleMs = Date.now() - lastInteraction;
    const type = idleMs > 120000 ? 'Idle State' : 'Active State';
    sendEmployeeActivity(type, {
      durationMs: idleMs > 120000 ? idleMs : 60000,
      message: idleMs > 120000 ? 'No keyboard or mouse activity detected.' : 'Keyboard/mouse activity detected.',
    })
      .then(loadDailyWorkSession)
      .catch(() => {});
  }, 60000);
}

function renderAdminMonitoring(data) {
  const tableBody = document.getElementById('admin-monitoring-body');
  if (!tableBody) {
    return;
  }

  const rows = data.rows || [];
  tableBody.innerHTML = '';

  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="9">No employees registered yet.</td></tr>';
    return;
  }

  rows.forEach((row) => {
    const employee = row.employee || {};
    const status = row.currentStatus || 'offline';
    const tr = document.createElement('tr');
    if (tableBody.dataset.mode === 'workday') {
      tr.innerHTML = `
        <td><span class="person-cell"><span class="avatar">${String(employee.name || 'EM').slice(0, 2).toUpperCase()}</span><strong>${employee.name || 'Employee'}</strong></span></td>
        <td>${row.laptopOnSince ? new Date(row.laptopOnSince).toLocaleTimeString() : '-'}</td>
        <td>${row.checkoutTime ? new Date(row.checkoutTime).toLocaleTimeString() : '-'}</td>
        <td><span class="status-badge status-${status}">${normalizeStatusLabel(status)}</span></td>
        <td>${row.dailyPlan || '-'}</td>
        <td>${row.taskStatus || '-'}</td>
        <td>${row.workSummary || '-'}</td>
        <td>${row.pendingWork || '-'}</td>
        <td>${formatShortDuration(row.workingMs)}</td>
      `;
    } else {
      tr.innerHTML = `
        <td><span class="person-cell"><span class="avatar">${String(employee.name || 'EM').slice(0, 2).toUpperCase()}</span><strong>${employee.name || 'Employee'}</strong></span></td>
        <td><span class="status-badge status-${status}">${row.deviceState || normalizeStatusLabel(status)}</span></td>
        <td>${row.laptopOnSince ? new Date(row.laptopOnSince).toLocaleTimeString() : '-'}</td>
        <td>${formatShortDuration(row.activeMs)}</td>
        <td>${formatShortDuration(row.idleMs)}</td>
        <td>${formatShortDuration(row.sleepMs)}</td>
        <td>${row.lastActivity ? new Date(row.lastActivity).toLocaleTimeString() : '-'}</td>
        <td>${row.attendanceTime ? new Date(row.attendanceTime).toLocaleTimeString() : '-'}</td>
        <td>${row.checkoutTime ? new Date(row.checkoutTime).toLocaleTimeString() : '-'}</td>
        <td>${row.productivityScore || 0}%</td>
      `;
    }
    tableBody.appendChild(tr);
  });

  const counts = data.counts || {};
  const countMap = {
    'admin-active-count': counts.active || 0,
    'admin-idle-count': counts.idle || 0,
    'admin-checkout-count': counts.checkedOut || 0,
    'admin-offline-count': counts.offline || 0,
  };

  Object.entries(countMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = String(value);
    }
  });

  const dashboardCountMap = {
    'dashboard-active-count': counts.active || 0,
    'dashboard-idle-count': counts.idle || 0,
    'dashboard-checkout-count': counts.checkedOut || 0,
    'dashboard-offline-count': counts.offline || 0,
  };

  Object.entries(dashboardCountMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = String(value);
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

async function refreshAdminMonitoring() {
  const tableBody = document.getElementById('admin-monitoring-body');
  if (!tableBody) {
    return;
  }

  const data = await fetchJson('/api/work-sessions/admin/live');
  renderAdminMonitoring(data);
}

async function refreshSystemEvents() {
  const status = document.getElementById('system-events-status');
  if (status) {
    status.textContent = 'Refreshing system activity from 8:00 AM to the current time...';
  }

  try {
    const date = document.getElementById('system-events-date')?.value || '';
    const from = document.getElementById('system-events-from')?.value || '';
    const to = document.getElementById('system-events-to')?.value || '';
    const employee = document.getElementById('user-filter')?.value || '';
    const department = document.getElementById('department-filter')?.value || '';
    const eventType = document.querySelector('[data-event-filter].active')?.dataset.eventFilter || '';
    const params = new URLSearchParams({ sort: 'asc', limit: '500' });
    if (date) params.set('date', date);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (employee) params.set('employee', employee);
    if (department) params.set('department', department);
    if (eventType) params.set('event', eventType);
    if (!date && !from && !to && !employee && !department && !eventType) params.set('limit', '100');
    const [data, summary] = await Promise.all([
      fetchJson(`/api/system-events?${params.toString()}`),
      fetchJson(`/api/system-events/dashboard-summary?${params.toString()}`),
    ]);
    data.summary = summary;
    renderEnhancedSystemEvents(data.events || []);
    renderSystemEventsLiveFeed(summary.latestEvents || data.events || []);
    updateSystemEventsSummary(data);
    attachUserFilterListener();

    if (status) {
      status.textContent = `Showing ${data.events.length} activity record(s).`;
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message;
    }
  }
}

let cameraStream = null;
let scanInterval = null;
let scanInFlight = false;
let enrollmentCameraStream = null;
let enrollmentImages = [];
let attendanceLocation = null;
let attendanceLocationAt = 0;
let locationRetryAfter = 0;
const SCAN_CANVAS_WIDTH = 520;

// Scan countdown timer
let scanCountdownInterval = null;
let scanCountdownValue = 0;

function startScanCountdown() {
  const timerEl = document.getElementById('scan-countdown-timer');
  if (!timerEl) return;
  scanCountdownValue = 1400; // ms matching scanInterval
  timerEl.hidden = false;
  if (scanCountdownInterval) window.clearInterval(scanCountdownInterval);
  scanCountdownInterval = window.setInterval(() => {
    scanCountdownValue = Math.max(0, scanCountdownValue - 100);
    const pct = Math.round(((1400 - scanCountdownValue) / 1400) * 100);
    const bar = timerEl.querySelector('.scan-timer-bar-fill');
    const label = timerEl.querySelector('.scan-timer-label');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = scanCountdownValue > 0
      ? `Aagla scan ${(scanCountdownValue / 1000).toFixed(1)}s mein hoga`
      : 'Scanning...';
    if (scanCountdownValue === 0) {
      scanCountdownValue = 1400;
    }
  }, 100);
}

function stopScanCountdown() {
  if (scanCountdownInterval) {
    window.clearInterval(scanCountdownInterval);
    scanCountdownInterval = null;
  }
  const timerEl = document.getElementById('scan-countdown-timer');
  if (timerEl) timerEl.hidden = true;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setScannerState(id, message, mode = 'idle') {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = message;
    element.dataset.state = mode;
  }
}

function drawVideoToScanCanvas(video, canvas) {
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  const width = Math.min(SCAN_CANVAS_WIDTH, sourceWidth);
  const height = Math.round(width * (sourceHeight / sourceWidth));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  return context;
}

function readFrameMetrics(context, canvas) {
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  let totalSq = 0;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = (data[index] * 0.2126) + (data[index + 1] * 0.7152) + (data[index + 2] * 0.0722);
    total += luminance;
    totalSq += luminance * luminance;
  }

  const pixels = data.length / 4;
  const brightness = total / pixels;
  const contrast = Math.sqrt(Math.max((totalSq / pixels) - (brightness * brightness), 0));

  return {
    brightness,
    contrast,
    brightnessLabel: brightness < 45 ? 'Lighting is too low. Please move to a brighter area.' : brightness > 220 ? 'Lighting is too bright. Please reduce glare.' : 'Lighting looks good.',
    qualityLabel: contrast < 26 ? 'Image is blurry. Please hold still and try again.' : 'Image quality looks good.',
    canSend: brightness >= 28 && brightness <= 238 && contrast >= 14,
  };
}

function friendlyFaceMessage(message = '', stage = '') {
  const text = String(message || '').toLowerCase();
  if (stage === 'no_face' || text.includes('no face') || text.includes('face not detected')) {
    return { icon: 'fa-user-slash', mode: 'warning', text: 'Please position your face inside the frame.' };
  }
  if (text.includes('too far')) return { icon: 'fa-magnifying-glass-plus', mode: 'warning', text: 'Move closer to the camera.' };
  if (text.includes('too close')) return { icon: 'fa-magnifying-glass-minus', mode: 'warning', text: 'Move slightly away from the camera.' };
  if (text.includes('low light') || text.includes('too low')) return { icon: 'fa-lightbulb', mode: 'warning', text: 'Lighting is too low. Please move to a brighter area.' };
  if (text.includes('blur') || text.includes('hold still')) return { icon: 'fa-hand', mode: 'warning', text: 'Image is blurry. Please hold still and try again.' };
  if (text.includes('multiple')) return { icon: 'fa-users', mode: 'warning', text: 'Only one face should be visible.' };
  if (text.includes('turned') || text.includes('angle')) return { icon: 'fa-face-smile', mode: 'warning', text: 'Please look directly at the camera.' };
  if (text.includes('camera')) return { icon: 'fa-video-slash', mode: 'error', text: 'Camera access is required.' };
  if (text.includes('liveness')) return { icon: 'fa-eye', mode: 'warning', text: 'Please blink or move naturally.' };
  if (text.includes('not recognized') || text.includes('low match accuracy')) return { icon: 'fa-circle-exclamation', mode: 'error', text: 'We could not verify your identity.' };
  if (text.includes('failed') || text.includes('unavailable')) return { icon: 'fa-rotate-right', mode: 'error', text: 'Face scan failed. Please try again.' };
  return { icon: 'fa-circle-info', mode: 'info', text: message || 'Please keep your face centered inside the frame.' };
}

function renderFeedbackMessage(element, feedback) {
  if (!element) return;
  element.innerHTML = `<i class="fa-solid ${feedback.icon}"></i><span>${feedback.text}</span>`;
  element.dataset.status = feedback.mode;
}

function positionFaceBox(boxId, box, canvas) {
  const element = document.getElementById(boxId);
  if (!element) {
    return;
  }

  if (!box || !canvas.width || !canvas.height) {
    element.hidden = true;
    return;
  }

  element.hidden = false;
  element.style.left = `${clamp((box.x / canvas.width) * 100, 0, 100)}%`;
  element.style.top = `${clamp((box.y / canvas.height) * 100, 0, 100)}%`;
  element.style.width = `${clamp((box.w / canvas.width) * 100, 8, 100)}%`;
  element.style.height = `${clamp((box.h / canvas.height) * 100, 8, 100)}%`;
}

function updateAttendanceScannerTelemetry(response, canvas, frameMetrics) {
  const confidence = Number(response?.recognition?.confidence || response?.confidence || 0);
  updateText('attendance-confidence', `Match Accuracy ${(confidence * 100).toFixed(1)}%`);
  updateText('attendance-light-state', response?.quality?.brightness?.message || frameMetrics?.brightnessLabel || 'Lighting stable');
  updateText('attendance-quality-state', response?.quality?.blur?.message || frameMetrics?.qualityLabel || 'Frame sharp');
  updateText('attendance-face-state', response?.box || response?.recognition?.box ? 'Face Detected' : 'Searching Face');
  positionFaceBox('attendance-face-box', response?.recognition?.box || response?.box, canvas);
}

function setScanStatus(message) {
  const scanStatus = document.getElementById('camera-status');
  if (scanStatus) {
    scanStatus.textContent = message;
  }
}

function setRecognitionResult(message, isSuccess = null, studentName = null, confidence = null) {
  const result = document.getElementById('recognition-result');
  if (result) {
    if (isSuccess) {
      const confidencePercent = confidence ? (Number(confidence) * 100).toFixed(1) : 'N/A';
      const displayMsg = studentName
        ? `Success: ${studentName}'s attendance was marked successfully. (${confidencePercent}% match accuracy)`
        : 'Success: Attendance was marked successfully.';
      renderFeedbackMessage(result, { icon: 'fa-circle-check', mode: 'success', text: displayMsg });
      result.classList.add('status-success');
      result.classList.remove('status-error');
      showToast(displayMsg, 'success');
    } else if (isSuccess === false) {
      renderFeedbackMessage(result, friendlyFaceMessage(message));
      result.classList.add('status-error');
      result.classList.remove('status-success');
    } else {
      renderFeedbackMessage(result, friendlyFaceMessage(message));
      result.classList.remove('status-error', 'status-success');
    }
  }
}

function setLocationStatus(message) {
  const locationStatus = document.getElementById('location-status');
  if (locationStatus) {
    locationStatus.textContent = message;
  }
}

function setScanLoading(isLoading) {
  const startButton = document.getElementById('start-camera');
  const scanButton = document.getElementById('scan-now');
  const loader = document.getElementById('camera-loader');

  if (startButton) {
    startButton.disabled = isLoading;
  }

  if (scanButton) {
    scanButton.disabled = isLoading;
  }

  if (loader) {
    loader.textContent = isLoading ? 'Matching identity with secure face model...' : '';
  }
}

const faceScanProgressTimers = new Map();

function setFaceScanProgress(prefix, value, label, state = 'scanning') {
  const progress = document.getElementById(`${prefix}-scan-progress`);
  const fill = document.getElementById(`${prefix}-scan-progress-fill`);
  const valueElement = document.getElementById(`${prefix}-scan-progress-value`);
  const labelElement = document.getElementById(`${prefix}-scan-progress-label`);
  const safeValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  if (progress) progress.dataset.state = state;
  if (fill) fill.style.width = `${safeValue}%`;
  if (valueElement) valueElement.textContent = `${safeValue}%`;
  if (labelElement) labelElement.textContent = label;
}

function startFaceScanProgress(prefix, label = 'Detecting face') {
  window.clearInterval(faceScanProgressTimers.get(prefix));
  let value = 4;
  setFaceScanProgress(prefix, value, label);
  const timer = window.setInterval(() => {
    value = Math.min(88, value + (value < 45 ? 7 : value < 72 ? 4 : 2));
    setFaceScanProgress(prefix, value, value < 38 ? 'Detecting face' : value < 68 ? 'Checking image quality' : 'Matching identity');
  }, 260);
  faceScanProgressTimers.set(prefix, timer);
}

function finishFaceScanProgress(prefix, success, label) {
  window.clearInterval(faceScanProgressTimers.get(prefix));
  faceScanProgressTimers.delete(prefix);
  setFaceScanProgress(prefix, success ? 100 : 0, label, success ? 'success' : 'error');
}

// Show/hide problem hints below the face scan box
function updateScanProblems(problems = []) {
  const hintsEl = document.getElementById('scan-problem-hints');
  const listEl = document.getElementById('scan-problem-list');
  if (!hintsEl || !listEl) return;
  if (!problems || problems.length === 0) {
    hintsEl.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }
  hintsEl.style.display = 'block';
  listEl.innerHTML = problems.map(p => `<li>${p}</li>`).join('');
}

async function scanCurrentFrame() {
  if (scanInFlight) {
    return;
  }

  const video = document.getElementById('camera-feed');
  const canvas = document.getElementById('camera-canvas');

  if (!video || !canvas || video.readyState < 2) {
    return;
  }

  scanInFlight = true;
  startFaceScanProgress('attendance');
  setScanLoading(true);
  setScanStatus('Detecting face...');
  setScannerState('attendance-scanner-state', 'Analyzing Face', 'scanning');

  try {
    const context = drawVideoToScanCanvas(video, canvas);
    const frameMetrics = readFrameMetrics(context, canvas);
    updateText('attendance-light-state', frameMetrics.brightnessLabel);
    updateText('attendance-quality-state', frameMetrics.qualityLabel);

    if (!frameMetrics.canSend) {
      finishFaceScanProgress('attendance', false, 'Improve lighting or clarity');
      setScannerState('attendance-scanner-state', 'Improve Frame', 'warning');
      setRecognitionResult(`${frameMetrics.brightnessLabel} ${frameMetrics.qualityLabel}`, false);
      const frameProblems = [];
      if (frameMetrics.brightness < 45) frameProblems.push('Roshni bahut kam hai — roshan jagah mein baithe ya light on karein.');
      else if (frameMetrics.brightness > 220) frameProblems.push('Roshni bahut tej hai — direct light ya glare se door ho jayen.');
      if (frameMetrics.contrast < 26) frameProblems.push('Camera blur hai — seedha baithein aur hilna band karein.');
      updateScanProblems(frameProblems);
      return;
    }

    setScanStatus('Matching face...');
    setScannerState('attendance-scanner-state', 'Matching Identity', 'matching');

    const payload = {
      image: canvas.toDataURL('image/jpeg', 0.82),
      location: await getAttendanceLocation(),
    };

    const response = await fetchJson('/api/attendance/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      loaderSilent: true,
    });

    if (response.recognized) {
      const studentName = response.record?.student?.name || response.recognition?.label || 'Teacher';
      const confidence = response.recognition?.confidence || response.record?.confidence || 0;
      const isDuplicate = response.duplicate;
      updateAttendanceScannerTelemetry(response, canvas, frameMetrics);
      setScannerState('attendance-scanner-state', 'Verified Successfully', 'success');
      finishFaceScanProgress('attendance', true, 'Face matched successfully');
      updateScanProblems([]); // clear any old problems on success
      setRecognitionResult('', true, studentName, confidence);
      
      if (!isDuplicate) {
        setScanStatus('Success: Attendance marked successfully.');
        
        setTimeout(() => {
          stopLiveCamera();
          setScanStatus('Camera stopped - Attendance process complete');
          setRecognitionResult('Start the camera again for a new scan.');
        }, 3000);
      } else {
        setScanStatus(`${studentName}'s attendance is already marked for today.`);
      }
      
      await refreshHomeData();
      await loadDailyWorkSession();
      stopLiveCamera();
      const joinModal = document.getElementById('join-work-modal');
      if (joinModal) {
        joinModal.hidden = false;
        window.setTimeout(() => document.getElementById('daily-plan-input')?.focus(), 80);
      }
    } else {
      finishFaceScanProgress('attendance', false, 'Face not matched - scan again');
      const confidence = Number(response.confidence || 0).toFixed(3);
      const message = friendlyFaceMessage(response.message || 'Face was not recognized.', response.stage).text;
      const qualityIssues = response.quality_issues || [];
      updateAttendanceScannerTelemetry(response, canvas, frameMetrics);
      setScannerState('attendance-scanner-state', response.stage === 'no_face' ? 'Center Face' : 'Face Not Recognized', 'error');
      
      // Build problem list with clear Urdu/Hindi-friendly reasons
      const problemReasons = [];
      if (response.stage === 'no_face') {
        problemReasons.push('Koi chehra frame mein nahi mila — apna chehra center mein rakhein.');
      } else if (response.stage === 'multiple_faces') {
        problemReasons.push('Ek se zyada log camera mein hain — akele rahein.');
      } else if (response.stage === 'recognition' || response.stage === 'low_confidence') {
        problemReasons.push(`Chehra pehchana nahi gaya (match ${(Number(response.confidence || 0) * 100).toFixed(1)}%) — seedha camera ki taraf dekhein.`);
      }
      if (!frameMetrics.canSend) {
        if (frameMetrics.brightness < 45) problemReasons.push('Roshni bahut kam hai — roshan jagah mein baithe.');
        else if (frameMetrics.brightness > 220) problemReasons.push('Roshni bahut zyada hai — glare kam karein.');
        if (frameMetrics.contrast < 26) problemReasons.push('Tasveer blur hai — camera ke saamne seedha raho aur hilna band karo.');
      }
      if (qualityIssues && qualityIssues.length > 0) {
        qualityIssues.forEach(q => problemReasons.push(q));
      }
      if (problemReasons.length === 0) {
        problemReasons.push(message);
      }
      updateScanProblems(problemReasons);

      let displayMsg = message;
      if (qualityIssues && qualityIssues.length > 0) {
        displayMsg += ` | ${qualityIssues.join(' | ')}`;
      }
      
      setRecognitionResult(displayMsg, false);
    }
  } catch (error) {
      finishFaceScanProgress('attendance', false, 'Scan failed - try again');
      setRecognitionResult(error.message, false);
      setScannerState('attendance-scanner-state', 'Scan Failed', 'error');
      updateScanProblems(['Server se response nahi mila — internet connection check karein aur dobara koshish karein.']);
    } finally {
      setScanLoading(false);
      setScanStatus(cameraStream ? 'Camera live - real-time scan is active.' : 'Camera stopped');
      scanInFlight = false;
    }
}

async function getAttendanceLocation(forceRefresh = false) {
  if (!navigator.geolocation) {
    setLocationStatus('Location tracking is not available in this browser.');
    return null;
  }

  const now = Date.now();
  if (!forceRefresh && attendanceLocation && now - attendanceLocationAt < 5 * 60 * 1000) {
    return attendanceLocation;
  }

  if (!forceRefresh && now < locationRetryAfter) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        attendanceLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        };
        attendanceLocationAt = Date.now();
        locationRetryAfter = 0;
        setLocationStatus(
          `Location captured: ${attendanceLocation.latitude.toFixed(5)}, ${attendanceLocation.longitude.toFixed(5)}`
        );
        resolve(attendanceLocation);
      },
      (error) => {
        locationRetryAfter = Date.now() + 60 * 1000;
        setLocationStatus(`Location was not captured: ${error.message}`);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  });
}

async function startLiveCamera() {
  const video = document.getElementById('camera-feed');
  if (!video) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    setScanStatus('Camera access is not available.');
    setRecognitionResult('Camera access is required.', false);
    return;
  }

  if (cameraStream) {
    setScanStatus('Camera already running.');
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });

    video.srcObject = cameraStream;
    await video.play();

    setScanStatus('Camera is live. Live face scan started.');
    setScannerState('attendance-scanner-state', 'Detecting Face', 'scanning');
    setRecognitionResult('Live recognition is ready. Center your face inside the scanner.');
    getAttendanceLocation(true);

    scanInterval = window.setInterval(scanCurrentFrame, 1400);
    window.setTimeout(scanCurrentFrame, 450);
    startScanCountdown();
  } catch (error) {
    cameraStream = null;
    setScanStatus('Camera access blocked.');
    setRecognitionResult('Camera access is required.', false);
  }
}

function stopLiveCamera() {
  const video = document.getElementById('camera-feed');

  if (scanInterval) {
    window.clearInterval(scanInterval);
    scanInterval = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (video) {
    video.pause();
    video.srcObject = null;
  }

  setScanStatus('Camera stopped.');
  stopScanCountdown();
}

function setEnrollmentCameraStatus(message) {
  const status = document.getElementById('enrollment-camera-status');
  if (status) {
    const feedback = friendlyFaceMessage(message);
    status.innerHTML = `<i class="fa-solid ${feedback.icon}"></i> ${feedback.text}`;
    status.dataset.status = feedback.mode;
  }
}

function setEnrollmentSampleStatus(message) {
  const status = document.getElementById('enrollment-sample-status');
  if (status) {
    const feedback = friendlyFaceMessage(message);
    status.innerHTML = `<i class="fa-solid ${feedback.icon}"></i> ${feedback.text}`;
    status.dataset.status = feedback.mode;
  }
}

function updateSignupBiometricProgress(progress, activeIndex = null) {
  const badge = document.getElementById('signup-biometric-progress');
  if (badge) {
    badge.textContent = `${Math.min(Math.max(progress, 0), 100)}% complete`;
  }

  const steps = document.querySelectorAll('.scan-step-list span');
  steps.forEach((step, index) => {
    step.classList.toggle('active', activeIndex === index);
    step.classList.toggle('complete', activeIndex !== null && index < activeIndex);
  });
}

function renderEnrollmentPreview() {
  const preview = document.getElementById('enrollment-preview');
  if (!preview) {
    return;
  }

  preview.innerHTML = '';

  enrollmentImages.forEach((image, index) => {
    const img = document.createElement('img');
    img.src = image;
    img.alt = `Enrollment sample ${index + 1}`;
    preview.appendChild(img);
  });
}

async function startEnrollmentCamera() {
  const video = document.getElementById('enrollment-camera-feed');
  if (!video) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    setEnrollmentCameraStatus('Camera access is not available. Open this page at http://localhost:3000.');
    return;
  }

  if (enrollmentCameraStream) {
    setEnrollmentCameraStatus('Enrollment camera already running.');
    return;
  }

  try {
    enrollmentCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });

    video.srcObject = enrollmentCameraStream;
    await video.play();
    setEnrollmentCameraStatus('Enrollment camera is live. Keep your face centered and capture samples.');
  } catch (error) {
    enrollmentCameraStream = null;
    setEnrollmentCameraStatus(`Camera could not be opened: ${error.message}`);
  }
}

function stopEnrollmentCamera() {
  const video = document.getElementById('enrollment-camera-feed');

  if (enrollmentCameraStream) {
    enrollmentCameraStream.getTracks().forEach((track) => track.stop());
    enrollmentCameraStream = null;
  }

  if (video) {
    video.pause();
    video.srcObject = null;
  }

  setEnrollmentCameraStatus('Enrollment camera stopped.');
}

async function captureEnrollmentSamples() {
  const video = document.getElementById('enrollment-camera-feed');
  const canvas = document.getElementById('enrollment-camera-canvas');

  if (!video || !canvas || video.readyState < 2) {
    setEnrollmentSampleStatus('Start the enrollment camera first.');
    return;
  }

  enrollmentImages = [];
  renderEnrollmentPreview();
  setEnrollmentSampleStatus('Capturing 12 face samples...');
  const faceQuality = document.getElementById('face-quality');
  const lightingQuality = document.getElementById('lighting-quality');
  const faceValidation = document.getElementById('face-validation');
  const alignmentStatus = document.getElementById('alignment-status');

  const requiredPrompts = ['Look straight', 'Turn slightly left', 'Turn slightly right', 'Move closer', 'Blink once', 'Hold still'];
  let promptIndex = 0;

  while (enrollmentImages.length < 12) {
    const context = drawVideoToScanCanvas(video, canvas);
    const metrics = readFrameMetrics(context, canvas);
    const progress = Math.round((enrollmentImages.length / 12) * 100);

    if (!metrics.canSend) {
      setEnrollmentSampleStatus(`${metrics.brightnessLabel} ${metrics.qualityLabel}`);
      if (faceQuality) faceQuality.textContent = `Quality ${Math.max(15, Math.round(metrics.contrast))}%`;
      if (lightingQuality) lightingQuality.textContent = metrics.brightnessLabel;
      if (faceValidation) faceValidation.textContent = 'Frame rejected';
      if (alignmentStatus) alignmentStatus.textContent = 'Center face';
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      continue;
    }

    enrollmentImages.push(canvas.toDataURL('image/jpeg', 0.86));
    renderEnrollmentPreview();
    const captured = enrollmentImages.length;
    setEnrollmentSampleStatus(`Captured ${captured}/12 face samples - ${requiredPrompts[promptIndex]}`);
    updateSignupBiometricProgress(Math.round((captured / 12) * 100), Math.min(Math.floor(captured / 2), 6));
    if (faceQuality) {
      faceQuality.textContent = `Quality ${Math.min(100, Math.round(metrics.contrast * 2.5))}%`;
    }
    if (lightingQuality) {
      lightingQuality.textContent = metrics.brightnessLabel;
    }
    if (faceValidation) {
      faceValidation.textContent = 'Face sample accepted';
    }
    if (alignmentStatus) {
      alignmentStatus.textContent = requiredPrompts[promptIndex];
    }
    promptIndex = (promptIndex + 1) % requiredPrompts.length;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => window.setTimeout(resolve, 260));
  }

  setEnrollmentSampleStatus('Face photos are ready. Secure upload can begin.');
  updateSignupBiometricProgress(100, 6);
  if (faceValidation) {
    faceValidation.textContent = 'Face validation passed';
  }
}

async function refreshAttendancePage() {
  const status = document.getElementById('attendance-page-status');
  const dateFilter = document.getElementById('attendance-date-filter');
  const dateQuery = dateFilter?.value ? `?date=${encodeURIComponent(dateFilter.value)}` : '';
  if (status) {
    status.textContent = 'Refreshing records...';
  }

  try {
    const attendanceData = await fetchJson(`/api/attendance${dateQuery}`);
    renderAttendance(attendanceData.records || [], 'attendance-page-body', 13);

    if (status) {
      status.textContent = `Showing ${attendanceData.records.length} record(s)${dateFilter?.value ? ` for ${dateFilter.value}` : ' latest'}.`;
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message;
    }
  }
}

const studentForm = document.getElementById('student-form');
if (studentForm) {
  studentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formStatus = document.getElementById('student-form-status');
    const submitButton = studentForm.querySelector('button[type="submit"]');
    const formData = new FormData(studentForm);
    const payload = Object.fromEntries(formData.entries());
    payload.enrollmentImages = enrollmentImages;

    if (enrollmentImages.length < 6) {
      if (formStatus) {
        formStatus.textContent = 'Capture at least 6 face samples first.';
      }
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    if (formStatus) {
      formStatus.textContent = 'Employee registration is in progress. Please wait...';
    }

    try {
      const existingStudentId = studentForm.dataset.studentId || '';
      const endpoint = existingStudentId ? `/api/students/${existingStudentId}/enrollment` : '/api/students';
      const method = existingStudentId ? 'PUT' : 'POST';

      const data = await fetchJson(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (formStatus) {
        formStatus.textContent = data.modelWarning
          ? `Cloudinary sync complete. Model rebuild warning: ${data.modelWarning}`
          : existingStudentId
            ? 'Face data updated. Verification status is pending admin review.'
            : 'Employee identity saved and the model was trained. You can now mark attendance.';
        showToast(data.modelWarning ? 'Cloudinary sync complete. Model rebuild needs attention.' : 'Identity saved, Cloudinary synced, and AI model trained.');
      }

      if (!existingStudentId) {
        studentForm.reset();
      }
      enrollmentImages = [];
      renderEnrollmentPreview();
      const enrollmentProfilePhoto = document.getElementById('enrollment-profile-photo');
      if (enrollmentProfilePhoto && data.student?.profileImage?.url) {
        enrollmentProfilePhoto.src = data.student.profileImage.url;
      }
      setEnrollmentSampleStatus('Required samples: 6 minimum. Recommended: 12.');
      await refreshHomeData();
    } catch (error) {
      if (formStatus) {
        formStatus.textContent = error.message;
        showToast(error.message);
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });

  refreshHomeData().catch((error) => {
    const formStatus = document.getElementById('student-form-status');
    if (formStatus) {
      formStatus.textContent = error.message;
    }
  });
}

const employeeProfileForm = document.getElementById('employee-profile-form');
const profilePhotoInput = document.getElementById('profile-photo-input');
const profilePhotoPreview = document.getElementById('profile-photo-preview');
let pendingProfileImage = '';

if (profilePhotoInput) {
  profilePhotoInput.addEventListener('change', () => {
    const file = profilePhotoInput.files?.[0];
    const status = document.getElementById('employee-profile-status');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      profilePhotoInput.value = '';
      if (status) {
        status.textContent = 'Choose a JPEG, PNG, or WebP image smaller than 5 MB.';
        status.classList.add('status-error');
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingProfileImage = String(reader.result || '');
      if (profilePhotoPreview) profilePhotoPreview.src = pendingProfileImage;
      if (status) {
        status.textContent = 'New photo selected. Save your profile to upload it.';
        status.classList.remove('status-error');
      }
    };
    reader.readAsDataURL(file);
  });
}

if (employeeProfileForm) {
  employeeProfileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('employee-profile-status');
    const submitButton = employeeProfileForm.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(employeeProfileForm).entries());
    if (pendingProfileImage) payload.profileImage = pendingProfileImage;
    if (submitButton) submitButton.disabled = true;
    if (status) {
      status.textContent = 'Saving profile changes...';
      status.classList.remove('status-error', 'status-success');
    }
    try {
      const data = await fetchJson('/employee/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const imageUrl = data.employee?.profileImage?.url;
      if (imageUrl) {
        document.querySelectorAll('.navbar-profile-avatar img').forEach((image) => { image.src = imageUrl; });
        if (profilePhotoPreview) profilePhotoPreview.src = imageUrl;
      }
      pendingProfileImage = '';
      profilePhotoInput.value = '';
      employeeProfileForm.elements.currentPassword.value = '';
      employeeProfileForm.elements.newPassword.value = '';
      if (status) {
        status.textContent = data.message;
        status.classList.add('status-success');
      }
      showToast(data.message, 'success');
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.classList.add('status-error');
      }
      showToast(error.message, 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

const refreshAttendanceButton = document.getElementById('refresh-attendance');
if (refreshAttendanceButton) {
  refreshAttendanceButton.addEventListener('click', refreshAttendancePage);
  refreshAttendancePage();
}

const attendanceDateFilter = document.getElementById('attendance-date-filter');
if (attendanceDateFilter) {
  attendanceDateFilter.addEventListener('change', refreshAttendancePage);
}

const exportAttendanceLogsButton = document.getElementById('export-attendance-logs');
if (exportAttendanceLogsButton) {
  exportAttendanceLogsButton.addEventListener('click', () => {
    const date = document.getElementById('attendance-date-filter')?.value || '';
    window.location.href = `/api/attendance/export/csv${date ? `?date=${encodeURIComponent(date)}` : ''}`;
  });
}

const refreshSystemEventsButton = document.getElementById('refresh-system-events');
let systemEventsRefreshTimer = null;
if (refreshSystemEventsButton) {
  refreshSystemEventsButton.addEventListener('click', refreshSystemEvents);
  refreshSystemEvents();
  systemEventsRefreshTimer = window.setInterval(refreshSystemEvents, 30000);
}

['system-events-date', 'user-filter', 'department-filter'].forEach((id) => {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('change', () => {});
  }
});

const systemEventsSearchButton = document.getElementById('system-events-search');
if (systemEventsSearchButton) {
  systemEventsSearchButton.addEventListener('click', () => refreshSystemEvents().catch((error) => showToast(error.message)));
}

const systemEventsResetButton = document.getElementById('system-events-reset');
if (systemEventsResetButton) {
  systemEventsResetButton.addEventListener('click', () => {
    ['system-events-date', 'user-filter', 'department-filter'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.value = '';
    });
    document.querySelectorAll('[data-event-filter].active').forEach((button) => button.classList.remove('active'));
    refreshSystemEvents().catch((error) => showToast(error.message));
  });
}

document.querySelectorAll('[data-event-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const isActive = button.classList.contains('active');
    document.querySelectorAll('[data-event-filter].active').forEach((item) => item.classList.remove('active'));
    if (!isActive) button.classList.add('active');
    refreshSystemEvents().catch((error) => showToast(error.message));
  });
});

const realtimeSystemEventsToggle = document.getElementById('realtime-system-events');
if (realtimeSystemEventsToggle) {
  realtimeSystemEventsToggle.addEventListener('change', () => {
    if (realtimeSystemEventsToggle.checked) {
      refreshSystemEvents().catch((error) => showToast(error.message));
      systemEventsRefreshTimer = window.setInterval(refreshSystemEvents, 30000);
      showToast('Live system events enabled.');
      return;
    }

    if (systemEventsRefreshTimer) {
      window.clearInterval(systemEventsRefreshTimer);
      systemEventsRefreshTimer = null;
    }
    showToast('Live system events paused.');
  });
}

const exportSystemEventsButton = document.getElementById('export-system-events');
if (exportSystemEventsButton) {
  exportSystemEventsButton.addEventListener('click', () => {
    const params = new URLSearchParams();
    const date = document.getElementById('system-events-date')?.value || '';
    const from = document.getElementById('system-events-from')?.value || '';
    const to = document.getElementById('system-events-to')?.value || '';
    const employee = document.getElementById('user-filter')?.value || '';
    const department = document.getElementById('department-filter')?.value || '';
    const eventType = document.querySelector('[data-event-filter].active')?.dataset.eventFilter || '';
    if (date) params.set('date', date);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (employee) params.set('employee', employee);
    if (department) params.set('department', department);
    if (eventType) params.set('event', eventType);
    window.location.href = `/api/system-events/export/csv${params.toString() ? `?${params.toString()}` : ''}`;
  });
}

function prependActivityEvent(event) {
  const timeline = document.getElementById('system-events-body') || document.querySelector('#personal-events .timeline-stream');
  if (!timeline || !event) return;

  const cssEscape = window.CSS && typeof window.CSS.escape === 'function'
    ? window.CSS.escape
    : (value) => String(value).replace(/["\\]/g, '\\$&');
  const existing = event.externalId ? timeline.querySelector(`[data-external-id="${cssEscape(String(event.externalId))}"]`) : null;
  if (existing) return;

  const empty = timeline.querySelector('strong');
  if (empty && /No activity recorded yet/i.test(empty.textContent || '')) {
    timeline.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = 'event-row';
  item.dataset.externalId = event.externalId || '';
  item.dataset.user = event.employeeName || event.user || 'Unknown';
  const duration = Number(event.durationMs || 0) > 0 ? formatShortDuration(event.durationMs) : '-';
  if (document.getElementById('system-events-body')) {
    item.innerHTML = `
      <span class="event-dot"></span>
      <strong>${escapeHtml(event.event || 'Activity Event')}</strong>
      <div class="event-meta-grid">
        <span><b>Timestamp</b>${escapeHtml(new Date(event.occurredAt).toLocaleString())}</span>
        <span><b>Event Type</b>${escapeHtml(event.eventType || event.event || '-')}</span>
        <span><b>Device Info</b>${escapeHtml(event.hostname || event.computer || event.provider || event.sourceLog || '-')}</span>
        <span><b>Employee Name</b>${escapeHtml(event.employeeName || event.user || 'Unknown')}</span>
        <span><b>Machine</b>${escapeHtml(event.machineId || '-')}</span>
        <span><b>Duration</b>${escapeHtml(duration)}</span>
      </div>
    `;
  } else {
    item.innerHTML = `
      <span class="event-dot"></span>
      <strong>${escapeHtml(event.event || 'Activity')}</strong>
      <p>${escapeHtml(new Date(event.occurredAt).toLocaleString())} - ${escapeHtml(event.meaning || event.sourceLog || 'System event')}</p>
    `;
  }
  timeline.prepend(item);
}

function updateEmployeeActivityStatus(event) {
  if (!event) return;
  const statusEl = document.getElementById('employee-current-status');
  const internetEl = document.getElementById('employee-internet-status');
  const agentEl = document.getElementById('employee-agent-status');
  const machineEl = document.getElementById('employee-machine-status');
  if (!statusEl && !internetEl && !agentEl && !machineEl) return;

  const name = event.event || '';
  if (statusEl) {
    if (['Agent Offline', 'Shutdown', 'Unexpected Shutdown', 'Network Offline', 'Internet Disconnected'].includes(name)) statusEl.textContent = 'Offline';
    else if (['Idle Time', 'Idle State', 'Inactive Duration'].includes(name)) statusEl.textContent = 'Idle';
    else if (name === 'Sleep') statusEl.textContent = 'Sleeping';
    else if (['Lock', 'Screen Lock'].includes(name)) statusEl.textContent = 'Locked';
    else statusEl.textContent = 'Online';
  }
  if (internetEl && ['Internet Connected', 'Network Online', 'Internet Disconnected', 'Network Offline'].includes(name)) {
    internetEl.textContent = ['Internet Connected', 'Network Online'].includes(name) ? 'Online' : 'Offline';
  }
  if (agentEl && ['Agent Online', 'Agent Offline'].includes(name)) {
    agentEl.textContent = name === 'Agent Online' ? 'Connected' : 'Offline';
  }
  if (machineEl && (event.hostname || event.computer || event.machineId)) {
    machineEl.textContent = event.hostname || event.computer || event.machineId;
  }
}

function initActivityRealtime() {
  const hasActivityTimeline = document.getElementById('system-events-body') || document.querySelector('#personal-events .timeline-stream');
  if (!hasActivityTimeline || typeof io !== 'function') return;

  const socket = io({ withCredentials: true, reconnection: true });
  socket.on('connect', () => {
    const sync = document.getElementById('system-events-sync');
    if (sync) sync.textContent = 'Live';
  });
  socket.on('disconnect', () => {
    const sync = document.getElementById('system-events-sync');
    if (sync) sync.textContent = 'Reconnecting';
  });
  ['activity:event', 'system_event:new'].forEach((name) => {
    socket.on(name, (event) => {
      prependActivityEvent(event);
      updateEmployeeActivityStatus(event);
      renderSystemEventsLiveFeed([event]);
      if (document.getElementById('system-events-count')) {
        refreshSystemEvents().catch(() => {});
      }
    });
  });
}

initActivityRealtime();

const workScheduleForm = document.getElementById('work-schedule-form');
if (workScheduleForm) {
  workScheduleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('work-schedule-status');
    const payload = Object.fromEntries(new FormData(workScheduleForm).entries());
    payload.workingHours = Number(payload.workingHours || 8);
    payload.breakMinutes = Number(payload.breakMinutes || 0);
    payload.gracePeriodMinutes = Number(payload.gracePeriodMinutes || 0);

    if (status) {
      status.textContent = 'Saving schedule...';
    }

    try {
      await fetchJson('/api/work-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (status) {
        status.textContent = 'Schedule saved. Late entry and overtime calculations now use these timings.';
      }
      showToast('Work schedule saved.');
    } catch (error) {
      if (status) {
        status.textContent = error.message;
      }
      showToast(error.message);
    }
  });
}

const completeDailyTaskButton = document.getElementById('complete-daily-task');
const checkoutModal = document.getElementById('checkout-modal');
const checkoutForm = document.getElementById('checkout-form');
const closeCheckoutModalButton = document.getElementById('close-checkout-modal');
const joinWorkButton = document.getElementById('join-work-button');
const joinWorkModal = document.getElementById('join-work-modal');
const joinWorkForm = document.getElementById('join-work-form');
const closeJoinWorkModalButton = document.getElementById('close-join-work-modal');
const checkoutWorkButton = document.getElementById('checkout-work-button');

if (completeDailyTaskButton && checkoutModal) {
  completeDailyTaskButton.addEventListener('click', () => {
    checkoutModal.hidden = false;
    document.getElementById('checkout-note')?.focus();
  });
}

if (joinWorkButton && joinWorkModal) {
  joinWorkButton.addEventListener('click', () => {
    joinWorkModal.hidden = false;
    document.getElementById('daily-plan-input')?.focus();
  });
}

if (closeJoinWorkModalButton && joinWorkModal) {
  closeJoinWorkModalButton.addEventListener('click', () => {
    joinWorkModal.hidden = true;
  });
}

if (checkoutWorkButton && checkoutModal) {
  checkoutWorkButton.addEventListener('click', () => {
    checkoutModal.hidden = false;
    document.getElementById('checkout-note')?.focus();
  });
}

if (joinWorkForm) {
  joinWorkForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('join-work-form-status');
    const submitButton = joinWorkForm.querySelector('button[type="submit"]');
    const dailyPlan = document.getElementById('daily-plan-input')?.value.trim() || '';

    if (!dailyPlan) {
      if (status) {
        status.textContent = 'Please enter your work plan before starting.';
        status.classList.add('status-error');
      }
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (status) {
      status.textContent = 'Starting your work session...';
      status.classList.remove('status-error');
    }

    try {
      const data = await fetchJson('/api/work-sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyPlan }),
      });
      if (status) status.textContent = data.message;
      showToast('Workday started successfully.', 'success');
      joinWorkModal.hidden = true;
      joinWorkForm.reset();
      await loadDailyWorkSession();
      if (window.location.pathname === '/employee/attendance') {
        window.location.href = '/employee/work-session';
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.classList.add('status-error');
      }
      showToast(error.message, 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

const addReportTaskButton = document.getElementById('add-report-task');
if (addReportTaskButton) {
  addReportTaskButton.addEventListener('click', () => {
    const list = document.getElementById('completed-task-list');
    if (!list) return;
    const label = document.createElement('label');
    label.innerHTML = '<input type="text" name="completedTasks" placeholder="Completed task" required>';
    list.appendChild(label);
    label.querySelector('input')?.focus();
  });
}

if (closeCheckoutModalButton && checkoutModal) {
  closeCheckoutModalButton.addEventListener('click', () => {
    checkoutModal.hidden = true;
  });
}

if (checkoutForm) {
  checkoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('checkout-form-status');
    const result = document.getElementById('checkout-result');
    const note = document.getElementById('checkout-note')?.value || '';
    const taskStatus = document.getElementById('task-status')?.value || 'Pending';
    const completedTasks = Array.from(document.querySelectorAll('#completed-task-list input'))
      .map((input) => input.value.trim())
      .filter(Boolean);
    const pendingTasks = document.getElementById('pending-tasks')?.value || '';
    const additionalNotes = document.getElementById('additional-notes')?.value || '';
    const sessionId = checkoutWorkButton?.dataset.sessionId || completeDailyTaskButton?.dataset.sessionId || '';

    if (!sessionId) {
      if (status) {
        status.textContent = 'Mark attendance before completing the work session.';
      }
      return;
    }

    try {
      const data = await fetchJson(`/api/work-sessions/${sessionId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskStatus,
          workSummary: note,
          completedTasks,
          pendingTasks,
          additionalNotes,
        }),
      });

      if (status) {
        status.textContent = data.message;
      }
      if (result) {
        result.textContent = data.message;
      }
      showToast('Work session completed successfully.', 'success');
      checkoutModal.hidden = true;
      checkoutForm.reset();
      await loadDailyWorkSession();
      await loadEmployeeHrmsSummary();
    } catch (error) {
      if (status) {
        status.textContent = error.message;
      }
      showToast(error.message, 'error');
    }
  });
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

let employeeLeaveStatusSnapshot = new Map();

function renderEmployeeLeaves(leaves = [], balance = {}) {
  const body = document.getElementById('employee-leave-history');
  setText('leave-remaining', String(balance.remaining ?? '--'));
  setText('leave-balance-pill', `Balance ${balance.remaining ?? 0}/${balance.total ?? 24}`);
  const detail = document.getElementById('leave-balance-details');
  if (detail) {
    detail.innerHTML = `
      <div><span class="event-dot"></span><strong>${balance.used || 0} used</strong><p>${balance.total || 24} paid leave days allocated this year.</p></div>
      <div><span class="event-dot"></span><strong>${leaves.filter((leave) => leave.status === 'Pending').length} pending</strong><p>Pending requests can be cancelled from history.</p></div>
    `;
  }

  if (!body) return;

  body.innerHTML = '';
  if (!leaves.length) {
    body.innerHTML = '<tr><td colspan="6">No leave history found.</td></tr>';
    return;
  }

  leaves.forEach((leave) => {
    const previousStatus = employeeLeaveStatusSnapshot.get(String(leave._id));
    if (previousStatus && previousStatus !== leave.status && ['Approved', 'Rejected'].includes(leave.status)) {
      showToast(
        leave.status === 'Approved'
          ? 'Your leave request has been approved.'
          : `Your leave request was rejected. Reason: ${leave.adminRemarks || 'No reason provided.'}`,
        leave.status === 'Approved' ? 'success' : 'error'
      );
    }
    employeeLeaveStatusSnapshot.set(String(leave._id), leave.status);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(leave.createdAt).toLocaleDateString()}</td>
      <td>${leave.leaveType}</td>
      <td>${new Date(leave.startDate).toLocaleDateString()} - ${new Date(leave.endDate).toLocaleDateString()} (${leave.days} day${Number(leave.days) === 1 ? '' : 's'})</td>
      <td><span class="status-badge status-${String(leave.status).toLowerCase()}">${leave.status}</span></td>
      <td>${leave.adminRemarks || '-'}</td>
      <td>${leave.status === 'Pending' ? `<button type="button" class="btn btn-secondary cancel-leave" data-id="${leave._id}"><i class="fa-solid fa-ban"></i>Cancel</button>` : '-'}</td>
    `;
    body.appendChild(tr);
  });
}

function renderEmployeeOvertime(overtime = {}) {
  const today = overtime.today || {};
  setText('ot-today-hours', formatShortDuration(today.totalWorkingMs || today.elapsedMs || 0));
  setText('ot-today-overtime', formatShortDuration(today.overtimeMs || 0));
  setText('ot-weekly', formatShortDuration(overtime.weeklyOvertimeMs || 0));
  setText('ot-monthly', formatShortDuration(overtime.monthlyOvertimeMs || 0));
  setText('ot-weekend', formatShortDuration(overtime.weekendMs || 0));
  const weekly = document.getElementById('weekly-work-bar');
  const monthly = document.getElementById('monthly-overtime-bar');
  if (weekly) weekly.style.setProperty('--w', `${Math.min(((today.totalWorkingMs || 0) / (8 * 60 * 60 * 1000)) * 100, 100)}%`);
  if (monthly) monthly.style.setProperty('--w', `${Math.min(((overtime.monthlyOvertimeMs || 0) / (24 * 60 * 60 * 1000)) * 100, 100)}%`);
}

async function loadEmployeeHrmsSummary() {
  if (!document.getElementById('leave-management') && !document.getElementById('overtime-tracking')) return;
  if (document.body.dataset.role !== 'employee') return;
  const data = await fetchJson('/api/hrms/employee/summary');
  renderEmployeeLeaves(data.leaves || [], data.balance || {});
  renderEmployeeOvertime(data.overtime || {});
}

const leaveForm = document.getElementById('leave-form');
if (leaveForm) {
  const syncLeaveDays = () => {
    const formData = new FormData(leaveForm);
    const start = new Date(formData.get('startDate'));
    const end = new Date(formData.get('endDate') || formData.get('startDate'));
    const type = formData.get('leaveType');
    const preview = leaveForm.querySelector('[name="daysPreview"]');
    if (!preview || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    preview.value = type === 'Half Day Leave' ? '0.5' : String(Math.max(Math.floor((end - start) / 86400000) + 1, 1));
  };

  leaveForm.addEventListener('input', syncLeaveDays);
  leaveForm.addEventListener('change', syncLeaveDays);
  leaveForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('leave-form-status');
    const formData = new FormData(leaveForm);
    const attachment = formData.get('attachment');
    try {
      const data = await fetchJson('/api/hrms/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaveType: formData.get('leaveType'),
          startDate: formData.get('startDate'),
          endDate: formData.get('endDate'),
          reason: formData.get('reason'),
          attachmentName: attachment && attachment.name ? attachment.name : '',
        }),
      });
      if (status) status.textContent = data.message;
      showToast(data.message);
      leaveForm.reset();
      await loadEmployeeHrmsSummary();
    } catch (error) {
      if (status) status.textContent = error.message;
      showToast(error.message);
    }
  });
}

document.addEventListener('click', async (event) => {
  const cancelButton = event.target.closest('.cancel-leave');
  if (!cancelButton) return;
  try {
    const data = await fetchJson(`/api/hrms/leaves/${cancelButton.dataset.id}/cancel`, { method: 'POST' });
    showToast(data.message);
    await loadEmployeeHrmsSummary();
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll('.leave-decision').forEach((button) => {
  button.addEventListener('click', async () => {
    const isRejected = button.dataset.status === 'Rejected';
    const adminRemarks = isRejected
      ? window.prompt('Please enter the reason for rejecting this leave request:')
      : window.prompt('Optional approval note:', 'Approved by admin.') || 'Approved by admin.';

    if (isRejected && !String(adminRemarks || '').trim()) {
      showToast('Rejection reason is required.', 'warning');
      return;
    }

    try {
      const data = await fetchJson(`/api/hrms/admin/leaves/${button.dataset.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: button.dataset.status, adminRemarks }),
      });
      showToast(data.message, button.dataset.status === 'Approved' ? 'success' : 'error');
      window.location.reload();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
});

function filterRowsByControls(searchId, selectId, tbodyId) {
  const search = (document.getElementById(searchId)?.value || '').toLowerCase();
  const status = document.getElementById(selectId)?.value || '';
  const rows = document.querySelectorAll(`#${tbodyId} tr`);
  rows.forEach((row) => {
    const matchesSearch = !search || row.textContent.toLowerCase().includes(search);
    const matchesStatus = !status || row.dataset.status === status;
    row.classList.toggle('hidden', !(matchesSearch && matchesStatus));
  });
}

['leave-search', 'leave-status-filter'].forEach((id) => {
  const element = document.getElementById(id);
  if (element) element.addEventListener('input', () => filterRowsByControls('leave-search', 'leave-status-filter', 'admin-leaves-body'));
  if (element) element.addEventListener('change', () => filterRowsByControls('leave-search', 'leave-status-filter', 'admin-leaves-body'));
});

['daily-report-search', 'overtime-search'].forEach((id) => {
  const input = document.getElementById(id);
  if (input) {
    input.addEventListener('input', () => {
      const query = input.value.toLowerCase();
      document.querySelectorAll('tbody tr').forEach((row) => row.classList.toggle('hidden', query && !row.textContent.toLowerCase().includes(query)));
    });
  }
});

async function submitMonitoringPermission(permission) {
  const completeButton = document.getElementById('complete-daily-task');
  const sessionId = completeButton?.dataset.sessionId || '';
  const modal = document.getElementById('monitoring-permission-modal');

  if (!sessionId) {
    return;
  }

  const data = await fetchJson(`/api/work-sessions/${sessionId}/permission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission }),
  });

  if (modal) {
    modal.hidden = true;
  }
  showToast(data.message);
  await loadDailyWorkSession();
}

const allowMonitoringButton = document.getElementById('allow-monitoring');
if (allowMonitoringButton) {
  allowMonitoringButton.addEventListener('click', () => {
    submitMonitoringPermission('allowed').catch((error) => showToast(error.message));
  });
}

const denyMonitoringButton = document.getElementById('deny-monitoring');
if (denyMonitoringButton) {
  denyMonitoringButton.addEventListener('click', () => {
    submitMonitoringPermission('denied').catch((error) => showToast(error.message));
  });
}

const forgotPasswordForm = document.getElementById('forgot-password-form');
if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('forgot-email')?.value.trim() || '';
    const status = document.getElementById('forgot-password-status');
    if (!email) {
      if (status) status.textContent = 'Please enter admin email.';
      return;
    }
    if (status) {
      status.textContent = `Reset code request recorded for ${email}. Connect an email service to send real reset codes.`;
    }
    showToast('Password recovery request submitted.');
  });
}

const startCameraButton = document.getElementById('start-camera');
const stopCameraButton = document.getElementById('stop-camera');
const scanNowButton = document.getElementById('scan-now');

if (startCameraButton) {
  startCameraButton.addEventListener('click', startLiveCamera);
}

if (stopCameraButton) {
  stopCameraButton.addEventListener('click', stopLiveCamera);
}

if (scanNowButton) {
  scanNowButton.addEventListener('click', scanCurrentFrame);
}

const startEnrollmentCameraButton = document.getElementById('start-enrollment-camera');
const stopEnrollmentCameraButton = document.getElementById('stop-enrollment-camera');
const captureEnrollmentButton = document.getElementById('capture-enrollment');

if (startEnrollmentCameraButton) {
  startEnrollmentCameraButton.addEventListener('click', startEnrollmentCamera);
}

if (stopEnrollmentCameraButton) {
  stopEnrollmentCameraButton.addEventListener('click', stopEnrollmentCamera);
}

if (captureEnrollmentButton) {
  captureEnrollmentButton.addEventListener('click', captureEnrollmentSamples);
}

const signupRole = document.getElementById('signup-role');
const signupForm = document.getElementById('signup-form');

function syncSignupRoleUi() {
  if (!signupRole) {
    return;
  }

  const isEmployee = signupRole.value === 'employee';
  document.querySelectorAll('.employee-only').forEach((element) => {
    element.classList.toggle('hidden', !isEmployee);
    element.querySelectorAll('input').forEach((input) => {
      input.required = isEmployee;
    });
  });
}

if (signupRole) {
  signupRole.addEventListener('change', syncSignupRoleUi);
  syncSignupRoleUi();
}

if (signupForm) {
  signupForm.addEventListener('submit', async (event) => {
    const role = signupRole?.value || 'employee';
    const status = document.getElementById('signup-form-status');

    if (role === 'admin') {
      return;
    }

    event.preventDefault();
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const formData = new FormData(signupForm);
    const payload = Object.fromEntries(formData.entries());
    payload.enrollmentImages = enrollmentImages;

    if (payload.password !== payload.confirmPassword) {
      if (status) status.textContent = 'Password and confirm password do not match.';
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (status) {
      status.textContent = enrollmentImages.length >= 6
        ? 'Secure face photo upload and account setup are in progress...'
        : 'Creating employee account with password login. Face login can be enabled later.';
    }
    if (enrollmentImages.length >= 6) {
      updateSignupBiometricProgress(100, 6);
    }

    try {
      const data = await fetchJson('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const successMessage = data.modelWarning
        ? `Employee account activated. Face scans are saved in Cloudinary. Model rebuild warning: ${data.modelWarning}`
        : enrollmentImages.length >= 6
          ? 'Employee account activated. Face login enabled automatically.'
          : 'Employee account activated. Password login is enabled.';
      if (status) status.textContent = successMessage;
      showToast(data.modelWarning
        ? 'Employee signup complete. Model rebuild needs attention.'
        : enrollmentImages.length >= 6
          ? 'Employee face registration is complete.'
          : 'Employee account created.');
      window.location.href = data.redirectTo || '/employee';
    } catch (error) {
      if (status) status.textContent = error.message;
      showToast(error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

let employeeLoginStream = null;
let employeeLoginInFlight = false;
let employeeLoginInterval = null;

function setEmployeeFaceLoginStatus(message, isError = false, showRawMessage = false) {
  const status = document.getElementById('employee-face-login-status');
  if (status) {
    const feedback = isError && showRawMessage
      ? { icon: 'fa-circle-exclamation', mode: 'error', text: message }
      : isError
        ? friendlyFaceMessage(message)
        : { icon: 'fa-circle-info', mode: message.toLowerCase().includes('success') ? 'success' : 'info', text: message };
    renderFeedbackMessage(status, feedback);
    status.classList.toggle('status-error', isError);
    status.classList.toggle('status-success', !isError && message.toLowerCase().includes('success'));
  }
}

function setEmployeeLoginConfidence(confidence) {
  const element = document.getElementById('employee-login-confidence');
  if (element) {
    element.textContent = `Match Accuracy ${(Number(confidence || 0) * 100).toFixed(1)}%`;
  }
}

function setEmployeeFaceLoginLoadingMessage(message = '') {
  const loader = document.getElementById('employee-face-login-loader');
  if (loader) {
    loader.textContent = message;
  }
}

function summarizeEmployeeLoginQuality(data = {}, frameMetrics = null) {
  const issues = Array.isArray(data.quality_issues) ? data.quality_issues.filter(Boolean) : [];
  const quality = data.quality || {};
  const brightnessMessage = quality.brightness?.message || frameMetrics?.brightnessLabel || 'Lighting pending';
  const blurMessage = quality.blur?.message || frameMetrics?.qualityLabel || 'Quality pending';
  return {
    brightnessMessage,
    blurMessage,
    issueText: issues.length ? issues.join(' | ') : '',
  };
}

function updateEmployeeLoginTelemetry(data, canvas, frameMetrics) {
  setEmployeeLoginConfidence(data?.confidence || 0);
  positionFaceBox('employee-login-face-box', data?.box, canvas);
  const qualitySummary = summarizeEmployeeLoginQuality(data, frameMetrics);
  updateText('employee-login-light-state', qualitySummary.brightnessMessage);
  updateText('employee-login-quality-state', qualitySummary.blurMessage);
  updateText('employee-login-state', data?.box ? 'Face Detected' : data?.stage === 'no_face' ? 'Center face' : 'Searching Face');
  const state = data?.recognized ? 'Verified Successfully' : data?.stage === 'no_face' ? 'Center Face' : 'Matching Face';
  setScannerState('employee-login-scanner-state', state, data?.recognized ? 'success' : 'matching');
  if (frameMetrics && !data?.box) {
    updateText('employee-login-state', frameMetrics.brightnessLabel);
  }
}

async function scanEmployeeFaceLogin() {
  if (employeeLoginInFlight) {
    return;
  }

  const video = document.getElementById('employee-login-camera-feed');
  const canvas = document.getElementById('employee-login-camera-canvas');
  const state = document.getElementById('employee-login-state');

  if (!video || !canvas || video.readyState < 2) {
    return;
  }

  employeeLoginInFlight = true;
  startFaceScanProgress('login');
  setEmployeeLoginConfidence(0);
  if (state) state.textContent = 'Detecting Face';
  setScannerState('employee-login-scanner-state', 'Analyzing Face', 'scanning');
  setEmployeeFaceLoginLoadingMessage('Analyzing frame quality before face matching...');
  setEmployeeFaceLoginStatus('Detecting face and checking frame quality...');

  try {
    const context = drawVideoToScanCanvas(video, canvas);
    const frameMetrics = readFrameMetrics(context, canvas);
    updateText('employee-login-light-state', frameMetrics.brightnessLabel);
    updateText('employee-login-quality-state', frameMetrics.qualityLabel);

    if (!frameMetrics.canSend) {
      finishFaceScanProgress('login', false, 'Improve lighting or clarity');
      if (state) state.textContent = frameMetrics.brightnessLabel;
      setEmployeeLoginConfidence(0);
      setScannerState('employee-login-scanner-state', 'Improve Frame', 'warning');
      setEmployeeFaceLoginLoadingMessage('');
      setEmployeeFaceLoginStatus(`${frameMetrics.brightnessLabel} ${frameMetrics.qualityLabel}`, true);
      return;
    }

    if (state) state.textContent = 'Matching Face';
    setScannerState('employee-login-scanner-state', 'Matching Identity', 'matching');
    setEmployeeFaceLoginLoadingMessage('Matching identity with secure face model...');

    const data = await fetchJson('/employee-face-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: canvas.toDataURL('image/jpeg', 0.82) }),
    });

    updateEmployeeLoginTelemetry(data, canvas, frameMetrics);
    if (!data.recognized) {
      finishFaceScanProgress('login', false, 'Face not matched - scan again');
      const qualitySummary = summarizeEmployeeLoginQuality(data, frameMetrics);
      const statusMessage = [
        friendlyFaceMessage(data.message || 'Face not recognized.', data.stage).text,
        qualitySummary.issueText,
      ].filter(Boolean).join(' | ');
      if (state) state.textContent = data.stage === 'no_face' ? 'Center face' : 'Low match accuracy';
      setScannerState('employee-login-scanner-state', data.stage === 'no_face' ? 'Center Face' : 'Face Not Recognized', 'error');
      setEmployeeFaceLoginLoadingMessage('');
      setEmployeeFaceLoginStatus(statusMessage, true, Boolean(qualitySummary.issueText));
      return;
    }

    if (state) state.textContent = 'Sign In success';
    finishFaceScanProgress('login', true, 'Face matched - signing in');
    setScannerState('employee-login-scanner-state', 'Verified Successfully', 'success');
    setEmployeeFaceLoginLoadingMessage('');
    setEmployeeFaceLoginStatus(`Sign In success. Welcome ${data.employee?.name || 'Employee'}.`);
    showToast('Face sign-in successful.');
    window.setTimeout(() => {
      window.location.href = data.redirectTo || '/employee';
    }, 800);
  } catch (error) {
    finishFaceScanProgress('login', false, 'Scan failed - try again');
    if (state) state.textContent = 'Face not recognized';
    setEmployeeLoginConfidence(0);
    setScannerState('employee-login-scanner-state', 'Scan Failed', 'error');
    setEmployeeFaceLoginLoadingMessage('');
    setEmployeeFaceLoginStatus(error.message || 'Face scan failed. Please try again.', true);
  } finally {
    if (employeeLoginStream) {
      setEmployeeFaceLoginLoadingMessage('');
    }
    employeeLoginInFlight = false;
  }
}

async function startEmployeeFaceLogin() {
  const video = document.getElementById('employee-login-camera-feed');
  if (!video) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    setEmployeeFaceLoginStatus('Camera access is not available in this browser.', true);
    return;
  }

  if (employeeLoginStream) {
    scanEmployeeFaceLogin();
    return;
  }

  setEmployeeFaceLoginLoading(true);
  setFaceScanProgress('login', 0, 'Opening camera', 'idle');
  try {
    employeeLoginStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });
    video.srcObject = employeeLoginStream;
    await video.play();
    setEmployeeLoginConfidence(0);
    updateText('employee-login-light-state', 'Lighting pending');
    updateText('employee-login-quality-state', 'Quality pending');
    setScannerState('employee-login-scanner-state', 'Detecting Face', 'scanning');
    setEmployeeFaceLoginStatus('Camera is on. Face matching has started.');
    employeeLoginInterval = window.setInterval(scanEmployeeFaceLogin, 1400);
    window.setTimeout(scanEmployeeFaceLogin, 450);
  } catch (error) {
    employeeLoginStream = null;
    setEmployeeFaceLoginStatus(`Camera could not be opened: ${error.message}`, true);
  } finally {
    setEmployeeFaceLoginLoading(false);
  }
}

function stopEmployeeFaceLogin() {
  if (employeeLoginInterval) {
    window.clearInterval(employeeLoginInterval);
    employeeLoginInterval = null;
  }

  if (employeeLoginStream) {
    employeeLoginStream.getTracks().forEach((track) => track.stop());
    employeeLoginStream = null;
  }
}

function setEmployeeFaceLoginLoading(isLoading) {
  const faceTab = document.querySelector('[data-auth-tab="face"]');
  const startButton = document.getElementById('start-employee-face-login');
  const retryButton = document.getElementById('retry-employee-face-login');

  if (faceTab) {
    faceTab.classList.toggle('is-loading', isLoading);
    faceTab.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  if (startButton) {
    startButton.disabled = isLoading;
    startButton.innerHTML = isLoading
      ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Opening Camera'
      : '<i class="fa-solid fa-fingerprint"></i> Start Face Scan';
  }

  if (retryButton) {
    retryButton.disabled = isLoading;
  }

  setEmployeeFaceLoginLoadingMessage(isLoading ? 'Opening camera for face scan...' : '');
}

function activateEmployeeAuthTab(tabName, options = {}) {
  const tabs = document.querySelectorAll('[data-auth-tab]');
  const panels = document.querySelectorAll('[data-auth-panel]');

  if (!tabs.length || !panels.length) {
    return;
  }

  tabs.forEach((tab) => {
    const isActive = tab.dataset.authTab === tabName;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.authPanel === tabName;
    panel.hidden = !isActive;
    panel.classList.toggle('is-active', isActive);
  });

  if (tabName === 'face') {
    setEmployeeFaceLoginStatus('Opening the camera. Center your face when the preview appears.');
    if (options.startFace !== false) {
      startEmployeeFaceLogin();
    }
    return;
  }

  stopEmployeeFaceLogin();
  setEmployeeLoginConfidence(0);
  updateText('employee-login-state', 'Real person check ready');
  updateText('employee-login-light-state', 'Lighting pending');
  updateText('employee-login-quality-state', 'Quality pending');
  setEmployeeFaceLoginLoadingMessage('');
  setScannerState('employee-login-scanner-state', 'Camera ready');
}

document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    activateEmployeeAuthTab(tab.dataset.authTab);
  });
});

const startEmployeeFaceLoginButton = document.getElementById('start-employee-face-login');
if (startEmployeeFaceLoginButton) {
  startEmployeeFaceLoginButton.addEventListener('click', startEmployeeFaceLogin);
}

const retryEmployeeFaceLoginButton = document.getElementById('retry-employee-face-login');
if (retryEmployeeFaceLoginButton) {
  retryEmployeeFaceLoginButton.addEventListener('click', () => {
    if (employeeLoginStream) {
      scanEmployeeFaceLogin();
      return;
    }

    startEmployeeFaceLogin();
  });
}

const credentialStartFaceLoginButton = document.getElementById('credential-start-face-login');
if (credentialStartFaceLoginButton) {
  credentialStartFaceLoginButton.addEventListener('click', () => {
    activateEmployeeAuthTab('face');
  });
}

document.querySelectorAll('.show-password-toggle').forEach((toggle) => {
  toggle.addEventListener('change', () => {
    String(toggle.dataset.target || '')
      .split(',')
      .map((target) => target.trim())
      .filter(Boolean)
      .forEach((target) => {
        const input = document.getElementById(target);
        if (input) {
          input.type = toggle.checked ? 'text' : 'password';
        }
      });
  });
});

const employeePasswordSignInForm = document.getElementById('employee-password-login-form');
if (employeePasswordSignInForm) {
  employeePasswordSignInForm.addEventListener('submit', (event) => {
    const identifier = employeePasswordSignInForm.querySelector('[name="email"]')?.value.trim() || '';
    const password = employeePasswordSignInForm.querySelector('[name="password"]')?.value || '';
    const status = document.getElementById('employee-login-form-status');

    if (!identifier || !password) {
      event.preventDefault();
      if (status) {
        status.textContent = !identifier && !password
          ? 'Employee ID/email and password are required.'
          : !identifier
            ? 'Employee ID/email is required.'
            : 'Password is required.';
        status.classList.add('status-error');
      }
    }
  });
}

window.addEventListener('beforeunload', () => {
  stopLiveCamera();
  stopEnrollmentCamera();
  stopEmployeeFaceLogin();
});

// Navbar functionality
const navbarRefreshButton = document.getElementById('navbar-refresh');
if (navbarRefreshButton) {
  navbarRefreshButton.addEventListener('click', () => {
    const currentPath = window.location.pathname;
    if (currentPath === '/attendance') {
      refreshAttendancePage();
    } else {
      window.location.href = '/';
    }
  });
}

const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navbarMenu = document.querySelector('.navbar-menu');
if (mobileMenuToggle && navbarMenu) {
  mobileMenuToggle.addEventListener('click', () => {
    navbarMenu.classList.toggle('open');
  });
}

const sideNav = document.querySelector('.side-nav');
if (mobileMenuToggle && sideNav) {
  let sideNavBackdrop = document.querySelector('.side-nav-backdrop');
  if (!sideNavBackdrop) {
    sideNavBackdrop = document.createElement('button');
    sideNavBackdrop.type = 'button';
    sideNavBackdrop.className = 'side-nav-backdrop';
    sideNavBackdrop.setAttribute('aria-label', 'Close navigation');
    document.body.appendChild(sideNavBackdrop);
  }

  const closeSideNav = () => {
    sideNav.classList.remove('open');
    sideNavBackdrop.classList.remove('open');
    document.body.classList.remove('nav-drawer-open');
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
  };

  const openSideNav = () => {
    sideNav.classList.add('open');
    sideNavBackdrop.classList.add('open');
    document.body.classList.add('nav-drawer-open');
    mobileMenuToggle.setAttribute('aria-expanded', 'true');
  };

  mobileMenuToggle.setAttribute('aria-controls', 'primary-side-navigation');
  mobileMenuToggle.setAttribute('aria-expanded', 'false');
  sideNav.id = sideNav.id || 'primary-side-navigation';

  mobileMenuToggle.addEventListener('click', () => {
    if (sideNav.classList.contains('open')) {
      closeSideNav();
    } else {
      openSideNav();
    }
  });

  sideNavBackdrop.addEventListener('click', closeSideNav);

  sideNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeSideNav);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSideNav();
    }
  });
}

const profileTrigger = document.querySelector('.profile-trigger');
const profileMenu = document.querySelector('.profile-menu');
if (profileTrigger && profileMenu) {
  profileTrigger.addEventListener('click', () => {
    profileMenu.classList.toggle('open');
  });
}

document.querySelectorAll('.counter[data-count]').forEach((counter) => {
  const target = Number(counter.dataset.count || 0);
  const suffix = counter.textContent.trim().endsWith('%') ? '%' : '';
  let current = 0;
  const steps = 28;
  const increment = target / steps;

  const tick = () => {
    current += increment;
    if (current >= target) {
      counter.textContent = `${target}${suffix}`;
      return;
    }
    counter.textContent = `${Math.round(current)}${suffix}`;
    window.requestAnimationFrame(tick);
  };

  tick();
});

function updateClock() {
  const clock = document.getElementById('real-time-clock');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

function renderEnhancedSystemEvents(events) {
  const tableBody = document.getElementById('system-events-body');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!events.length) {
    const item = document.createElement('div');
    item.innerHTML = '<span class="event-dot"></span><strong>No activity recorded yet</strong><p>Waiting for device activity updates.</p>';
    tableBody.appendChild(item);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement('div');
    item.className = 'event-row';
    const employeeName = event.employeeName || event.user || 'Unknown';
    const duration = Number(event.durationMs || 0) > 0 ? formatShortDuration(event.durationMs) : '-';
    item.setAttribute('data-user', employeeName);
    item.innerHTML = `
      <span class="event-dot"></span>
      <strong>${event.event || 'Activity Event'}</strong>
      <div class="event-meta-grid">
        <span><b>Timestamp</b>${new Date(event.occurredAt).toLocaleString()}</span>
        <span><b>Event Type</b>${event.event || '-'}</span>
        <span><b>Device Info</b>${event.computer || event.provider || event.sourceLog || '-'}</span>
        <span><b>Employee Name</b>${employeeName}</span>
        <span><b>Session Status</b>${event.status || (['Shutdown', 'Unexpected Shutdown'].includes(event.event) ? 'Incomplete' : 'Monitoring')}</span>
        <span><b>Duration</b>${duration}</span>
      </div>
    `;
    tableBody.appendChild(item);
  });
}

updateClock();
window.setInterval(updateClock, 1000);

function updateSessionTimer() {
  const timer = document.getElementById('session-timer');
  if (!timer || !timer.dataset.startedAt) {
    if (timer) {
      timer.textContent = '00:00:00';
    }
    return;
  }

  const startedAt = new Date(timer.dataset.startedAt);
  const checkoutAt = timer.dataset.checkoutAt ? new Date(timer.dataset.checkoutAt) : new Date();
  if (Number.isNaN(startedAt.getTime())) {
    timer.textContent = '00:00:00';
    return;
  }

  timer.textContent = formatDuration(checkoutAt.getTime() - startedAt.getTime());
}

updateSessionTimer();
window.setInterval(updateSessionTimer, 1000);

if (document.getElementById('daily-work-session')) {
  loadDailyWorkSession().catch((error) => showToast(error.message));
  startEmployeeActivityCollector();
  window.setInterval(() => loadDailyWorkSession().catch(() => {}), 15000);
}

if (document.getElementById('daily-work-session') || document.getElementById('leave-management') || document.getElementById('overtime-tracking')) {
  loadEmployeeHrmsSummary().catch((error) => showToast(error.message));
  window.setInterval(() => loadEmployeeHrmsSummary().catch(() => {}), 10000);
}

if (document.getElementById('admin-monitoring-body')) {
  refreshAdminMonitoring().catch((error) => showToast(error.message));
  window.setInterval(() => refreshAdminMonitoring().catch(() => {}), 15000);
}

function attachEmployeeFilterCards() {
  document.querySelectorAll('.employee-filter-card').forEach((card) => {
    card.addEventListener('click', () => {
      const user = card.dataset.user || '';
      const userFilter = document.getElementById('user-filter');
      if (userFilter) {
        if (user && !Array.from(userFilter.options).some((option) => option.value === user)) {
          userFilter.appendChild(new Option(user, user));
        }
        userFilter.value = user;
      }
      filterEventsByUser(user);
      refreshSystemEvents().catch(() => {});
      showToast(`Showing ${user || 'all users'} activity timeline`);
    });
  });
}

function applyDirectoryFilters() {
  const search = (document.getElementById('event-search')?.value || '').toLowerCase();
  const department = document.getElementById('department-filter')?.value || '';
  const online = document.getElementById('online-filter')?.value || '';

  document.querySelectorAll('.employee-filter-card').forEach((card) => {
    const matchesSearch = !search || card.textContent.toLowerCase().includes(search);
    const matchesDepartment = !department || card.dataset.department === department;
    const matchesOnline = !online || card.dataset.status === online;
    card.classList.toggle('hidden', !(matchesSearch && matchesDepartment && matchesOnline));
  });
}

['event-search', 'department-filter', 'online-filter'].forEach((id) => {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('input', applyDirectoryFilters);
    element.addEventListener('change', applyDirectoryFilters);
  }
});

attachEmployeeFilterCards();

function enhanceRevealAnimations() {
  const revealItems = document.querySelectorAll('.reveal');
  if (!revealItems.length) {
    return;
  }

  if (!('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function animateNumericText(element) {
  const rawText = element.textContent.trim();
  const match = rawText.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) {
    return;
  }

  const target = Number(match[1]);
  if (!Number.isFinite(target) || target <= 0) {
    return;
  }

  const suffix = match[2] || '';
  const decimals = match[1].includes('.') ? Math.min(match[1].split('.')[1].length, 1) : 0;
  const duration = 760;
  const startedAt = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = target * eased;
    element.textContent = `${value.toFixed(decimals)}${suffix}`;

    if (progress < 1) {
      window.requestAnimationFrame(tick);
    } else {
      element.textContent = rawText;
    }
  };

  window.requestAnimationFrame(tick);
}

function enhanceMetricCounters() {
  const counters = document.querySelectorAll('.metric-card strong, .summary-tile strong, .session-status-card strong');
  counters.forEach((counter) => {
    if (counter.dataset.enhancedCounter === 'true') {
      return;
    }
    counter.dataset.enhancedCounter = 'true';
    animateNumericText(counter);
  });
}

function enhanceButtonRipples() {
  document.querySelectorAll('.btn').forEach((button) => {
    if (button.dataset.rippleReady === 'true') {
      return;
    }

    button.dataset.rippleReady = 'true';
    button.addEventListener('click', (event) => {
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      button.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    });
  });
}

function enhanceTableSearch() {
  document.querySelectorAll('.topbar .search-box input[type="search"]:not([readonly])').forEach((input) => {
    if (input.dataset.tableSearchReady === 'true') {
      return;
    }

    input.dataset.tableSearchReady = 'true';
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      document.querySelectorAll('tbody tr, .timeline-stream .event-row, .employee-filter-card').forEach((row) => {
        row.classList.toggle('hidden', Boolean(query) && !row.textContent.toLowerCase().includes(query));
      });
    });
  });
}

function initPerformanceOverview() {
  const filterBar = document.getElementById('performance-filters');
  const rows = Array.from(document.querySelectorAll('.performance-filter-row'));
  if (!filterBar || !rows.length) {
    return;
  }

  const controls = {
    employee: document.getElementById('filter-employee'),
    department: document.getElementById('filter-department'),
    attendance: document.getElementById('filter-attendance'),
    task: document.getElementById('filter-task'),
    productivity: document.getElementById('filter-productivity'),
    search: document.getElementById('performance-search'),
  };

  function matches(row, key, value) {
    if (!value) return true;
    return String(row.dataset[key] || '').toLowerCase() === String(value).toLowerCase();
  }

  function applyFilters() {
    const search = String(controls.search?.value || '').trim().toLowerCase();
    rows.forEach((row) => {
      const visible =
        matches(row, 'employee', controls.employee?.value) &&
        matches(row, 'department', controls.department?.value) &&
        matches(row, 'attendance', controls.attendance?.value) &&
        matches(row, 'task', controls.task?.value) &&
        matches(row, 'productivity', controls.productivity?.value) &&
        (!search || row.textContent.toLowerCase().includes(search));
      row.classList.toggle('hidden', !visible);
    });
  }

  Object.values(controls).forEach((control) => {
    if (control) {
      control.addEventListener('input', applyFilters);
      control.addEventListener('change', applyFilters);
    }
  });

  filterBar.querySelectorAll('[data-quick-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const dateInput = document.getElementById('filter-date');
      if (dateInput) {
        dateInput.valueAsDate = new Date();
      }
      showToast(`${button.textContent.trim()} filter applied.`, 'info');
      applyFilters();
    });
  });

  document.querySelectorAll('[data-export-table]').forEach((button) => {
    button.addEventListener('click', () => {
      const table = document.getElementById(button.dataset.exportTable);
      if (!table) return;

      const csv = Array.from(table.querySelectorAll('tr:not(.hidden)')).map((row) => (
        Array.from(row.cells).map((cell) => {
          const value = cell.textContent.replace(/\s+/g, ' ').trim().replace(/"/g, '""');
          return `"${value}"`;
        }).join(',')
      )).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = button.dataset.exportName || 'employee-performance.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast('CSV export generated.', 'success');
    });
  });
}

function enhanceUiInteractions() {
  enhanceRevealAnimations();
  enhanceMetricCounters();
  enhanceButtonRipples();
  enhanceTableSearch();
  initPerformanceOverview();
}

enhanceUiInteractions();

const NotificationCenter = (() => {
  const state = {
    activeTab: 'all',
    notifications: [],
    unreadCount: 0,
    socketReady: false,
  };

  function elements() {
    return {
      button: document.getElementById('notification-button'),
      count: document.getElementById('notification-count'),
      drawer: document.getElementById('notification-drawer'),
      list: document.getElementById('notification-list'),
      tabs: document.getElementById('notification-tabs'),
      close: document.getElementById('close-notification-drawer'),
      markAll: document.getElementById('mark-all-notifications'),
      enable: document.getElementById('enable-notifications'),
    };
  }

  function iconFor(notification) {
    const type = String(notification.type || 'General');
    if (type.includes('Leave Approved')) return { icon: 'fa-circle-check', tone: 'success' };
    if (type.includes('Leave Rejected')) return { icon: 'fa-circle-xmark', tone: 'error' };
    if (['Attendance', 'Sign In Reminder', 'Checkout'].includes(type)) return { icon: 'fa-calendar-check', tone: 'warning' };
    if (['Overtime', 'System Alert'].includes(type)) return { icon: 'fa-triangle-exclamation', tone: 'error' };
    if (['Daily Report', 'Leave Request'].includes(type)) return { icon: 'fa-clipboard-list', tone: 'success' };
    return { icon: 'fa-bell', tone: 'info' };
  }

  function updateCount(count = state.unreadCount) {
    const ui = elements();
    state.unreadCount = Number(count || 0);
    if (!ui.count) return;
    ui.count.textContent = state.unreadCount > 99 ? '99+' : String(state.unreadCount);
    ui.count.hidden = state.unreadCount <= 0;
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function render() {
    const ui = elements();
    if (!ui.list) return;

    if (!state.notifications.length) {
      ui.list.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
      return;
    }

    ui.list.innerHTML = state.notifications.map((notification) => {
      const icon = iconFor(notification);
      const createdAt = notification.createdAt ? new Date(notification.createdAt).toLocaleString() : '';
      return `
        <article class="notification-item ${notification.isRead ? '' : 'unread'}" data-id="${escapeText(notification.id || notification._id)}" data-url="${escapeText(notification.actionUrl || '')}">
          <span class="notification-icon ${icon.tone}"><i class="fa-solid ${icon.icon}"></i></span>
          <span class="notification-copy">
            <strong>${escapeText(notification.title)}</strong>
            <p>${escapeText(notification.message)}</p>
            <small>${escapeText(notification.type)} · ${escapeText(createdAt)}</small>
          </span>
          <span class="notification-item-actions">
            <button type="button" class="notification-read" aria-label="Mark as read"><i class="fa-solid fa-check"></i></button>
            <button type="button" class="notification-delete" aria-label="Delete notification"><i class="fa-solid fa-trash"></i></button>
          </span>
        </article>
      `;
    }).join('');
  }

  async function load(tab = state.activeTab) {
    const ui = elements();
    if (!ui.list) return;
    state.activeTab = tab;
    const data = await fetchJson(`/api/notifications?tab=${encodeURIComponent(tab)}`, { loaderSilent: true });
    state.notifications = data.notifications || [];
    updateCount(data.unreadCount || 0);
    render();
  }

  async function markRead(id) {
    if (!id) return;
    await fetchJson(`/api/notifications/${id}/read`, { method: 'POST', loaderSilent: true });
    const item = state.notifications.find((notification) => String(notification.id || notification._id) === String(id));
    if (item && !item.isRead) {
      item.isRead = true;
      updateCount(Math.max(state.unreadCount - 1, 0));
    }
    render();
  }

  async function deleteNotification(id) {
    if (!id) return;
    await fetchJson(`/api/notifications/${id}`, { method: 'DELETE', loaderSilent: true });
    const deleted = state.notifications.find((notification) => String(notification.id || notification._id) === String(id));
    state.notifications = state.notifications.filter((notification) => String(notification.id || notification._id) !== String(id));
    if (deleted && !deleted.isRead) updateCount(Math.max(state.unreadCount - 1, 0));
    render();
  }

  async function markAll() {
    await fetchJson('/api/notifications/read-all', { method: 'POST', loaderSilent: true });
    state.notifications.forEach((notification) => {
      notification.isRead = true;
    });
    updateCount(0);
    render();
  }

  function showPopup(notification) {
    showToast(`${notification.title}: ${notification.message}`, 'info');

    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        tag: notification.id || notification._id,
      });
      browserNotification.onclick = () => {
        window.focus();
        if (notification.actionUrl) window.location.href = notification.actionUrl;
      };
    }
  }

  function handleRealtime(notification) {
    state.notifications = [notification, ...state.notifications.filter((item) => String(item.id || item._id) !== String(notification.id || notification._id))].slice(0, 50);
    updateCount(state.unreadCount + (notification.isRead ? 0 : 1));
    render();
    showPopup(notification);
  }

  async function registerWebPush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      showToast('Browser notifications are not supported here.', 'warning');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Notification permission was not granted.', 'warning');
      return;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const config = window.firebaseWebConfig || {};

    if (window.firebase && config.apiKey && config.messagingSenderId && config.vapidKey) {
      firebase.initializeApp(config);
      const messaging = firebase.messaging();
      const fcmToken = await messaging.getToken({ vapidKey: config.vapidKey, serviceWorkerRegistration: registration });
      if (fcmToken) {
        await fetchJson('/api/notifications/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fcmToken }),
          loaderSilent: true,
        });
      }
    }

    if (config.vapidKey && registration.pushManager) {
      const applicationServerKey = urlBase64ToUint8Array(config.vapidKey);
      const webPushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      await fetchJson('/api/notifications/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webPushSubscription }),
        loaderSilent: true,
      });
    }

    showToast('Browser notifications enabled.', 'success');
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  }

  function applyScheduleToUI(schedule) {
    if (!schedule) return;
    const fmt12 = (t) => { 
      if (!t) return '--:--'; 
      const [h, m] = t.split(':').map(Number); 
      const ampm = h >= 12 ? 'PM' : 'AM'; 
      const h12 = h % 12 || 12; 
      return h12 + ':' + String(m).padStart(2,'0') + ' ' + ampm; 
    };
    const elements = document.querySelectorAll('[data-schedule-field]');
    elements.forEach(el => {
      const field = el.dataset.scheduleField;
      if (schedule[field] !== undefined) {
        if (['officeJoinTime', 'checkOutTime', 'overtimeStartTime'].includes(field)) {
          el.textContent = fmt12(schedule[field]);
        } else if (field === 'workingHours') {
          el.textContent = schedule[field] + ' hrs';
        } else if (['breakMinutes', 'gracePeriodMinutes'].includes(field)) {
          el.textContent = schedule[field] + ' min';
        } else {
          el.textContent = schedule[field];
        }
      }
    });
    const lastUpdated = document.getElementById('schedule-last-updated');
    if (lastUpdated && schedule.updatedAt) {
      lastUpdated.innerHTML = `<i class="fa-solid fa-rotate"></i> Last updated: ${new Date(schedule.updatedAt).toLocaleString()}`;
    }
  }

  function connectSocket() {
    if (typeof io !== 'function' || state.socketReady) return;
    const socket = io({ withCredentials: true });
    socket.on('notification:ready', () => {
      state.socketReady = true;
    });
    socket.on('notification:new', handleRealtime);
    socket.on('schedule:updated', (schedule) => {
      applyScheduleToUI(schedule);
      showToast('Work schedule updated by Admin.', 'info');
    });
    socket.on('profile:updated', (profile) => {
      if (profile.profileImageUrl) {
        document.querySelectorAll('.navbar-profile-avatar img, #enrollment-profile-photo, #profile-photo-preview')
          .forEach((image) => { image.src = profile.profileImageUrl; });
      }
      const topbarName = document.querySelector('.topbar .search-box input');
      if (topbarName && profile.name) topbarName.value = profile.name;
    });

    const incrementMetric = (id, amount = 1) => {
      const el = document.getElementById(id);
      if (!el) return;
      const current = Number.parseInt(el.textContent || '0', 10);
      el.textContent = String((Number.isFinite(current) ? current : 0) + amount);
    };

    const loginEvents = ['Login', 'Logout', 'Windows Login', 'Windows Logout', 'Face Login', 'Password Login', 'Employee Login', 'User Session Start', 'User Session End', 'Session Connect', 'Session Disconnect'];
    const lockEvents = ['Lock', 'Unlock', 'Screen Lock', 'Screen Unlock'];
    const sleepEvents = ['Sleep', 'Wakeup', 'Wake Up'];

    socket.on('system_event:new', (event) => {
      const type = event.event || event.type || '';
      if (loginEvents.includes(type)) {
        incrementMetric('metric-signin-count');
      } else if (lockEvents.includes(type)) {
        incrementMetric('metric-lock-count');
      } else if (sleepEvents.includes(type)) {
        incrementMetric('metric-sleep-count');
      }
      incrementMetric('metric-total-activities');
      const totalEl = document.getElementById('metric-total-activities');
      const statusEl = document.getElementById('metric-total-activities-status');
      if (totalEl && statusEl) statusEl.textContent = totalEl.textContent;
    });

    socket.on('work_session:updated', (session) => {
      const prodEl = document.getElementById('session-productivity');
      if (prodEl) prodEl.textContent = (session.productivityScore || 0) + '%';
      
      const evtCountEl = document.getElementById('session-event-count');
      if (evtCountEl) evtCountEl.textContent = session.events ? session.events.length : 0;
      
      const activeEl = document.getElementById('session-active-time');
      if (activeEl) activeEl.textContent = Math.round((session.activeMs || 0) / 60000) + ' min';
      
      const idleEl = document.getElementById('session-idle-time');
      if (idleEl) idleEl.textContent = Math.round((session.idleMs || 0) / 60000) + ' min';
    });
  }

  function bind() {
    const ui = elements();
    if (!ui.button || !ui.drawer || !ui.list) return;

    ui.button.addEventListener('click', async () => {
      ui.drawer.hidden = false;
      await load(state.activeTab).catch((error) => showToast(error.message, 'error'));
    });
    ui.close?.addEventListener('click', () => {
      ui.drawer.hidden = true;
    });
    ui.drawer.addEventListener('click', (event) => {
      if (event.target === ui.drawer) ui.drawer.hidden = true;
    });
    ui.markAll?.addEventListener('click', () => markAll().catch((error) => showToast(error.message, 'error')));
    ui.enable?.addEventListener('click', () => registerWebPush().catch((error) => showToast(error.message, 'error')));
    ui.tabs?.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (!tab) return;
      ui.tabs.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button === tab));
      load(tab.dataset.tab).catch((error) => showToast(error.message, 'error'));
    });
    ui.list.addEventListener('click', (event) => {
      const item = event.target.closest('.notification-item');
      if (!item) return;
      const id = item.dataset.id;
      if (event.target.closest('.notification-delete')) {
        deleteNotification(id).catch((error) => showToast(error.message, 'error'));
      } else if (event.target.closest('.notification-read')) {
        markRead(id).catch((error) => showToast(error.message, 'error'));
      } else {
        markRead(id).catch(() => {});
        if (item.dataset.url) window.location.href = item.dataset.url;
      }
    });

    load('all').catch(() => {});
    connectSocket();
  }

  return { bind, load };
})();

NotificationCenter.bind();
initAdminEmployeeMessageTest();
