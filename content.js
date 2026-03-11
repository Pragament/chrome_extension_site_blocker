// Script only runs on http/https pages

if (!document.body) {
  const observer = new MutationObserver(() => {
    if (document.body) {
      observer.disconnect();
      initFab();
      initChatGptPromptLogger();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
} else {
  initFab();
  initChatGptPromptLogger();
}

function initFab() {
  if (document.getElementById('labClassFab')) return;

  function hasExtensionContext() {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  }

  function applyFabPosition(position) {
    const side = position === 'left' ? 'left' : 'right';
    fab.dataset.position = side;
    panel.dataset.position = side;
  }

  function getNextPositionLabel() {
    return fab.dataset.position === 'left' ? 'Move to Right' : 'Move to Left';
  }

  // Floating button — will show class code
  const fab = document.createElement('div');
  fab.id = 'labClassFab';
  fab.title = 'Click to change Class Code / Roll Number';
  fab.innerHTML = `
    <span class="fab-class">?</span>
    <span class="fab-roll">Roll: -</span>
    <span class="fab-pc">PC: -</span>
  `;
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
    <button id="toggleFabPositionBtn" type="button">Move to Left</button>
  `;
  document.body.appendChild(panel);

  const fabClass = fab.querySelector('.fab-class');
  const fabRoll = fab.querySelector('.fab-roll');
  const fabPc = fab.querySelector('.fab-pc');
  const newCodeInput = document.getElementById('newCode');
  const newRollInput = document.getElementById('newRoll');
  const saveBtn = document.getElementById('saveBtn');
  const toggleFabPositionBtn = document.getElementById('toggleFabPositionBtn');

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

  [newCodeInput, newRollInput].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      saveBtn.click();
    });
  });

  toggleFabPositionBtn.addEventListener('click', async () => {
    if (!hasExtensionContext()) {
      console.warn('[site-blocker] toggleFabPositionBtn aborted: extension context invalidated');
      alert('Extension was reloaded. Refresh this page and try again.');
      return;
    }

    const nextPosition = fab.dataset.position === 'left' ? 'right' : 'left';
    applyFabPosition(nextPosition);
    toggleFabPositionBtn.textContent = getNextPositionLabel();
    await chrome.storage.local.set({ labClassFabPosition: nextPosition });
    console.debug('[site-blocker] labClassFab position updated', { nextPosition });
  });

  async function updateDisplay() {
    if (!hasExtensionContext()) {
      console.warn('[site-blocker] extension context unavailable during updateDisplay');
      fabClass.textContent = '!';
      fabRoll.textContent = 'Roll: -';
      fabPc.textContent = 'PC: -';
      return;
    }

    try {
      const { studentInfo = {}, pcCode = '', labClassFabPosition = 'right' } = await chrome.storage.local.get([
        'studentInfo',
        'pcCode',
        'labClassFabPosition',
      ]);
      const classCode = studentInfo.classCode || '?'; // Show ? if not set
      const rollNumber = studentInfo.rollNumber || '-';

      applyFabPosition(labClassFabPosition);
      toggleFabPositionBtn.textContent = getNextPositionLabel();

      // Update button text to show current class code and roll number
      fabClass.textContent = classCode;
      fabRoll.textContent = `Roll: ${rollNumber}`;
      fabPc.textContent = `PC: ${pcCode || '-'}`;

      // Update panel info
      const display = studentInfo.classCode 
        ? `Class: ${studentInfo.classCode} | Roll: ${studentInfo.rollNumber || '—'} | PC: ${pcCode || '—'}`
        : `Class: — | Roll: — | PC: ${pcCode || '—'}`;

      document.getElementById('currentInfo').textContent = display;
      newCodeInput.value = studentInfo.classCode || '';
      newRollInput.value = studentInfo.rollNumber || '';
    } catch (e) {
      console.warn('Storage error:', e);
      fabClass.textContent = '!';
      fabRoll.textContent = 'Roll: -';
      fabPc.textContent = 'PC: -';
    }
  }

  updateDisplay();

  // Save
  saveBtn.addEventListener('click', async () => {
    const code = newCodeInput.value.trim();
    const roll = newRollInput.value.trim();

    console.debug('[site-blocker] saveBtn clicked', {
      enteredClassCode: code,
      enteredRollNumber: roll,
    });

    if (!code || !roll) {
      console.debug('[site-blocker] saveBtn validation failed', {
        missingClassCode: !code,
        missingRollNumber: !roll,
      });
      alert('Please fill both Class Code and Roll Number');
      return;
    }

    if (!hasExtensionContext()) {
      console.warn('[site-blocker] saveBtn aborted: extension context invalidated');
      alert('Extension was reloaded. Refresh this page and try again.');
      return;
    }

    try {
      console.debug('[site-blocker] validating class code against Firestore');
      const refreshResponse = await chrome.runtime.sendMessage({ type: 'refreshWishlist', classCode: code });
      console.debug('[site-blocker] refreshWishlist response received', refreshResponse);

      if (!refreshResponse?.success) {
        alert(refreshResponse?.message || 'Class code was not found in Firestore.');
        return;
      }

      console.debug('[site-blocker] saving studentInfo to chrome.storage.local');
      await chrome.storage.local.set({ studentInfo: { classCode: code, rollNumber: roll } });

      console.debug('[site-blocker] wishlist refresh completed, refreshing panel display');
      await updateDisplay();

      console.debug('[site-blocker] closing panel after save');
      panel.classList.remove('open');
    } catch (error) {
      const isInvalidated = error?.message?.includes('Extension context invalidated');
      console.warn('[site-blocker] saveBtn failed', { error, isInvalidated });

      if (isInvalidated) {
        alert('Extension was reloaded. Refresh this page and try again.');
        return;
      }

      throw error;
    }
  });

  // Clear
  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('Clear class code and roll number?')) {
      if (!hasExtensionContext()) {
        console.warn('[site-blocker] clearBtn aborted: extension context invalidated');
        alert('Extension was reloaded. Refresh this page and try again.');
        return;
      }

      try {
        await chrome.storage.local.remove('studentInfo');
        // Clear wishlist cache when student info is cleared
        await chrome.storage.local.remove('classWishlistCache');
        await updateDisplay();
        panel.classList.remove('open');
      } catch (error) {
        const isInvalidated = error?.message?.includes('Extension context invalidated');
        console.warn('[site-blocker] clearBtn failed', { error, isInvalidated });

        if (isInvalidated) {
          alert('Extension was reloaded. Refresh this page and try again.');
          return;
        }

        throw error;
      }
    }
  });

  // Auto-update button if changed from options page
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.studentInfo || changes.pcCode || changes.labClassFabPosition) updateDisplay();
  });
}

function initChatGptPromptLogger() {
  if (window.location.origin !== 'https://chatgpt.com') return;
  if (window.__labPolicyChatGptLoggerInitialized) return;
  window.__labPolicyChatGptLoggerInitialized = true;

  let lastLoggedPrompt = '';
  let lastLoggedAt = 0;

  async function logPromptFromComposer() {
    const promptEl = document.getElementById('prompt-textarea');
    const prompt = promptEl?.innerText?.trim();

    if (!prompt) {
      console.log('[site-blocker] ChatGPT prompt logging skipped: empty prompt');
      return;
    }

    const now = Date.now();
    if (prompt === lastLoggedPrompt && now - lastLoggedAt < 3000) {
      console.log('[site-blocker] ChatGPT prompt logging skipped: duplicate submit', { prompt });
      return;
    }

    lastLoggedPrompt = prompt;
    lastLoggedAt = now;

    try {
      console.log('[site-blocker] ChatGPT prompt detected', { prompt });
      const response = await chrome.runtime.sendMessage({
        type: 'logChatGptPrompt',
        prompt,
      });
      console.log('[site-blocker] ChatGPT prompt logged', response);
    } catch (error) {
      console.warn('[site-blocker] failed to log ChatGPT prompt', error);
    }
  }

  document.addEventListener('click', (event) => {
    const submitButton = event.target.closest('#composer-submit-button');
    if (!submitButton) return;
    console.log('[site-blocker] ChatGPT submit button clicked');
    logPromptFromComposer();
  }, true);

  document.addEventListener('keydown', (event) => {
    const promptEl = event.target.closest('#prompt-textarea');
    if (!promptEl) return;
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    console.log('[site-blocker] ChatGPT prompt submitted with Enter key');
    logPromptFromComposer();
  }, true);
}
