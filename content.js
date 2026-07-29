// Script only runs on http/https pages

if (!document.body) {
  const observer = new MutationObserver(() => {
    if (document.body) {
      observer.disconnect();
      initFab();
      initChatGptPromptLogger();
      initCopilotPromptLogger();
      initGeminiPromptLogger();
      initW3SchoolsCodeHelp();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
} else {
  initFab();
  initChatGptPromptLogger();
  initCopilotPromptLogger();
  initGeminiPromptLogger();
  initW3SchoolsCodeHelp();
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
    <div class="panel-section">
      <strong>Whitelisted websites</strong>
      <div id="whitelistLinks" class="whitelist-links">Loading...</div>
    </div>
    <input type="text" id="newCode" placeholder="Class Code (e.g. 10A)">
    <input type="text" id="newRoll" placeholder="Roll Number">
    <div class="field-help">For multiple students, use hyphen separator. Examples: A6, A6-B5, A6-B5-C8.</div>
    <button id="saveBtn">Update</button>
    <button id="clearBtn" class="clear-btn">Clear</button>
    <button id="toggleFabPositionBtn" type="button">Move to Left</button>
    <div id="w3schoolsCodeHelpSection" class="panel-section code-help-section" hidden>
      <strong>W3Schools editor</strong>
      <button id="askClassBtn" type="button">Ask Class</button>
      <div id="askClassForm" style="display: none; flex-direction: column; gap: 8px; margin-top: 8px;">
        <input type="text" id="qTitle" placeholder="Question Title (Optional)" style="padding: 6px; font-size: 13px; width: 100%; box-sizing: border-box;">
        <textarea id="qDesc" placeholder="Short Description (Optional)" style="padding: 6px; font-size: 13px; height: 60px; resize: none; border-radius: 6px; border: 1px solid #ccc; font-family: sans-serif; width: 100%; box-sizing: border-box;"></textarea>
        <div style="display: flex; gap: 8px; width: 100%;">
          <button id="submitQBtn" type="button" style="flex: 1; padding: 6px; font-size: 13px; background-color: #2ecc71;">Submit</button>
          <button id="cancelQBtn" type="button" style="flex: 1; padding: 6px; font-size: 13px; background-color: #95a5a6;">Cancel</button>
        </div>
      </div>
      <div id="codeHelpStatus" class="field-help" style="margin-top: 4px;"></div>
      
      <!-- Notifications Section -->
      <strong style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e5edf3; padding-top: 12px;">
        Notifications
        <button id="muteBtn" type="button" style="padding: 2px 6px; font-size: 11px; background-color: #f1f1f1; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Mute (10m)</button>
      </strong>
      <div id="incomingQuestionsList" style="margin-top: 8px; max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
        <div style="font-size: 11px; color: #888; text-align: center; padding: 10px;">No incoming questions.</div>
      </div>
      
      <!-- Answer Details View -->
      <div id="answerNotificationPanel" style="display: none; margin-top: 12px; padding: 10px; background: #e8f8f5; border: 1px solid #a3e4d7; border-radius: 6px; font-size: 12px; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #117864;">Answer Details</strong>
          <span id="closeAnswerPanelBtn" style="cursor: pointer; font-weight: bold; font-size: 14px; color: #117864;">×</span>
        </div>
        <div id="answerPanelMeta" style="font-size: 11px; color: #16a085;"></div>
        <div id="answerPanelDesc" style="font-style: italic; color: #2c3e50; max-height: 50px; overflow-y: auto;"></div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
          <button id="copyAnswerCodeBtn" type="button" style="padding: 4px 8px; font-size: 11px; background-color: #1abc9c; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Copy Code</button>
          <button id="loadAnswerCodeBtn" type="button" style="padding: 4px 8px; font-size: 11px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Load Editor</button>
        </div>
      </div>

      <strong style="margin-top: 12px; display: block; border-top: 1px solid #e5edf3; padding-top: 12px;">Student Dashboard</strong>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px; width: 100%;">
        <button id="dashClassQuestionsBtn" type="button" style="padding: 8px; font-size: 13px; background-color: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%;">Class Questions</button>
        <button id="dashMyQuestionsBtn" type="button" style="padding: 8px; font-size: 13px; background-color: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%;">My Questions</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const fabClass = fab.querySelector('.fab-class');
  const fabRoll = fab.querySelector('.fab-roll');
  const fabPc = fab.querySelector('.fab-pc');
  const newCodeInput = document.getElementById('newCode');
  const newRollInput = document.getElementById('newRoll');
  const saveBtn = document.getElementById('saveBtn');
  const toggleFabPositionBtn = document.getElementById('toggleFabPositionBtn');
  const whitelistLinks = document.getElementById('whitelistLinks');

  function getDisplayWhitelist({ whitelist = [], classWishlistCache = null, studentInfo = {} }) {
    let lines = Array.isArray(whitelist) ? [...whitelist] : [];
    const hasFetchedWishlist = classWishlistCache &&
      classWishlistCache.classCode === studentInfo.classCode &&
      Array.isArray(classWishlistCache.wishlist);

    if (hasFetchedWishlist) {
      lines = [...lines, ...classWishlistCache.wishlist];
    }

    if (self.CONFIG && Array.isArray(self.CONFIG.REQUIRED_RULES)) {
      lines = [...lines, ...self.CONFIG.REQUIRED_RULES];
    }

    return Array.from(
      new Set(
        lines
          .map((line) => String(line || '').trim())
          .filter((line) => line && !/^chrome:\/\//i.test(line))
      )
    );
  }

  function ruleToHref(rule) {
    const normalizedRule = String(rule || '').trim();
    if (!normalizedRule) return '';
    if (/^https?:\/\//i.test(normalizedRule)) return normalizedRule;
    if (/^[a-z]+:\/\//i.test(normalizedRule)) return '';

    const hostname = normalizedRule.replace(/^\*\./, '').replace(/\/+$/, '');
    if (!hostname) return '';

    return `https://${hostname}`;
  }

  function renderWhitelistLinks(rules) {
    whitelistLinks.innerHTML = '';

    if (!rules.length) {
      whitelistLinks.textContent = 'No whitelisted websites found.';
      return;
    }

    const list = document.createElement('ul');

    rules.forEach((rule) => {
      const href = ruleToHref(rule);
      const item = document.createElement('li');

      if (href) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = rule;
        item.appendChild(link);
      } else {
        const text = document.createElement('span');
        text.textContent = rule;
        item.appendChild(text);
      }

      list.appendChild(item);
    });

    whitelistLinks.appendChild(list);
  }

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
      const storageState = await chrome.storage.local.get([
        'studentInfo',
        'pcCode',
        'labClassFabPosition',
        'whitelist',
        'classWishlistCache',
      ]);
      const {
        studentInfo = {},
        pcCode = '',
        labClassFabPosition = 'right',
      } = storageState;
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
        ? `Class: ${studentInfo.className || studentInfo.classCode} | Roll: ${studentInfo.rollNumber || '—'} | PC: ${pcCode || '—'}`
        : `Class: — | Roll: — | PC: ${pcCode || '—'}`;

      document.getElementById('currentInfo').textContent = display;
      newCodeInput.value = studentInfo.classCode || '';
      newRollInput.value = studentInfo.rollNumber || '';
      renderWhitelistLinks(getDisplayWhitelist(storageState));
    } catch (e) {
      console.warn('Storage error:', e);
      fabClass.textContent = '!';
      fabRoll.textContent = 'Roll: -';
      fabPc.textContent = 'PC: -';
      whitelistLinks.textContent = 'Unable to load whitelist.';
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
      await chrome.storage.local.set({ studentInfo: { classCode: code, rollNumber: roll, className: refreshResponse.className || '' } });
      console.log("[FCM] Student information saved successfully.");

      try {
        console.debug('[site-blocker] sending trigger_fcm_setup message to background script');
        await chrome.runtime.sendMessage({ type: 'trigger_fcm_setup' });
      } catch (fcmErr) {
        console.warn('[site-blocker] Failed to trigger FCM setup:', fcmErr);
      }

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
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.studentInfo || changes.pcCode || changes.labClassFabPosition || changes.whitelist || changes.classWishlistCache) {
        updateDisplay();
      }
    });
  }
}

// ============================================================
// Shared grammar prefix injected into all AI prompts
// ============================================================
const SPOKEN_GRAMMAR_PREFIX = [
  'First answer the user\'s actual question clearly and helpfully.',
  'Then check the user text only for spoken English grammar.',
  'Ignore capitalization, punctuation, and formatting issues.',
  'Treat it as spoken English practice.',
  'Reply in this order:',
  '1. Direct answer to the user\'s question.',
  '2. Corrected spoken-English version of the user text.',
  '3. Short explanation of the spoken grammar mistakes.',
  '',
  'User text:'
].join('\n');

function buildGrammarPrompt(userPrompt) {
  return `${SPOKEN_GRAMMAR_PREFIX}\n${userPrompt}`;
}

// ============================================================
// W3Schools Try editor code help
// ============================================================
function initW3SchoolsCodeHelp() {
  if (!isW3SchoolsTryEditorPage()) return;
  if (window.__labPolicyW3SchoolsCodeHelpInitialized) return;
  window.__labPolicyW3SchoolsCodeHelpInitialized = true;
  let activeAnswerCode = '';

  console.debug('[site-blocker] W3Schools code help initializing', {
    url: window.location.href,
  });

  function isExtensionContextAvailable() {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  }

  function getCodeMirrorEditor() {
    const wrapper = document.getElementById('textareawrapper');
    const codeMirrorEl = wrapper?.querySelector('.CodeMirror');
    return codeMirrorEl?.CodeMirror || window.editor || null;
  }

  function tryExtractFromMonaco(attempts) {
    attempts.push({ name: 'Monaco Editor (.monaco-editor)' });
    const monacoEl = document.querySelector('.monaco-editor');
    if (!monacoEl) return null;
    
    const ta = monacoEl.querySelector('textarea');
    if (ta && ta.value && ta.value.trim().length > 0) {
      return ta.value;
    }
    
    const lines = Array.from(monacoEl.querySelectorAll('.view-line'));
    if (lines.length > 0) {
      return lines.map(l => l.textContent || '').join('\n');
    }
    return null;
  }

  function tryExtractFromCodeMirror(attempts) {
    attempts.push({ name: 'CodeMirror Editor (.CodeMirror)' });
    const cmEl = document.querySelector('.CodeMirror');
    if (!cmEl) return null;
    
    const wrapper = document.getElementById('textareawrapper');
    const codeMirrorEl = wrapper?.querySelector('.CodeMirror') || cmEl;
    if (codeMirrorEl?.CodeMirror && typeof codeMirrorEl.CodeMirror.getValue === 'function') {
      return codeMirrorEl.CodeMirror.getValue();
    }
    if (window.editor && typeof window.editor.getValue === 'function') {
      return window.editor.getValue();
    }

    const codeEl = document.querySelector('.CodeMirror-code');
    if (codeEl) {
      const code = Array.from(codeEl.querySelectorAll('pre') || [])
        .map((line) => line.innerText)
        .join('\n');
      if (code && code.trim().length > 0) {
        return code;
      }
    }
    return null;
  }

  function tryExtractFromAce(attempts) {
    attempts.push({ name: 'Ace Editor (.ace_editor)' });
    const aceEl = document.querySelector('.ace_editor');
    if (!aceEl) return null;
    
    const ta = aceEl.querySelector('textarea.ace_text-input');
    if (ta && ta.value && ta.value.trim().length > 0) {
      return ta.value;
    }
    
    const lines = Array.from(aceEl.querySelectorAll('.ace_line'));
    if (lines.length > 0) {
      return lines.map(l => l.textContent || '').join('\n');
    }
    return null;
  }

  function tryExtractFromTextarea(attempts) {
    attempts.push({ name: 'Textarea Editors (#textareaCode, etc.)' });
    const selectors = [
      '#textareaCode',
      '#textareawrapper textarea',
      '#code',
      '#sourceCode',
      '.editor textarea',
      'textarea.editor'
    ];
    for (const sel of selectors) {
      attempts.push({ name: `Textarea selector: "${sel}"` });
      const ta = document.querySelector(sel);
      if (ta && ta.value && ta.value.trim().length > 0) {
        return ta.value;
      }
    }
    return null;
  }

  function tryExtractFromSQL(attempts) {
    attempts.push({ name: 'SQL Tryit Editor (#textareaCodeSQL, etc.)' });
    const selectors = [
      '#textareaCodeSQL',
      '#codeSQL',
      '#querySQL',
      '.ws-sql-editor',
      'textarea[name="codeSQL"]'
    ];
    for (const sel of selectors) {
      attempts.push({ name: `SQL selector: "${sel}"` });
      const el = document.querySelector(sel);
      if (el && el.value && el.value.trim().length > 0) {
        return el.value;
      }
    }

    const sqlCm = document.querySelector('.schemaCode') || document.querySelector('#textareaCodeSQL ~ .CodeMirror');
    if (sqlCm && sqlCm.CodeMirror && typeof sqlCm.CodeMirror.getValue === 'function') {
      return sqlCm.CodeMirror.getValue();
    }
    return null;
  }

  function tryExtractFallback(attempts) {
    attempts.push({ name: 'Fallback search (any visible textarea, contenteditable, iframe)' });
    
    const textareas = Array.from(document.querySelectorAll('textarea'));
    for (const ta of textareas) {
      if (ta.value && ta.value.trim().length > 0 && ta.offsetWidth > 0 && ta.offsetHeight > 0) {
        return ta.value;
      }
    }

    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    for (const ed of editables) {
      if (ed.innerText && ed.innerText.trim().length > 0) {
        return ed.innerText;
      }
    }

    const containers = ['.editor', '.editor-container', '#editor', '.code-area', '.code-container'];
    for (const c of containers) {
      const container = document.querySelector(c);
      if (container) {
        const pre = container.querySelector('pre') || container.querySelector('code');
        if (pre && pre.innerText && pre.innerText.trim().length > 0) {
          return pre.innerText;
        }
      }
    }

    const iframes = Array.from(document.querySelectorAll('iframe'));
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc) {
          const ta = doc.querySelector('#textareaCode') || doc.querySelector('textarea');
          if (ta && ta.value && ta.value.trim().length > 0) {
            return ta.value;
          }
        }
      } catch (e) {
        // Cross-origin, ignore
      }
    }
    return null;
  }

  function cleanCodeString(str) {
    if (!str) return "";
    return str
      .replace(/[\u200b-\u200d\ufeff]/g, '') // remove zero-width characters
      .replace(/\u00a0/g, ' ')               // replace non-breaking spaces with normal spaces
      .replace(/^[ \t]*\u2022[ \t]*$/gm, '')  // clean lines containing only a bullet point
      .replace(/\r\n/g, '\n')                // normalize windows newlines
      .replace(/\r/g, '\n');                 // normalize mac newlines
  }

  function readW3SchoolsCode() {
    const attempts = [];
    console.debug('[Extractor] Starting code extraction...');
    let rawCode = null;

    // 1. Monaco Editor
    console.debug('[Extractor] Trying: Monaco');
    let code = tryExtractFromMonaco(attempts);
    if (code && code.trim().length > 0) {
      console.log(`[Extractor]\nDetected page: W3Schools Monaco Editor\nMethod: Monaco extractor\nSuccess\nLength: ${code.length}`);
      rawCode = code;
    } else {
      console.debug('[Extractor] Monaco: Not found');
    }

    // 2. CodeMirror
    if (!rawCode) {
      console.debug('[Extractor] Trying: CodeMirror');
      code = tryExtractFromCodeMirror(attempts);
      if (code && code.trim().length > 0) {
        console.log(`[Extractor]\nDetected page: W3Schools CodeMirror\nMethod: CodeMirror extractor\nSuccess\nLength: ${code.length}`);
        rawCode = code;
      } else {
        console.debug('[Extractor] CodeMirror: Not found');
      }
    }

    // 3. Ace Editor
    if (!rawCode) {
      console.debug('[Extractor] Trying: Ace');
      code = tryExtractFromAce(attempts);
      if (code && code.trim().length > 0) {
        console.log(`[Extractor]\nDetected page: W3Schools Ace Editor\nMethod: Ace extractor\nSuccess\nLength: ${code.length}`);
        rawCode = code;
      } else {
        console.debug('[Extractor] Ace: Not found');
      }
    }

    // 4. SQL Tryit Editor
    if (!rawCode) {
      console.debug('[Extractor] Trying: SQL');
      code = tryExtractFromSQL(attempts);
      if (code && code.trim().length > 0) {
        console.log(`[Extractor]\nDetected page: SQL Tryit\nMethod: SQL extractor\nSuccess\nLength: ${code.length}`);
        rawCode = code;
      } else {
        console.debug('[Extractor] SQL: Not found');
      }
    }

    // 5. Textarea
    if (!rawCode) {
      console.debug('[Extractor] Trying: Textarea');
      code = tryExtractFromTextarea(attempts);
      if (code && code.trim().length > 0) {
        console.log(`[Extractor]\nDetected page: W3Schools Textarea Editor\nMethod: Textarea extractor\nSuccess\nLength: ${code.length}`);
        rawCode = code;
      } else {
        console.debug('[Extractor] Textarea: Not found');
      }
    }

    // 6. Fallback
    if (!rawCode) {
      console.debug('[Extractor] Trying: Fallback');
      code = tryExtractFallback(attempts);
      if (code && code.trim().length > 0) {
        console.log(`[Extractor]\nDetected page: W3Schools Fallback\nMethod: Fallback extractor\nSuccess\nLength: ${code.length}`);
        rawCode = code;
      } else {
        console.debug('[Extractor] Fallback: Not found');
      }
    }

    if (rawCode !== null) {
      return cleanCodeString(rawCode);
    }

    // All failed
    console.warn('[Extractor] All code extraction methods failed.');
    console.warn('[Extractor] Checked selectors and methods:');
    attempts.forEach(attempt => {
      console.warn(`  - ${attempt.name} [x]`);
    });
    
    return 'No code found';
  }

  function writeW3SchoolsCode(code) {
    // 1. Monaco Editor (e.g. newer Tryit Editors)
    if (window.monaco && window.monaco.editor) {
      const editors = window.monaco.editor.getEditors();
      if (editors && editors.length > 0) {
        editors[0].setValue(code);
        return true;
      }
    }

    // 2. CodeMirror (main block)
    const editor = getCodeMirrorEditor();
    if (editor && typeof editor.setValue === 'function') {
      editor.setValue(code);
      editor.focus?.();
      return true;
    }

    // 3. SQL Tryit Editor (CodeMirror instance or textarea)
    const sqlCm = document.querySelector('.schemaCode') || document.querySelector('#textareaCodeSQL ~ .CodeMirror');
    if (sqlCm && sqlCm.CodeMirror && typeof sqlCm.CodeMirror.setValue === 'function') {
      sqlCm.CodeMirror.setValue(code);
      sqlCm.CodeMirror.focus?.();
      return true;
    }
    
    const sqlTextarea = document.getElementById('textareaCodeSQL');
    if (sqlTextarea) {
      sqlTextarea.value = code;
      sqlTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    // 4. Default Textarea wrappers
    const textarea = document.querySelector('#textareawrapper textarea') || document.getElementById('textareaCode');
    if (!textarea) {
      console.warn('[site-blocker] W3Schools editor write failed: textarea not found');
      return false;
    }

    textarea.value = code;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setStatus(message) {
    const statusEl = document.getElementById('codeHelpStatus');
    if (statusEl) statusEl.textContent = message;
  }

  function preparePanel() {
    const section = document.getElementById('w3schoolsCodeHelpSection');
    const askClassBtn = document.getElementById('askClassBtn');
    const askClassForm = document.getElementById('askClassForm');
    const qTitle = document.getElementById('qTitle');
    const qDesc = document.getElementById('qDesc');
    const submitQBtn = document.getElementById('submitQBtn');
    const cancelQBtn = document.getElementById('cancelQBtn');
    const dashClassQuestionsBtn = document.getElementById('dashClassQuestionsBtn');
    const dashMyQuestionsBtn = document.getElementById('dashMyQuestionsBtn');

    if (!section || !askClassBtn || !askClassForm || !qTitle || !qDesc || !submitQBtn || !cancelQBtn || !dashClassQuestionsBtn || !dashMyQuestionsBtn) return false;

    section.hidden = false;

    askClassBtn.addEventListener('click', () => {
      askClassBtn.style.display = 'none';
      askClassForm.style.display = 'flex';
      qTitle.focus();
    });

    cancelQBtn.addEventListener('click', () => {
      askClassForm.style.display = 'none';
      askClassBtn.style.display = 'block';
      qTitle.value = '';
      qDesc.value = '';
      setStatus('');
    });

    submitQBtn.addEventListener('click', async () => {
      console.log('[site-blocker] W3Schools Ask Class submit clicked');
      if (!isExtensionContextAvailable()) {
        alert('Extension was reloaded. Refresh this page and try again.');
        return;
      }

      const title = qTitle.value.trim();
      const description = qDesc.value.trim();

      const code = readW3SchoolsCode();
      if (!code || !code.trim() || code === 'No code found') {
        setStatus('No code found in editor.');
        return;
      }

      submitQBtn.disabled = true;
      cancelQBtn.disabled = true;
      setStatus('Submitting question...');

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'askClassQuestion',
          title,
          description,
          code,
          editorUrl: window.location.href
        });

        if (response && response.success) {
          qTitle.value = '';
          qDesc.value = '';
          askClassForm.style.display = 'none';
          askClassBtn.style.display = 'block';
          setStatus('Question posted!');
        } else {
          setStatus(response?.message || 'Error posting question.');
        }
      } catch (error) {
        console.warn('[site-blocker] Ask Class failed', error);
        setStatus('Error posting question.');
      } finally {
        submitQBtn.disabled = false;
        cancelQBtn.disabled = false;
      }
    });

    dashClassQuestionsBtn.addEventListener('click', async () => {
      console.debug('[site-blocker] Class Questions dashboard button clicked');
      if (!isExtensionContextAvailable()) {
        alert('Extension was reloaded. Refresh this page and try again.');
        return;
      }
      chrome.runtime.sendMessage({
        type: 'openStudentDashboard',
        tab: 'classQuestions'
      });
    });

    dashMyQuestionsBtn.addEventListener('click', async () => {
      console.debug('[site-blocker] My Questions dashboard button clicked');
      if (!isExtensionContextAvailable()) {
        alert('Extension was reloaded. Refresh this page and try again.');
        return;
      }
      chrome.runtime.sendMessage({
        type: 'openStudentDashboard',
        tab: 'myQuestions'
      });
    });

    dashMyQuestionsBtn.addEventListener('click', async () => {
      console.debug('[site-blocker] My Questions dashboard button clicked');
      if (!isExtensionContextAvailable()) {
        alert('Extension was reloaded. Refresh this page and try again.');
        return;
      }
      chrome.runtime.sendMessage({
        type: 'openStudentDashboard',
        tab: 'myQuestions'
      });
    });

    // Mute button logic
    const muteBtn = document.getElementById('muteBtn');
    let muteInterval = null;

    async function updateMuteButtonState() {
      if (!isExtensionContextAvailable()) return;
      const { muteEndTime } = await chrome.storage.local.get('muteEndTime');
      if (muteEndTime && Date.now() < Number(muteEndTime)) {
        const remainingMs = Number(muteEndTime) - Date.now();
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        muteBtn.textContent = `Muted (${mins}:${secs < 10 ? '0' : ''}${secs})`;
        muteBtn.style.backgroundColor = '#f1c40f'; // golden yellow active state
        muteBtn.style.color = '#333';
      } else {
        muteBtn.textContent = 'Mute (10m)';
        muteBtn.style.backgroundColor = '#f1f1f1';
        muteBtn.style.color = '#333';
        if (muteInterval) {
          clearInterval(muteInterval);
          muteInterval = null;
        }
      }
    }

    if (muteBtn) {
      updateMuteButtonState();
      muteBtn.addEventListener('click', async () => {
        if (!isExtensionContextAvailable()) return;
        const { muteEndTime } = await chrome.storage.local.get('muteEndTime');
        if (muteEndTime && Date.now() < Number(muteEndTime)) {
          // Unmute
          await chrome.storage.local.remove('muteEndTime');
          updateMuteButtonState();
        } else {
          // Mute for 10 minutes
          const newEndTime = Date.now() + 10 * 60 * 1000;
          await chrome.storage.local.set({ muteEndTime: newEndTime });
          updateMuteButtonState();
          if (muteInterval) clearInterval(muteInterval);
          muteInterval = setInterval(updateMuteButtonState, 1000);
        }
      });
      
      // Auto-start active interval check if already muted on load
      chrome.storage.local.get('muteEndTime').then(({ muteEndTime }) => {
        if (muteEndTime && Date.now() < Number(muteEndTime)) {
          muteInterval = setInterval(updateMuteButtonState, 1000);
        }
      });
    }

    // Answer Details Panel actions
    const closeAnswerPanelBtn = document.getElementById('closeAnswerPanelBtn');
    const copyAnswerCodeBtn = document.getElementById('copyAnswerCodeBtn');
    const loadAnswerCodeBtn = document.getElementById('loadAnswerCodeBtn');
    const answerNotificationPanel = document.getElementById('answerNotificationPanel');

    if (closeAnswerPanelBtn) {
      closeAnswerPanelBtn.addEventListener('click', () => {
        if (answerNotificationPanel) answerNotificationPanel.style.display = 'none';
      });
    }

    if (copyAnswerCodeBtn) {
      copyAnswerCodeBtn.addEventListener('click', () => {
        if (activeAnswerCode) {
          copyToClipboard(activeAnswerCode);
          const originalText = copyAnswerCodeBtn.textContent;
          copyAnswerCodeBtn.textContent = 'Copied!';
          setTimeout(() => { copyAnswerCodeBtn.textContent = originalText; }, 1500);
        } else {
          alert('No answer code found to copy.');
        }
      });
    }

    if (loadAnswerCodeBtn) {
      loadAnswerCodeBtn.addEventListener('click', () => {
        if (activeAnswerCode) {
          const success = writeW3SchoolsCode(activeAnswerCode);
          if (success) {
            const originalText = loadAnswerCodeBtn.textContent;
            loadAnswerCodeBtn.textContent = 'Loaded!';
            setTimeout(() => { loadAnswerCodeBtn.textContent = originalText; }, 1500);
          } else {
            alert('Failed to load code into editor.');
          }
        } else {
          alert('No answer code found to load.');
        }
      });
    }

    return true;
  }

  if (preparePanel()) return;

  const observer = new MutationObserver(() => {
    if (preparePanel()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function isW3SchoolsTryEditorPage() {
  try {
    const url = new URL(window.location.href);
    return url.hostname === 'www.w3schools.com' &&
      /^\/[^/]+\/[^/]+\.asp$/i.test(url.pathname) &&
      url.searchParams.has('filename');
  } catch (error) {
    return false;
  }
}

// ============================================================
// Generic prompt logger — shared by ChatGPT, Copilot, Gemini
// ============================================================
function createPromptLogger(siteName, siteUrl) {
  let lastLoggedPrompt = '';
  let lastLoggedAt = 0;

  async function logPrompt(prompt) {
    if (!prompt) {
      console.log(`[site-blocker] ${siteName} prompt logging skipped: empty prompt`);
      return;
    }
    const now = Date.now();
    if (prompt === lastLoggedPrompt && now - lastLoggedAt < 3000) {
      console.log(`[site-blocker] ${siteName} prompt logging skipped: duplicate`, { prompt });
      return;
    }
    lastLoggedPrompt = prompt;
    lastLoggedAt = now;
    try {
      console.log(`[site-blocker] ${siteName} prompt detected`, { prompt });
      const response = await chrome.runtime.sendMessage({
        type: 'logAiPrompt',
        prompt,
        siteName,
        siteUrl,
      });
      console.log(`[site-blocker] ${siteName} prompt logged`, response);
    } catch (error) {
      console.warn(`[site-blocker] failed to log ${siteName} prompt`, error);
    }
  }

  return { logPrompt };
}

// ============================================================
// ChatGPT — https://chatgpt.com
// ============================================================
function initChatGptPromptLogger() {
  if (window.location.origin !== 'https://chatgpt.com') return;
  if (window.__labPolicyChatGptLoggerInitialized) return;
  window.__labPolicyChatGptLoggerInitialized = true;

  const { logPrompt } = createPromptLogger('ChatGPT', 'https://chatgpt.com/');

  function readComposerPrompt() {
    return document.getElementById('prompt-textarea')?.innerText?.trim() || '';
  }

  function writeComposerPrompt(prompt) {
    const promptEl = document.getElementById('prompt-textarea');
    if (!promptEl) return;
    promptEl.innerHTML = '';
    const paragraph = document.createElement('p');
    paragraph.textContent = prompt;
    promptEl.appendChild(paragraph);
    promptEl.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: prompt,
    }));
  }

  function preparePromptForGrammarCheck() {
    const userPrompt = readComposerPrompt();
    if (!userPrompt) {
      console.log('[site-blocker] ChatGPT prompt injection skipped: empty prompt');
      return '';
    }
    if (userPrompt.startsWith(SPOKEN_GRAMMAR_PREFIX)) {
      console.log('[site-blocker] ChatGPT prompt already contains spoken grammar prefix');
      return userPrompt.slice(SPOKEN_GRAMMAR_PREFIX.length).trim();
    }
    const injectedPrompt = buildGrammarPrompt(userPrompt);
    writeComposerPrompt(injectedPrompt);
    console.log('[site-blocker] ChatGPT prompt injection applied', { originalPrompt: userPrompt });
    return userPrompt;
  }

  document.addEventListener('click', (event) => {
    const submitButton = event.target.closest('#composer-submit-button');
    if (!submitButton) return;
    console.log('[site-blocker] ChatGPT submit button clicked');
    logPrompt(preparePromptForGrammarCheck());
  }, true);

  document.addEventListener('keydown', (event) => {
    const promptEl = event.target.closest('#prompt-textarea');
    if (!promptEl) return;
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    console.log('[site-blocker] ChatGPT prompt submitted with Enter key');
    logPrompt(preparePromptForGrammarCheck());
  }, true);
}

// ============================================================
// Microsoft Copilot — https://copilot.microsoft.com
// ============================================================
function initCopilotPromptLogger() {
  if (!window.location.origin.includes('copilot.microsoft.com')) return;
  if (window.__labPolicyCopilotLoggerInitialized) return;
  window.__labPolicyCopilotLoggerInitialized = true;

  const { logPrompt } = createPromptLogger('Microsoft Copilot', 'https://copilot.microsoft.com/');

  // Copilot uses a textarea as its input box
  function getCopilotInput() {
    return (
      document.querySelector('textarea[placeholder="Message Copilot"]') ||
      document.querySelector('textarea#userInput') ||
      document.querySelector('textarea[data-testid="composer-input"]') ||
      document.querySelector('div[contenteditable="true"][aria-label*="opilot"]') ||
      document.querySelector('textarea')
    );
  }

  function readCopilotPrompt() {
    const el = getCopilotInput();
    return el?.value?.trim() || el?.innerText?.trim() || '';
  }

  function writeCopilotPrompt(prompt) {
    const el = getCopilotInput();
    if (!el) {
      console.warn('[site-blocker] Copilot input not found');
      return;
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set ||
                           Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(el, prompt);
      else el.value = prompt;
    } else {
      el.innerText = prompt;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function prepareAndLog() {
    const userPrompt = readCopilotPrompt();
    if (!userPrompt) {
      console.log('[site-blocker] Copilot prompt empty, skipping');
      return;
    }
    if (!userPrompt.startsWith(SPOKEN_GRAMMAR_PREFIX)) {
      writeCopilotPrompt(buildGrammarPrompt(userPrompt));
      console.log('[site-blocker] Copilot grammar prefix injected');
    }
    logPrompt(userPrompt);
  }

  // Submit button click
  document.addEventListener('click', (event) => {
    const btn = event.target.closest(
      'button[aria-label="Submit message"], ' +
      'button[aria-label="Send"], ' +
      'button[aria-label="Send message"], ' +
      'button[type="submit"]'
    );
    if (!btn) return;
    console.log('[site-blocker] Copilot submit button clicked');
    prepareAndLog();
  }, true);

  // Enter key in textarea
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const input = getCopilotInput();
    if (!input || event.target !== input) return;
    console.log('[site-blocker] Copilot prompt submitted with Enter key');
    prepareAndLog();
  }, true);
}

// ============================================================
// Google Gemini — https://gemini.google.com
// ============================================================
function initGeminiPromptLogger() {
  if (!window.location.origin.includes('gemini.google.com')) return;
  if (window.__labPolicyGeminiLoggerInitialized) return;
  window.__labPolicyGeminiLoggerInitialized = true;

  const { logPrompt } = createPromptLogger('Google Gemini', 'https://gemini.google.com/app');

  // Gemini's input is inside <rich-textarea> as a contenteditable div
  function getGeminiInput() {
    return (
      document.querySelector('rich-textarea .ql-editor') ||
      document.querySelector('rich-textarea [contenteditable="true"]') ||
      document.querySelector('.ql-editor[contenteditable="true"]') ||
      document.querySelector('[data-placeholder][contenteditable="true"]')
    );
  }

  function readGeminiPrompt() {
    return getGeminiInput()?.innerText?.trim() || '';
  }

  function writeGeminiPrompt(text) {
    const inputEl = getGeminiInput();
    if (!inputEl) {
      console.warn('[site-blocker] Gemini input element not found');
      return;
    }
    // Clear and set new content
    inputEl.focus();
    inputEl.innerText = text;
    // Dispatch input event so Gemini's React/Angular picks up the change
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
  }

  function prepareAndLog() {
    const userPrompt = readGeminiPrompt();
    if (!userPrompt) {
      console.log('[site-blocker] Gemini prompt empty, skipping');
      return;
    }
    if (!userPrompt.startsWith(SPOKEN_GRAMMAR_PREFIX)) {
      writeGeminiPrompt(buildGrammarPrompt(userPrompt));
      console.log('[site-blocker] Gemini grammar prefix injected');
    }
    logPrompt(userPrompt);
  }

  // Submit button — Gemini uses a button inside .send-button-container or aria-label="Send message"
  document.addEventListener('click', (event) => {
    const btn = event.target.closest(
      'button[aria-label="Send message"], ' +
      'button[data-mat-icon-name="send"], ' +
      '.send-button, ' +
      'button.send-button'
    );
    if (!btn) return;
    console.log('[site-blocker] Gemini submit button clicked');
    prepareAndLog();
  }, true);

  // Enter key inside Gemini input
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const inputEl = getGeminiInput();
    if (!inputEl) return;
    // Check if the event came from inside the Gemini input
    if (!inputEl.contains(event.target) && event.target !== inputEl) return;
    console.log('[site-blocker] Gemini prompt submitted with Enter key');
    prepareAndLog();
  }, true);
}

// FCM notifications handler inside W3Schools sidebar
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'push_received') {
      const data = message.data;
      if (data.type === 'new_question') {
        handleNewQuestionPush(data);
      } else if (data.type === 'answer_notification') {
        handleAnswerNotificationPush(data);
      }
    }
  });
}

function handleNewQuestionPush(data) {
  const container = document.getElementById('incomingQuestionsList');
  if (!container) return;
  
  // Remove placeholder if present
  const placeholder = container.querySelector('div');
  if (placeholder && placeholder.textContent.includes('No incoming questions')) {
    container.innerHTML = '';
  }
  
  // Check if already exists in list
  if (container.querySelector(`[data-q-id="${data.questionId}"]`)) return;
  
  const item = document.createElement('div');
  item.dataset.qId = data.questionId;
  item.style.cssText = 'padding: 8px; background: #fdfefe; border: 1px solid #ebedef; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: background 0.2s; margin-bottom: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';
  item.onmouseover = () => { item.style.backgroundColor = '#f4f6f6'; };
  item.onmouseout = () => { item.style.backgroundColor = '#fdfefe'; };
  
  item.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <span style="font-weight: bold; color: #2c3e50;">Roll No. ${data.rollNumber}</span>
      <span style="font-size: 10px; color: #95a5a6;">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
    </div>
    <div style="font-weight: 500; color: #34495e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${data.title || 'Untitled'}</div>
  `;
  
  item.addEventListener('click', () => {
    window.open(chrome.runtime.getURL(`student_dashboard.html?focusQuestion=${encodeURIComponent(data.questionId)}`));
  });
  
  container.insertBefore(item, container.firstChild);
  
  // Limit list to 5 items
  while (container.children.length > 5) {
    container.removeChild(container.lastChild);
  }
}

async function handleAnswerNotificationPush(data) {
  const panel = document.getElementById('answerNotificationPanel');
  const meta = document.getElementById('answerPanelMeta');
  const desc = document.getElementById('answerPanelDesc');
  if (!panel || !meta || !desc) return;
  
  console.log('[Content] Answer push received, fetching details for:', data.questionId);
  
  meta.textContent = `Roll No. ${data.solverRollNumber} answered your question!`;
  desc.textContent = 'Loading response details...';
  panel.style.display = 'flex';
  
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'fetchQuestionResponses', questionId: data.questionId }, resolve);
    });
    
    if (res && res.success && res.responses) {
      // Find the solver's response
      const reply = res.responses.find(r => String(r.authorId) === String(data.solverRollNumber));
      if (reply) {
        desc.textContent = reply.explanation || '(No explanation provided)';
        // Set code variable in parent scope
        activeAnswerCode = reply.correctedCode || '';
      } else {
        desc.textContent = 'Reply details could not be found.';
        activeAnswerCode = '';
      }
    } else {
      desc.textContent = 'Failed to load reply description.';
      activeAnswerCode = '';
    }
  } catch (err) {
    console.error('[Content] Error fetching reply details:', err);
    desc.textContent = 'Error loading reply details.';
    activeAnswerCode = '';
  }
}

function copyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Ensure it is completely hidden from view but selectable
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    console.log('[Content] Copied code successfully to clipboard.');
  } catch (err) {
    console.error('[Content] Failed to copy code:', err);
  }
  document.body.removeChild(textarea);
}
// ============================================================
// Inactivity Auto-Logout Tracker
// ============================================================
(function initInactivityTracker() {
  let lastHeartbeatTime = 0;
  function sendActivityHeartbeat() {
    const now = Date.now();
    if (now - lastHeartbeatTime > 2000) {
      lastHeartbeatTime = now;
      chrome.runtime.sendMessage({ type: 'userActivity' }).catch(() => {});
    }
  }

  const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
  events.forEach(event => {
    window.addEventListener(event, sendActivityHeartbeat, { passive: true });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'autoLoggedOut') {
      window.location.reload();
    }
  });
})();
