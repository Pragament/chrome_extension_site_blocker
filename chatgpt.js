if (window.location.origin.startsWith('https://chatgpt.com') && !window.__labPolicyChatGptLoggerInitialized) {
  window.__labPolicyChatGptLoggerInitialized = true;

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

  let lastLoggedPrompt = '';
  let lastLoggedAt = 0;

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

  function buildGrammarPrompt(userPrompt) {
    return `${SPOKEN_GRAMMAR_PREFIX}\n${userPrompt}`;
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
    console.log('[site-blocker] ChatGPT prompt injection applied', {
      originalPrompt: userPrompt,
      injectedPrompt,
    });
    return userPrompt;
  }

  async function logPrompt(prompt) {
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
