// Script only runs on http/https pages

if (!document.body) {
  const observer = new MutationObserver(() => {
    if (document.body) {
      observer.disconnect();
      initFab();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
} else {
  initFab();
}

function initFab() {
  if (document.getElementById('labClassFab')) return;

  // Floating button — will show class code
  const fab = document.createElement('div');
  fab.id = 'labClassFab';
  fab.title = 'Click to change Class Code / Roll Number';
  document.body.appendChild(fab);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'labClassPanel';
  panel.innerHTML = `
    <div class="close-btn" title="Close">×</div>
    <strong>Current: <span id="currentInfo">Loading...</span></strong>
    <input type="text" id="newCode" placeholder="Class Code (e.g. 10A)">
    <input type="text" id="newRoll" placeholder="Roll Number">
    <button id="saveBtn">Update</button>
    <button id="clearBtn" class="clear-btn">Clear</button>
  `;
  document.body.appendChild(panel);

  // Toggle panel
  fab.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent closing when clicking button
    panel.classList.toggle('open');
  });

  document.querySelector('#labClassPanel .close-btn').addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!fab.contains(e.target) && !panel.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  async function updateDisplay() {
    try {
      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
      const classCode = studentInfo.classCode || '?'; // Show ? if not set

      // Update button text to show current class code
      fab.textContent = classCode;

      // Update panel info
      const display = studentInfo.classCode 
        ? `Class: ${studentInfo.classCode} | Roll: ${studentInfo.rollNumber || '—'}`
        : 'Not set';

      document.getElementById('currentInfo').textContent = display;
      document.getElementById('newCode').value = studentInfo.classCode || '';
      document.getElementById('newRoll').value = studentInfo.rollNumber || '';
    } catch (e) {
      console.warn('Storage error:', e);
      fab.textContent = '!';
    }
  }

  updateDisplay();

  // Save
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const code = document.getElementById('newCode').value.trim();
    const roll = document.getElementById('newRoll').value.trim();
    if (!code || !roll) {
      alert('Please fill both Class Code and Roll Number');
      return;
    }
    await chrome.storage.local.set({ studentInfo: { classCode: code, rollNumber: roll } });
    updateDisplay();
    panel.classList.remove('open');
  });

  // Clear
  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('Clear class code and roll number?')) {
      await chrome.storage.local.remove('studentInfo');
      updateDisplay();
      panel.classList.remove('open');
    }
  });

  // Auto-update button if changed from options page
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.studentInfo) updateDisplay();
  });
}