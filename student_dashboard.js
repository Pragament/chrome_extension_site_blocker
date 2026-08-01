// ==========================================
// Safe Environment and Selector Setup
// ==========================================
if (typeof $ === 'undefined') {
  window.$ = (id) => {
    const el = document.getElementById(id);
    if (!el) {
      console.error(`[DOM Error] Element with ID "${id}" was not found in the document.`);
    }
    return el;
  };
} else {
  // Wrap existing $ to add console logging on missing elements
  const originalSelector = window.$;
  window.$ = (id) => {
    const el = originalSelector(id);
    if (!el) {
      console.error(`[DOM Error] Element with ID "${id}" was not found in the document.`);
    }
    return el;
  };
}

if (typeof setHidden === 'undefined') {
  window.setHidden = (el, hidden) => {
    if (el) {
      el.classList[hidden ? 'add' : 'remove']('hidden');
    } else {
      console.warn(`[setHidden Warning] Attempted to set visibility on a null/undefined element.`);
    }
  };
}

function safeAddListener(id, eventName, callback) {
  const el = $(id);
  if (!el) {
    console.error(`[Listeners Error] Element with ID "${id}" was not found in the DOM. Cannot attach "${eventName}" event.`);
    return;
  }
  el.addEventListener(eventName, (e) => {
    console.log(`[Event Log] Event "${eventName}" triggered on element: "${id}"`);
    callback(e);
  });
  console.log(`[Listeners Success] Attached "${eventName}" listener to element "${id}".`);
}

// ==========================================
// Student Collaboration Dashboard Logic
// ==========================================
const navStack = [];
let classQuestionsOffset = 0;
const classQuestionsLimit = 10;
let myQuestionsOffset = 0;
const myQuestionsLimit = 10;

let currentSolvingQuestion = null;
let currentViewerQuestion = null;
let currentViewerResponse = null;

const SCREENS = [
  "homeScreen",
  "classQuestionsScreen",
  "solvingWorkspaceScreen",
  "myQuestionsScreen",
  "viewAnswersScreen",
  "answerViewerScreen"
];

function pushScreen(screenId) {
  let activeScreen = null;
  SCREENS.forEach(s => {
    const el = $(s);
    if (el && !el.classList.contains("hidden")) {
      activeScreen = s;
    }
  });
  
  console.log(`[Navigation] pushScreen called. Current Screen: "${activeScreen || 'none'}", Next Screen: "${screenId}"`);
  
  if (activeScreen && activeScreen !== screenId) {
    navStack.push(activeScreen);
  }
  
  console.log(`[Navigation] Navigation Stack after push:`, JSON.stringify(navStack));
  
  SCREENS.forEach(s => {
    const el = $(s);
    if (el) setHidden(el, true);
  });
  
  setHidden($(screenId), false);
}

function popScreen() {
  console.log(`[Navigation] popScreen called. Navigation Stack before pop:`, JSON.stringify(navStack));
  
  if (navStack.length > 0) {
    const previousScreen = navStack.pop();
    console.log(`[Navigation] Popped screen: "${previousScreen}"`);
    
    SCREENS.forEach(s => {
      const el = $(s);
      if (el) setHidden(el, true);
    });
    setHidden($(previousScreen), false);
    
    // Refresh list data depending on the screen we returned to
    if (previousScreen === "classQuestionsScreen") {
      loadClassQuestions(false);
    } else if (previousScreen === "myQuestionsScreen") {
      loadMyQuestions(false);
    } else if (previousScreen === "viewAnswersScreen") {
      if (currentViewerQuestion) {
        viewQuestionAnswers(currentViewerQuestion);
      }
    }
  } else {
    console.log("[Navigation] Stack empty. Redirecting to homeScreen.");
    pushScreen("homeScreen");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function diffLines(oldLines, newLines) {
  const matrix = Array(oldLines.length + 1).fill(null).map(() => Array(newLines.length + 1).fill(0));
  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }
  
  const diff = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: 'unchanged', value: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      diff.unshift({ type: 'added', value: newLines[j - 1] });
      j--;
    } else {
      diff.unshift({ type: 'removed', value: oldLines[i - 1] });
      i--;
    }
  }
  return diff;
}

async function loadClassQuestions(append = false) {
  console.log(`[Firestore Query] loadClassQuestions called (append=${append})`);
  const { studentInfo } = await chrome.storage.local.get("studentInfo");
  console.log("[Firestore Query] Retrieved studentInfo from storage for Class Questions:", studentInfo);
  if (!studentInfo || !studentInfo.classCode) {
    console.error("[Firestore Query Error] studentInfo or classCode is missing in storage.");
    return;
  }
  
  if (!append) {
    classQuestionsOffset = 0;
    const listEl = $("classQuestionsList");
    if (listEl) listEl.innerHTML = "<p>Loading class questions...</p>";
    setHidden($("classQuestionsLoadMore"), true);
  }
  
  try {
    console.log("[Firestore Query] Sending message type 'fetchOpenQuestions' with classCode:", studentInfo.classCode);
    const response = await chrome.runtime.sendMessage({
      type: "fetchOpenQuestions",
      classCode: studentInfo.classCode,
      limit: classQuestionsLimit,
      offset: classQuestionsOffset
    });
    console.log("[Firestore Query] Received response for fetchOpenQuestions:", response);
    
    if (!append) {
      const listEl = $("classQuestionsList");
      if (listEl) listEl.innerHTML = "";
    } else {
      const listEl = $("classQuestionsList");
      if (listEl) {
        const tempLoading = listEl.querySelector(".loading-more-temp");
        if (tempLoading) tempLoading.remove();
      }
    }
    
    const questions = response?.questions || [];
    if (questions.length === 0 && !append) {
      const listEl = $("classQuestionsList");
      if (listEl) listEl.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No open questions in your class.</p>";
      return;
    }
    
    let displayedCount = 0;
    const loggedRolls = String(studentInfo.rollNumber || '').split('-').map(r => r.trim()).filter(Boolean);
    questions.forEach(q => {
      if (loggedRolls.includes(String(q.rollNumber).trim())) {
        return;
      }
      displayedCount++;
      const card = document.createElement("div");
      card.className = "question-card";
      
      const timeStr = q.createdTime ? new Date(q.createdTime).toLocaleString() : "Unknown Time";
      const repliesCount = Number(q.repliesCount || 0);
      
      card.innerHTML = `
        <h3>${escapeHtml(q.questionTitle || "Untitled")}</h3>
        <p>${escapeHtml(q.questionDescription || "No description provided.")}</p>
        <div class="card-meta">
          <span>Asked by: <strong>Roll ${escapeHtml(q.rollNumber || "Unknown")}</strong> | ${timeStr}</span>
          <div>
            <span style="margin-right: 10px; font-weight: bold; color: #34495e;">${repliesCount} ${repliesCount === 1 ? 'Answer' : 'Answers'}</span>
            <span class="badge open">Open</span>
          </div>
        </div>
        <button class="btn view-q-btn" style="margin-top: 10px; padding: 6px 12px; font-size: 13px;" data-id="${q.id}">View Question</button>
      `;
      
      card.querySelector(".view-q-btn").addEventListener("click", () => {
        console.log(`[Event Log] Clicked "View Question" for question ID: "${q.id}"`);
        openSolvingWorkspace(q);
      });
      
      const listEl = $("classQuestionsList");
      if (listEl) listEl.appendChild(card);
    });
    
    if (displayedCount === 0 && !append) {
      const listEl = $("classQuestionsList");
      if (listEl) listEl.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No open questions from other classmates in your class.</p>";
    }
    
    if (questions.length === classQuestionsLimit) {
      setHidden($("classQuestionsLoadMore"), false);
    } else {
      setHidden($("classQuestionsLoadMore"), true);
    }
  } catch (error) {
    console.error("[Firestore Query Error] Error loading class questions:", error);
    const listEl = $("classQuestionsList");
    if (listEl) listEl.innerHTML = "<p style='color: #e74c3c;'>Error loading questions.</p>";
  }
}

function openSolvingWorkspace(question) {
  console.log(`[Workspace] Opening Solving Workspace for: "${question.questionTitle}"`);
  currentSolvingQuestion = question;
  
  const titleEl = $("solvingQuestionTitle");
  const descEl = $("solvingQuestionDesc");
  const origViewer = $("originalCodeViewer");
  const corrEditor = $("correctedCodeEditor");
  const explEditor = $("answerExplanation");
  const statusEl = $("solvingStatus");
  const openEditorBtn = $("openOriginalEditorBtn");
  
  if (titleEl) titleEl.textContent = question.questionTitle || "Untitled";
  if (descEl) descEl.textContent = question.questionDescription || "";
  if (origViewer) origViewer.textContent = question.studentCode || "";
  if (corrEditor) corrEditor.value = question.studentCode || "";
  if (explEditor) explEditor.value = "";
  
  if (openEditorBtn) {
    if (question.editorUrl && question.editorUrl.trim()) {
      openEditorBtn.disabled = false;
      openEditorBtn.textContent = "🌐 Open Original Editor";
      openEditorBtn.style.backgroundColor = "#3498db";
    } else {
      openEditorBtn.disabled = true;
      openEditorBtn.textContent = "Original editor link unavailable";
      openEditorBtn.style.backgroundColor = "#bdc3c7";
    }
  }

  setHidden(statusEl, true);
  
  pushScreen("solvingWorkspaceScreen");
}

async function loadMyQuestions(append = false) {
  console.log(`[Firestore Query] loadMyQuestions called (append=${append})`);
  const { studentInfo } = await chrome.storage.local.get("studentInfo");
  console.log("[Firestore Query] Retrieved studentInfo from storage for My Questions:", studentInfo);
  if (!studentInfo || !studentInfo.classCode || !studentInfo.rollNumber) {
    console.error("[Firestore Query Error] studentInfo, classCode, or rollNumber is missing in storage.");
    return;
  }
  
  if (!append) {
    myQuestionsOffset = 0;
    const listEl = $("myQuestionsList");
    if (listEl) listEl.innerHTML = "<p>Loading my questions...</p>";
    setHidden($("myQuestionsLoadMore"), true);
  }
  
  try {
    console.log("[Firestore Query] Sending message type 'fetchMyQuestions' with classCode:", studentInfo.classCode, "and rollNumber:", studentInfo.rollNumber);
    const response = await chrome.runtime.sendMessage({
      type: "fetchMyQuestions",
      classCode: studentInfo.classCode,
      rollNumber: studentInfo.rollNumber,
      limit: myQuestionsLimit,
      offset: myQuestionsOffset
    });
    console.log("[Firestore Query] Received response for fetchMyQuestions:", response);
    
    let viewedAnswers = {};
    try {
      const stored = await chrome.storage.local.get('viewedAnswers');
      viewedAnswers = stored.viewedAnswers || {};
    } catch (err) {
      console.warn('[Dashboard] Failed to fetch viewedAnswers:', err);
    }
    
    if (!append) {
      const listEl = $("myQuestionsList");
      if (listEl) listEl.innerHTML = "";
    }
    
    const questions = response?.questions || [];
    if (questions.length === 0 && !append) {
      const listEl = $("myQuestionsList");
      if (listEl) listEl.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>You haven't asked any questions yet.</p>";
      return;
    }
    
    questions.forEach(q => {
      const card = document.createElement("div");
      card.className = "question-card";
      
      const timeStr = q.createdTime ? new Date(q.createdTime).toLocaleString() : "Unknown Time";
      const statusText = q.status || "Open";
      const badgeClass = statusText.toLowerCase() === "solved" ? "badge solved" : "badge open";
      const repliesCount = Number(q.repliesCount || 0);
      
      const viewedList = viewedAnswers[q.id] || [];
      const unreadCount = Math.max(0, repliesCount - viewedList.length);
      
      let badgeHtml = '';
      if (repliesCount > 0) {
        if (unreadCount > 0) {
          badgeHtml = `<span class="badge unread" style="background-color: #e74c3c; color: white; margin-left: 6px; font-weight: bold; border-radius: 4px; padding: 2px 6px; font-size: 11px; display: inline-block;">🔴 ${unreadCount} New ${unreadCount === 1 ? 'Answer' : 'Answers'}</span>`;
        } else {
          badgeHtml = `<span class="badge viewed" style="background-color: #2ecc71; color: white; margin-left: 6px; font-weight: bold; border-radius: 4px; padding: 2px 6px; font-size: 11px; display: inline-block;">✓ All Answers Viewed</span>`;
        }
      }
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <h3>${escapeHtml(q.questionTitle || "Untitled")}</h3>
          <div>
            <span class="${badgeClass}">${statusText}</span>
            ${badgeHtml}
          </div>
        </div>
        <p>${escapeHtml(q.questionDescription || "No description provided.")}</p>
        <div class="card-meta" style="margin-bottom: 10px;">
          <span>Asked by you | ${timeStr}</span>
          <span style="font-weight: bold; color: #34495e;">${repliesCount} ${repliesCount === 1 ? 'Answer' : 'Answers'}</span>
        </div>
        <button class="btn view-answers-btn" style="margin-top: 5px; padding: 6px 12px; font-size: 13px;">View Answers</button>
      `;
      
      card.querySelector(".view-answers-btn").addEventListener("click", () => {
        console.log(`[Event Log] Clicked "View Answers" for question ID: "${q.id}"`);
        // Find the first unread answer ID if there are any
        // We will fetch the responses in viewQuestionAnswers, so we pass null as highlight for manual click
        viewQuestionAnswers(q, null);
      });
      
      const listEl = $("myQuestionsList");
      if (listEl) listEl.appendChild(card);
    });
    
    if (questions.length === myQuestionsLimit) {
      setHidden($("myQuestionsLoadMore"), false);
    } else {
      setHidden($("myQuestionsLoadMore"), true);
    }
  } catch (error) {
    console.error("[Firestore Query Error] Error loading my questions:", error);
    const listEl = $("myQuestionsList");
    if (listEl) listEl.innerHTML = "<p style='color: #e74c3c;'>Error loading questions.</p>";
  }
}

async function markAnswerAsViewed(questionId, answerId) {
  try {
    const { viewedAnswers = {} } = await chrome.storage.local.get('viewedAnswers');
    if (!viewedAnswers[questionId]) {
      viewedAnswers[questionId] = [];
    }
    if (!viewedAnswers[questionId].includes(answerId)) {
      viewedAnswers[questionId].push(answerId);
      await chrome.storage.local.set({ viewedAnswers });
      console.log('[Dashboard] Persistent mark as viewed:', answerId);
      
      // Update badge count immediately on the main list in the background
      loadMyQuestions(false);
      
      // Update the specific list item in the DOM directly
      const listEl = $("myQuestionAnswersList");
      if (listEl) {
        const items = listEl.querySelectorAll('.response-item');
        items.forEach(item => {
          if (item.dataset.respId === String(answerId)) {
            const metaEl = item.querySelector('.response-meta');
            if (metaEl) {
              metaEl.style.cssText = '';
              metaEl.innerHTML = `Roll ${item.dataset.authorId} <span class="badge viewed-reply" style="color: #2ecc71; font-weight: bold; margin-left: 6px;">✓ Viewed</span>`;
            }
            item.style.cssText = 'border: 1px solid rgba(0, 0, 0, 0.08); background-color: #ffffff; border-radius: 8px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; transition: background-color 0.5s, border-color 0.5s;';
          }
        });
      }
    }
  } catch (err) {
    console.warn('[Dashboard] Failed to mark answer as viewed:', err);
  }
}

async function viewQuestionAnswers(question, highlightAnswerId = null) {
  console.log(`[Firestore Query] Fetching answers for question: "${question.id}" (highlight: "${highlightAnswerId || 'none'}")`);
  currentViewerQuestion = question;
  
  // Clear unread solutions badge for this question in local storage
  try {
    const { unreadSolutions = {} } = await chrome.storage.local.get('unreadSolutions');
    if (unreadSolutions[question.id]) {
      if (highlightAnswerId) {
        unreadSolutions[question.id] = unreadSolutions[question.id].filter(id => String(id) !== String(highlightAnswerId));
        if (unreadSolutions[question.id].length === 0) {
          delete unreadSolutions[question.id];
        }
      } else {
        delete unreadSolutions[question.id];
      }
      await chrome.storage.local.set({ unreadSolutions });
      console.log('[Dashboard] Updated unread solutions for question:', question.id, 'remaining:', unreadSolutions[question.id] || 'none');
      // Update badge count immediately
      loadMyQuestions(false);
    }
  } catch (err) {
    console.warn('[Dashboard] Failed to clear unreadSolutions badge:', err);
  }
  
  const titleEl = $("myQuestionAnswersTitle");
  if (titleEl) titleEl.textContent = "Answers to: " + (question.questionTitle || "Untitled");
  
  pushScreen("viewAnswersScreen");
  const listEl = $("myQuestionAnswersList");
  if (listEl) listEl.innerHTML = "<p>Loading answers...</p>";
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: "fetchQuestionResponses",
      questionId: question.id,
      limit: 10,
      offset: 0
    });
    
    if (listEl) listEl.innerHTML = "";
    const responses = response?.responses || [];
    if (responses.length === 0) {
      if (listEl) listEl.innerHTML = "<p style='color: #7f8c8d; font-style: italic;'>No answers submitted yet.</p>";
      return;
    }
    
    // Fetch viewed answers dictionary from storage
    const { viewedAnswers = {} } = await chrome.storage.local.get('viewedAnswers');
    const viewedList = viewedAnswers[question.id] || [];
    
    responses.forEach(resp => {
      const item = document.createElement("div");
      item.className = "response-item";
      item.dataset.respId = resp.id;
      item.dataset.authorId = resp.authorId;
      
      const isHighlighted = highlightAnswerId && String(resp.id) === String(highlightAnswerId);
      const isViewed = viewedList.includes(resp.id);
      
      if (isHighlighted) {
        markAnswerAsViewed(question.id, resp.id);
        item.style.cssText = 'border: 2px solid #e74c3c; background-color: #fdf2f2; box-shadow: 0 0 10px rgba(231, 76, 60, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; transition: background-color 1s ease, border-color 1s ease, box-shadow 1s ease;';
        
        // Fade back to normal style after 3 seconds
        setTimeout(() => {
          item.style.backgroundColor = '#ffffff';
          item.style.borderColor = 'rgba(0, 0, 0, 0.08)';
          item.style.boxShadow = 'none';
        }, 3000);
      } else if (!isViewed) {
        item.style.cssText = 'border: 2px solid #3498db; background-color: #eef7fc; border-radius: 8px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
      } else {
        item.style.cssText = 'border: 1px solid rgba(0, 0, 0, 0.08); background-color: #ffffff; border-radius: 8px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
      }
      
      item.innerHTML = `
        <span class="response-meta" style="${isHighlighted ? 'font-weight: bold; color: #c0392b;' : ''}">
          Roll ${resp.authorId}
          ${isHighlighted ? ' 🔴 (New Solution)' : (!isViewed ? ' <span class="badge new-reply" style="background-color: #3498db; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 6px; display: inline-block;">🔵 NEW</span>' : ' <span class="badge viewed-reply" style="color: #2ecc71; font-weight: bold; margin-left: 6px;">✓ Viewed</span>')}
        </span>
        <button class="btn view-resp-btn" style="padding: 6px 12px; font-size: 12px;">View Answer</button>
      `;
      
      item.querySelector(".view-resp-btn").addEventListener("click", () => {
        console.log(`[Event Log] Clicked "View Answer" for response ID: "${resp.id}" by helper Roll ${resp.authorId}`);
        markAnswerAsViewed(question.id, resp.id);
        openAnswerViewerWorkspace(question, resp);
      });
      
      if (listEl) listEl.appendChild(item);
      
      if (isHighlighted) {
        setTimeout(() => {
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
        // Automatically navigate directly to the detailed workspace code viewer
        setTimeout(() => {
          openAnswerViewerWorkspace(question, resp);
        }, 300);
      }
    });
  } catch (error) {
    console.error("[Firestore Query Error] Error loading responses:", error);
    if (listEl) listEl.innerHTML = "<p style='color: #e74c3c;'>Error loading answers.</p>";
  }
}

function openAnswerViewerWorkspace(question, resp) {
  console.log(`[Workspace] Opening Answer Viewer for question: "${question.id}", response: "${resp.id}"`);
  currentViewerQuestion = question;
  currentViewerResponse = resp;
  
  const titleEl = $("viewerQuestionTitle");
  const descEl = $("viewerQuestionDesc");
  const askedEl = $("viewAskedBy");
  const answeredEl = $("viewAnsweredBy");
  const statusEl = $("viewStatusDetails");
  const origEl = $("viewOriginalCode");
  const corrEl = $("viewCorrectedCode");
  const explEl = $("viewExplanation");
  const acceptBtn = $("acceptAnswerBtn");
  const viewerStatusEl = $("viewerStatus");
  
  if (titleEl) titleEl.textContent = question.questionTitle || "Untitled";
  if (descEl) descEl.textContent = question.questionDescription || "";
  if (askedEl) askedEl.textContent = "Roll " + (question.rollNumber || "Unknown");
  if (answeredEl) answeredEl.textContent = resp.authorName || ("Roll " + resp.authorId);
  if (statusEl) statusEl.textContent = question.status || "Open";
  if (origEl) origEl.textContent = question.studentCode || "";
  if (corrEl) corrEl.textContent = resp.correctedCode || "";
  if (explEl) explEl.textContent = resp.explanation || "No explanation provided.";
  
  const originalLines = (question.studentCode || "").split("\n");
  const correctedLines = (resp.correctedCode || "").split("\n");
  
  const diffs = diffLines(originalLines, correctedLines);
  const diffContainer = $("viewDiffContainer");
  if (diffContainer) {
    diffContainer.innerHTML = "";
    diffs.forEach(line => {
      const div = document.createElement("div");
      if (line.type === "added") {
        div.className = "diff-line added";
        div.textContent = "+ " + line.value;
      } else if (line.type === "removed") {
        div.className = "diff-line removed";
        div.textContent = "- " + line.value;
      } else {
        div.className = "diff-line unchanged";
        div.textContent = "  " + line.value;
      }
      diffContainer.appendChild(div);
    });
  }
  
  if (question.status === "Open") {
    setHidden(acceptBtn, false);
  } else {
    setHidden(acceptBtn, true);
  }
  
  setHidden(viewerStatusEl, true);
  pushScreen("answerViewerScreen");
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

async function copyTextToClipboard(text) {
  const cleanedText = cleanCodeString(text);
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(cleanedText);
      return true;
    } catch (e) {
      console.warn("[Clipboard] API writeText failed, trying fallback...", e);
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = cleanedText;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const success = document.execCommand("copy");
    document.body.removeChild(ta);
    return success;
  } catch (err) {
    console.error("[Clipboard] Fallback copy failed:", err);
    return false;
  }
}

// ==========================================
// Initialization and Listeners Attachment
// ==========================================

function initStudentDashboardListeners() {
  console.log("[Init] initStudentDashboardListeners called.");

  safeAddListener("copyCorrectedCodeBtn", "click", async () => {
    const corrEl = $("viewCorrectedCode");
    if (!corrEl) {
      console.warn("[Clipboard] Corrected code element not found.");
      return;
    }
    const code = corrEl.textContent || "";
    if (!code) {
      console.warn("[Clipboard] No corrected code text available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      console.log("[Clipboard] Corrected code copied successfully.");
      const btn = $("copyCorrectedCodeBtn");
      if (btn) {
        btn.textContent = "✓ Copied";
        setTimeout(() => {
          btn.textContent = "📋 Copy";
        }, 2000);
      }
    } catch (err) {
      console.error("[Clipboard] Failed to copy corrected code:", err);
      alert("Failed to copy code.");
    }
  });

  safeAddListener("openOriginalEditorBtn", "click", () => {
    if (currentSolvingQuestion && currentSolvingQuestion.editorUrl) {
      console.log(`[Event Log] Opening original editor URL in a new tab: ${currentSolvingQuestion.editorUrl}`);
      window.open(currentSolvingQuestion.editorUrl, "_blank");
    }
  });

  safeAddListener("copyCodeIcon", "click", async () => {
    if (!currentSolvingQuestion || !currentSolvingQuestion.studentCode) {
      console.warn("[Clipboard] No code available to copy.");
      return;
    }
    
    console.log("[Event Log] Copying original code to clipboard...");
    const success = await copyTextToClipboard(currentSolvingQuestion.studentCode);
    
    if (success) {
      const copyIcon = $("copyCodeIcon");
      const successMsg = $("copySuccessMsg");
      
      if (copyIcon) copyIcon.textContent = "✔";
      if (successMsg) setHidden(successMsg, false);
      
      setTimeout(() => {
        if (copyIcon) copyIcon.textContent = "📋";
        if (successMsg) setHidden(successMsg, true);
      }, 1000);
    } else {
      console.error("[Clipboard] Copy operation failed.");
    }
  });
  
  safeAddListener("goToClassQuestionsBtn", "click", () => {
    pushScreen("classQuestionsScreen");
    loadClassQuestions(false);
  });

  safeAddListener("goToMyQuestionsBtn", "click", () => {
    pushScreen("myQuestionsScreen");
    loadMyQuestions(false);
  });

  safeAddListener("backToHomeBtn1", "click", () => popScreen());
  safeAddListener("backToHomeBtn2", "click", () => popScreen());
  
  safeAddListener("refreshClassQuestionsBtn", "click", () => loadClassQuestions(false));
  safeAddListener("refreshMyQuestionsBtn", "click", () => loadMyQuestions(false));
  
  safeAddListener("backToMyQuestionsBtn", "click", () => popScreen());
  safeAddListener("cancelAnswerBtn", "click", () => popScreen());
  safeAddListener("cancelAnswerBtn2", "click", () => popScreen());
  safeAddListener("backToAnswersListBtn", "click", () => popScreen());
  safeAddListener("backToAnswersListBtn2", "click", () => popScreen());

  safeAddListener("classQuestionsLoadMore", "click", () => {
    classQuestionsOffset += classQuestionsLimit;
    const temp = document.createElement("div");
    temp.className = "loading-more-temp";
    temp.innerHTML = "<p style='text-align: center; color: #7f8c8d; font-style: italic;'>Loading more...</p>";
    const listEl = $("classQuestionsList");
    if (listEl) listEl.appendChild(temp);
    loadClassQuestions(true);
  });
  
  safeAddListener("myQuestionsLoadMore", "click", () => {
    myQuestionsOffset += myQuestionsLimit;
    loadMyQuestions(true);
  });
  
  safeAddListener("dashBackToRoles", "click", () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("referrer") === "options") {
      window.location.href = chrome.runtime.getURL("options.html");
    } else {
      window.close();
    }
  });
  
  safeAddListener("submitAnswerBtn", "click", async () => {
    const editor = $("correctedCodeEditor");
    const explanationText = $("answerExplanation");
    const correctedCode = editor ? editor.value : "";
    const explanation = explanationText ? explanationText.value.trim() : "";
    
    if (!correctedCode.trim() || !explanation.trim()) {
      alert("Please provide both the corrected code and explanation.");
      return;
    }
    
    const submitBtn = $("submitAnswerBtn");
    const cancelBtn = $("cancelAnswerBtn");
    const cancelBtn2 = $("cancelAnswerBtn2");
    
    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (cancelBtn2) cancelBtn2.disabled = true;
    
    const statusEl = $("solvingStatus");
    if (statusEl) {
      statusEl.textContent = "Submitting answer...";
      setHidden(statusEl, false);
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: "submitAnswer",
        questionId: currentSolvingQuestion.id,
        correctedCode,
        explanation
      });
      
      if (response && response.success) {
        if (statusEl) statusEl.textContent = "Answer submitted successfully!";
        setTimeout(() => {
          popScreen();
        }, 1500);
      } else {
        if (statusEl) statusEl.textContent = response?.message || "Failed to submit answer.";
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = "Error submitting answer.";
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (cancelBtn2) cancelBtn2.disabled = false;
    }
  });
  
  safeAddListener("acceptAnswerBtn", "click", async () => {
    const acceptBtn = $("acceptAnswerBtn");
    const backBtn = $("backToAnswersListBtn");
    const backBtn2 = $("backToAnswersListBtn2");
    
    if (acceptBtn) acceptBtn.disabled = true;
    if (backBtn) backBtn.disabled = true;
    if (backBtn2) backBtn2.disabled = true;
    
    const viewerStatusEl = $("viewerStatus");
    if (viewerStatusEl) {
      viewerStatusEl.textContent = "Accepting answer and awarding points...";
      setHidden(viewerStatusEl, false);
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: "acceptAnswer",
        questionId: currentViewerQuestion.id,
        responseId: currentViewerResponse.id,
        helperRollNumber: currentViewerResponse.authorId
      });
      
      if (response && response.success) {
        if (viewerStatusEl) viewerStatusEl.textContent = "Answer accepted! Helper awarded points.";
        setTimeout(() => {
          popScreen();
        }, 1500);
      } else {
        if (viewerStatusEl) viewerStatusEl.textContent = response?.message || "Failed to accept answer.";
        if (acceptBtn) acceptBtn.disabled = false;
        if (backBtn) backBtn.disabled = false;
        if (backBtn2) backBtn2.disabled = false;
      }
    } catch (e) {
      if (viewerStatusEl) viewerStatusEl.textContent = "Error accepting answer.";
      if (acceptBtn) acceptBtn.disabled = false;
      if (backBtn) backBtn.disabled = false;
      if (backBtn2) backBtn2.disabled = false;
    }
  });
}

function attachEventListeners() {
  console.log("[Init] attachEventListeners called.");
  initStudentDashboardListeners();
}

async function loadStudentInfo() {
  console.log("[Init] loadStudentInfo called.");
  try {
    const data = await chrome.storage.local.get("studentInfo");
    console.log("[Init] Loaded studentInfo data:", JSON.stringify(data));
    let studentInfo = data.studentInfo;
    
    if (studentInfo && studentInfo.classCode && studentInfo.rollNumber) {
      const infoEl = $("dashStudentInfo");
      if (infoEl) {
        const displayClass = studentInfo.className || studentInfo.classCode;
        infoEl.textContent = `Class: ${displayClass} | Roll: ${studentInfo.rollNumber}`;
      }

      // Asynchronously load the updated class name from background (Firestore)
      try {
        const response = await chrome.runtime.sendMessage({
          type: "refreshWishlist",
          classCode: studentInfo.classCode
        });
        if (response && response.success && response.className) {
          studentInfo.className = response.className;
          await chrome.storage.local.set({ studentInfo });
          if (infoEl) {
            infoEl.textContent = `Class: ${response.className} | Roll: ${studentInfo.rollNumber}`;
          }
        }
      } catch (err) {
        console.warn("[Init] Failed to refresh class details in background:", err);
      }
      
      // Set initial screen based on tab query parameter
      const urlParams = new URLSearchParams(window.location.search);
      const focusQuestionId = urlParams.get("focusQuestion");
      const focusAnswerId = urlParams.get("focusAnswer");
      const targetTab = urlParams.get("tab");
      console.log(`[Init] targetTab query param is: "${targetTab || 'none'}" | focusQuestion is: "${focusQuestionId || 'none'}" | focusAnswer is: "${focusAnswerId || 'none'}"`);
      
      if (focusQuestionId) {
        chrome.runtime.sendMessage({
          type: "fetchSingleQuestion",
          questionId: focusQuestionId
        }, (response) => {
          if (response && response.success && response.question) {
            const q = response.question;
            const rollNumbers = String(studentInfo.rollNumber || '').split('-').map(r => r.trim());
            if (rollNumbers.includes(String(q.rollNumber).trim())) {
              // Anchor to My Questions parent screen so back button works correctly
              pushScreen("myQuestionsScreen");
              // Open my question replies list view
              viewQuestionAnswers(q, focusAnswerId);
            } else {
              // Anchor to Class Questions parent screen
              pushScreen("classQuestionsScreen");
              // Open class question workspace solver view
              openSolvingWorkspace(q);
            }
          } else {
            console.error("[Init] Failed to fetch focused question details:", focusQuestionId);
          }
        });
      } else if (targetTab === "classQuestions") {
        pushScreen("classQuestionsScreen");
        loadClassQuestions(false);
      } else if (targetTab === "myQuestions") {
        pushScreen("myQuestionsScreen");
        loadMyQuestions(false);
      } else {
        pushScreen("homeScreen");
      }
    } else {
      console.warn("[Init] Student credentials missing. Redirecting to homepage.html.");
      alert("Please configure your Class Code and Roll Number first.");
      window.location.href = chrome.runtime.getURL("homepage.html");
    }
  } catch (err) {
    console.error("[Init] Error in loadStudentInfo:", err);
  }
}

async function initializeDashboard() {
  console.log("[Init] initializeDashboard called.");
  await loadStudentInfo();
  console.log('[FCM] Dashboard initial setup deferred. Registration must happen only on Update click.');
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[DOMContentLoaded] Document loaded.");
  attachEventListeners();
  await initializeDashboard();
});

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
    } else if (message && message.type === 'navigate_to_question') {
      console.log('[Dashboard Router] Dynamic navigation requested:', message);
      const focusQuestionId = message.focusQuestion;
      const focusAnswerId = message.focusAnswer;
      if (focusQuestionId) {
        chrome.storage.local.get("studentInfo", (data) => {
          const studentInfo = data.studentInfo || {};
          chrome.runtime.sendMessage({
            type: "fetchSingleQuestion",
            questionId: focusQuestionId
          }, (response) => {
            if (response && response.success && response.question) {
              const q = response.question;
              const rollNumbers = String(studentInfo.rollNumber || '').split('-').map(r => r.trim());
              if (rollNumbers.includes(String(q.rollNumber).trim())) {
                pushScreen("myQuestionsScreen");
                viewQuestionAnswers(q, focusAnswerId);
              } else {
                pushScreen("classQuestionsScreen");
                openSolvingWorkspace(q);
              }
            } else {
              console.error("[Dashboard Router] Failed to fetch focused question details:", focusQuestionId);
            }
          });
        });
      }
    }
  });
})();
