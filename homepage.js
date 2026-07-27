document.addEventListener('DOMContentLoaded', () => {
    const ul = document.getElementById('whitelist-ul');
    const iframe = document.getElementById('quiz-iframe');
    const classSelect = document.getElementById('homepage-class-select');
    const classCodeInput = document.getElementById('homepage-class-code-input');
    const admissionInput = document.getElementById('homepage-admission-input');
    const guardianPhoneInput = document.getElementById('homepage-guardian-phone-input');
    const loginBtn = document.getElementById('homepage-login-btn');
    const logoutAllBtn = document.getElementById('homepage-logout-all-btn');

    // Helper to update iframe URL
    function updateIframeSrc(info) {
        if (iframe) {
            let baseSrc = iframe.getAttribute('data-src');
            if (baseSrc) {
                let params = new URLSearchParams();
                if (info) {
                    if (info.rollNumber) params.append('roll', info.rollNumber);
                    const gradeVal = info.grade || info.classCode;
                    if (gradeVal) params.append('grade', gradeVal);
                    if (info.admissionNumber) params.append('admission', info.admissionNumber);
                    if (info.guardianPhone) params.append('phone', info.guardianPhone);
                }
                const queryString = params.toString();
                if (queryString) {
                    const sep = baseSrc.includes('?') ? '&' : '?';
                    iframe.src = `${baseSrc}${sep}${queryString}`;
                } else {
                    iframe.src = baseSrc;
                }
            }
        }
    }

    // Function to save student info to storage
    function saveStudentInfo(updates) {
        if (!chrome || !chrome.storage) {
            const savedStudentInfoStr = localStorage.getItem('studentInfo');
            const currentInfo = savedStudentInfoStr ? JSON.parse(savedStudentInfoStr) : {};
            Object.assign(currentInfo, updates);
            localStorage.setItem('studentInfo', JSON.stringify(currentInfo));
            updateIframeSrc(currentInfo);
            return;
        }
        chrome.storage.local.get(['studentInfo'], (result) => {
            const currentInfo = result.studentInfo || {};
            Object.assign(currentInfo, updates);
            chrome.storage.local.set({ studentInfo: currentInfo }, () => {
                updateIframeSrc(currentInfo);
                // If classCode changed, we need to refresh wishlist and reload
                if (updates.classCode !== undefined) {
                    chrome.runtime.sendMessage({ type: 'refreshWishlist', classCode: updates.classCode }, () => {
                        window.location.reload();
                    });
                }
            });
        });
    }

    function updateCombinedStudentInfo(studentInfo) {
        if (!studentInfo.loggedStudents || !Array.isArray(studentInfo.loggedStudents)) {
            studentInfo.loggedStudents = [];
        }
        
        if (studentInfo.loggedStudents.length === 0) {
            studentInfo.studentName = "";
            studentInfo.admissionNumber = "";
            studentInfo.guardianPhone = "";
            studentInfo.rollNumber = "";
        } else {
            studentInfo.studentName = studentInfo.loggedStudents.map(s => s.studentName).join(" & ");
            studentInfo.admissionNumber = studentInfo.loggedStudents.map(s => s.admissionNumber).join("-");
            studentInfo.guardianPhone = studentInfo.loggedStudents.map(s => s.guardianPhone).join("-");
            studentInfo.rollNumber = studentInfo.loggedStudents.map(s => s.rollNumber).filter(Boolean).join("-");
        }
        return studentInfo;
    }

    function renderLoggedStudents(studentInfo) {
        const badgesContainer = document.getElementById('homepage-student-badges');
        const greetingEl = document.getElementById('homepage-student-greeting');
        const logoutAllEl = document.getElementById('homepage-logout-all-btn');
        const infoEl = document.getElementById('homepage-student-info');
        const infoContainer = document.getElementById('homepage-student-info-container');
        
        if (!studentInfo || !studentInfo.loggedStudents || !Array.isArray(studentInfo.loggedStudents) || studentInfo.loggedStudents.length === 0) {
            if (badgesContainer) badgesContainer.innerHTML = '';
            if (greetingEl) {
                greetingEl.style.display = 'none';
            }
            if (logoutAllEl) {
                logoutAllEl.style.display = 'none';
            }
            if (infoContainer) {
                if (studentInfo && studentInfo.classCode) {
                    infoContainer.style.display = 'flex';
                    if (infoEl) infoEl.textContent = `Class: ${studentInfo.className || studentInfo.classCode}`;
                } else {
                    infoContainer.style.display = 'none';
                }
            }
            return;
        }

        if (infoContainer) infoContainer.style.display = 'flex';
        if (infoEl && studentInfo.classCode) {
            infoEl.textContent = `Class: ${studentInfo.className || studentInfo.classCode}`;
        }
        
        if (greetingEl) {
            greetingEl.style.display = 'none';
        }
        
        if (logoutAllEl) {
            logoutAllEl.style.display = 'none';
        }
        
        if (badgesContainer) {
            badgesContainer.innerHTML = studentInfo.loggedStudents.map(student => {
                return `
                    <span class="student-badge-info" style="background: #f0fdf4; border-color: #22c55e; color: #15803d; padding: 6px 16px; display: inline-flex; align-items: center; gap: 12px; border-radius: 30px; border: 2px solid #22c55e; font-weight: 700; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <span>${student.studentName}</span>
                        <button class="remove-student-btn" data-admission="${student.admissionNumber}" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 15px; cursor: pointer; font-size: 0.75rem; font-weight: bold; transition: background-color 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); line-height: 1;">Logout</button>
                    </span>
                `;
            }).join('');
            
            badgesContainer.querySelectorAll('.remove-student-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const adm = e.target.getAttribute('data-admission');
                    removeStudent(adm);
                });
            });
        }
    }

    function removeStudent(admissionNumber) {
        if (!chrome || !chrome.storage) {
            const savedStudentInfoStr = localStorage.getItem('studentInfo');
            let studentInfo = savedStudentInfoStr ? JSON.parse(savedStudentInfoStr) : {};
            if (studentInfo.loggedStudents) {
                studentInfo.loggedStudents = studentInfo.loggedStudents.filter(s => s.admissionNumber !== admissionNumber);
                studentInfo = updateCombinedStudentInfo(studentInfo);
                localStorage.setItem('studentInfo', JSON.stringify(studentInfo));
                renderLoggedStudents(studentInfo);
                updateIframeSrc(studentInfo);
            }
            return;
        }
        chrome.storage.local.get(['studentInfo'], (res) => {
            let studentInfo = res.studentInfo || {};
            if (studentInfo.loggedStudents) {
                studentInfo.loggedStudents = studentInfo.loggedStudents.filter(s => s.admissionNumber !== admissionNumber);
                studentInfo = updateCombinedStudentInfo(studentInfo);
                chrome.storage.local.set({ studentInfo }, () => {
                    renderLoggedStudents(studentInfo);
                    updateIframeSrc(studentInfo);
                });
            }
        });
    }

    async function performLoginFlow() {
        const adm = admissionInput ? admissionInput.value.trim() : '';
        const ph = guardianPhoneInput ? guardianPhoneInput.value.trim() : '';
        const classCode = classCodeInput ? classCodeInput.value.trim() : '';
        const roll = adm;
        
        if (!adm || !ph) {
            alert('Please enter Admission Number and Guardian Phone.');
            return;
        }
        
        const errorEl = document.getElementById('homepage-student-error');
        if (errorEl) errorEl.style.display = 'none';
        
        let result = null;
        if (!chrome || !chrome.storage) {
            result = await verifyStudentDirectly(adm, ph, classCode);
        } else {
            try {
                result = await chrome.runtime.sendMessage({
                    type: 'verifyStudent',
                    admissionNo: adm,
                    phoneNumber: ph,
                    classCode: classCode
                });
            } catch (err) {
                console.error("Failed to query student via background:", err);
                result = { success: false, message: "Connection error" };
            }
        }
        
        if (result && result.success) {
            const studentName = result.name || "";
            const studentClass = result.class || "";
            
            const hintContainer = document.getElementById('homepage-phone-hint-container');
            if (hintContainer) hintContainer.style.display = 'none';

            if (!chrome || !chrome.storage) {
                const savedStudentInfoStr = localStorage.getItem('studentInfo');
                let studentInfo = savedStudentInfoStr ? JSON.parse(savedStudentInfoStr) : {};
                
                if (!studentInfo.loggedStudents) studentInfo.loggedStudents = [];
                if (studentInfo.loggedStudents.some(s => s.admissionNumber === adm)) {
                    alert('Student is already logged in.');
                    return;
                }
                
                studentInfo.loggedStudents.push({
                    studentName,
                    admissionNumber: adm,
                    guardianPhone: ph,
                    rollNumber: roll,
                    grade: studentClass
                });
                
                studentInfo = updateCombinedStudentInfo(studentInfo);
                if (studentClass) {
                    studentInfo.grade = studentClass;
                }
                
                localStorage.setItem('studentInfo', JSON.stringify(studentInfo));
                if (admissionInput) admissionInput.value = '';
                if (guardianPhoneInput) guardianPhoneInput.value = '';
                
                if (classSelect && studentClass) {
                    classSelect.value = studentClass;
                }
                
                renderLoggedStudents(studentInfo);
                updateIframeSrc(studentInfo);
            } else {
                chrome.storage.local.get(['studentInfo'], (res) => {
                    let studentInfo = res.studentInfo || {};
                    if (!studentInfo.loggedStudents) studentInfo.loggedStudents = [];
                    if (studentInfo.loggedStudents.some(s => s.admissionNumber === adm)) {
                        alert('Student is already logged in.');
                        return;
                    }
                    
                    studentInfo.loggedStudents.push({
                        studentName,
                        admissionNumber: adm,
                        guardianPhone: ph,
                        rollNumber: roll,
                        grade: studentClass
                    });
                    
                    studentInfo = updateCombinedStudentInfo(studentInfo);
                    if (studentClass) {
                        studentInfo.grade = studentClass;
                    }
                    
                    chrome.storage.local.set({ studentInfo }, () => {
                        if (admissionInput) admissionInput.value = '';
                        if (guardianPhoneInput) guardianPhoneInput.value = '';
                        
                        if (classSelect && studentClass) {
                            classSelect.value = studentClass;
                        }
                        
                        renderLoggedStudents(studentInfo);
                        updateIframeSrc(studentInfo);
                    });
                });
            }
        } else {
            if (errorEl) {
                errorEl.textContent = result?.message || 'Student not found';
                errorEl.style.display = 'inline-block';
            }
            if (result && result.hint) {
                const hintContainer = document.getElementById('homepage-phone-hint-container');
                const hintEl = document.getElementById('homepage-phone-hint');
                if (hintContainer && hintEl) {
                    hintEl.textContent = `Registered Phone: ${result.hint}`;
                    hintContainer.style.display = 'flex';
                }
            }
        }
    }
 
    function logoutAllStudents() {
        if (!chrome || !chrome.storage) {
            const savedStudentInfoStr = localStorage.getItem('studentInfo');
            let studentInfo = savedStudentInfoStr ? JSON.parse(savedStudentInfoStr) : {};
            studentInfo.loggedStudents = [];
            studentInfo = updateCombinedStudentInfo(studentInfo);
            localStorage.setItem('studentInfo', JSON.stringify(studentInfo));
            
            if (admissionInput) admissionInput.value = '';
            if (guardianPhoneInput) guardianPhoneInput.value = '';
            
            renderLoggedStudents(studentInfo);
            updateIframeSrc(studentInfo);
            return;
        }
        chrome.storage.local.get(['studentInfo'], (res) => {
            let studentInfo = res.studentInfo || {};
            studentInfo.loggedStudents = [];
            studentInfo = updateCombinedStudentInfo(studentInfo);
            chrome.storage.local.set({ studentInfo }, () => {
                if (admissionInput) admissionInput.value = '';
                if (guardianPhoneInput) guardianPhoneInput.value = '';
                
                renderLoggedStudents(studentInfo);
                updateIframeSrc(studentInfo);
            });
        });
    }
 
    // Always attach the event listener so it works even when testing locally
    if (classSelect) {
        classSelect.addEventListener('change', (e) => saveStudentInfo({ grade: e.target.value }));
    }
 
    if (loginBtn) {
        loginBtn.addEventListener('click', performLoginFlow);
    }
    if (logoutAllBtn) {
        logoutAllBtn.addEventListener('click', logoutAllStudents);
    }
 
    const triggerLoginOnEnter = (e) => {
        if (e.key === 'Enter') {
            performLoginFlow();
        }
    };
 
    if (admissionInput) {
        admissionInput.addEventListener('keydown', triggerLoginOnEnter);
        admissionInput.addEventListener('blur', updatePhoneHint);
        admissionInput.addEventListener('change', updatePhoneHint);
        admissionInput.addEventListener('input', updatePhoneHint);
    }
    if (guardianPhoneInput) {
        guardianPhoneInput.addEventListener('keydown', triggerLoginOnEnter);
    }
    if (classCodeInput) {
        classCodeInput.addEventListener('blur', updatePhoneHint);
        classCodeInput.addEventListener('change', updatePhoneHint);
    }

    if (classCodeInput) {
        classCodeInput.addEventListener('change', async (e) => {
            const code = e.target.value.trim();
            if (!code) return;
            
            if (!chrome || !chrome.storage) {
                const savedStudentInfoStr = localStorage.getItem('studentInfo');
                const currentInfo = savedStudentInfoStr ? JSON.parse(savedStudentInfoStr) : {};
                const oldCode = currentInfo.classCode || '';
                currentInfo.classCode = code;
                
                try {
                    const details = await fetchClassDetailsDirectly(code);
                    if (!details.found) {
                        alert('Class code was not found in Firestore.');
                        classCodeInput.value = oldCode;
                        return;
                    }
                    currentInfo.className = details.className || '';
                    localStorage.setItem('studentInfo', JSON.stringify(currentInfo));
                    localStorage.setItem('classWishlistCache', JSON.stringify({
                        classCode: code,
                        wishlist: details.wishlist,
                        className: details.className,
                        imageUrl: details.imageUrl,
                        timestamp: Date.now()
                    }));
                    window.location.reload();
                } catch (err) {
                    console.error("Local fetch error in change listener:", err);
                    alert('Error checking class code. Please try again.');
                    classCodeInput.value = oldCode;
                }
                return;
            }
            
            try {
                const refreshResponse = await chrome.runtime.sendMessage({ type: 'refreshWishlist', classCode: code });
                if (!refreshResponse?.success) {
                    alert(refreshResponse?.message || 'Class code was not found in Firestore.');
                    // Revert input value to cached class code
                    chrome.storage.local.get(['studentInfo'], (res) => {
                        classCodeInput.value = res.studentInfo?.classCode || '';
                    });
                    return;
                }
                
                // Save to local storage
                chrome.storage.local.get(['studentInfo'], (res) => {
                    const currentInfo = res.studentInfo || {};
                    currentInfo.classCode = code;
                    currentInfo.className = refreshResponse.className || '';
                    chrome.storage.local.set({ studentInfo: currentInfo }, () => {
                        window.location.reload();
                    });
                });
            } catch (err) {
                console.error("Error updating class code from homepage:", err);
            }
        });
    }

    // Fullscreen logic for the quiz
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn && iframe) {
        fullscreenBtn.addEventListener('click', () => {
            if (iframe.requestFullscreen) {
                iframe.requestFullscreen();
            } else if (iframe.webkitRequestFullscreen) { /* Safari */
                iframe.webkitRequestFullscreen();
            } else if (iframe.msRequestFullscreen) { /* IE11 */
                iframe.msRequestFullscreen();
            }
        });
    }

    async function fetchClassDetailsDirectly(classCode) {
        if (!classCode || !window.CONFIG || !window.CONFIG.FIREBASE) {
            return { found: false, wishlist: [], className: "", imageUrl: "" };
        }
        const apiKey = window.CONFIG.FIREBASE.apiKey;
        const projectId = window.CONFIG.FIREBASE.projectId;
        try {
            // Anonymous sign-in
            const authRes = await fetch(`${window.CONFIG.FIREBASE.rest.identityToolkit}?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnSecureToken: true })
            });
            if (!authRes.ok) return { found: false, wishlist: [], className: "", imageUrl: "" };
            const authJson = await authRes.json();
            const refreshToken = authJson.refreshToken;

            // STS Token Exchange
            const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
            });
            if (!tokenRes.ok) return { found: false, wishlist: [], className: "", imageUrl: "" };
            const tokenJson = await tokenRes.json();
            const accessToken = tokenJson.access_token;

            // Query classes
            const endpoint = `${window.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents:runQuery`;
            const queryPayload = {
                structuredQuery: {
                    from: [{ collectionId: "classes" }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: "code" },
                            op: "EQUAL",
                            value: { stringValue: classCode }
                        }
                    }
                }
            };
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(queryPayload)
            });
            if (!res.ok) return { found: false, wishlist: [], className: "", imageUrl: "" };
            const data = await res.json();
            if (data && Array.isArray(data) && data.length > 0 && data[0].document) {
                const doc = data[0].document;
                const wishlistField = doc.fields?.wishlist?.arrayValue?.values;
                const classNameField = doc.fields?.name?.stringValue;
                const imageUrlField = doc.fields?.imageUrl?.stringValue;

                const wishlist = wishlistField && Array.isArray(wishlistField)
                    ? wishlistField.map(item => item.stringValue).filter(Boolean)
                    : [];
                const className = classNameField || "";
                const imageUrl = imageUrlField || "";

                return { found: true, wishlist, className, imageUrl };
            }
            return { found: false, wishlist: [], className: "", imageUrl: "" };
        } catch (e) {
            console.error("Local fetch error:", e);
            return { found: false, wishlist: [], className: "", imageUrl: "" };
        }
    }

    async function verifyStudentDirectly(admissionNo, phoneNumber, classCode) {
        if (!admissionNo || !phoneNumber || !window.CONFIG || !window.CONFIG.FIREBASE) {
            return { success: false, message: "Missing config or parameters" };
        }
        const apiKey = window.CONFIG.FIREBASE.apiKey;
        const projectId = window.CONFIG.FIREBASE.projectId;
        try {
            const authRes = await fetch(`${window.CONFIG.FIREBASE.rest.identityToolkit}?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnSecureToken: true })
            });
            if (!authRes.ok) return { success: false, message: "Auth failed" };
            const authJson = await authRes.json();
            const refreshToken = authJson.refreshToken;

            const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
            });
            if (!tokenRes.ok) return { success: false, message: "Token exchange failed" };
            const tokenJson = await tokenRes.json();
            const accessToken = tokenJson.access_token;

            const endpoint = `${window.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents:runQuery`;
            const queryPayload = {
                structuredQuery: {
                    from: [{ collectionId: "students" }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: "admissionNo" },
                            op: "IN",
                            value: {
                                arrayValue: {
                                    values: [
                                        { stringValue: admissionNo },
                                        { stringValue: admissionNo + "\n" },
                                        { stringValue: admissionNo + "\r\n" },
                                        { stringValue: " " + admissionNo },
                                        { stringValue: admissionNo + " " }
                                    ]
                                }
                            }
                        }
                    }
                }
            };
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(queryPayload)
            });
            if (!res.ok) return { success: false, message: "Query failed" };
            const data = await res.json();
            let foundDoc = null;

            if (data && Array.isArray(data)) {
                for (const item of data) {
                    if (item.document) {
                        foundDoc = item.document;
                        break;
                    }
                }
            }

            if (foundDoc) {
                const nameField = foundDoc.fields?.name || foundDoc.fields?.['name '] || foundDoc.fields?.Name || foundDoc.fields?.['Name '];
                const studentName = nameField && nameField.stringValue ? nameField.stringValue.trim() : "";
                const classField = foundDoc.fields?.class || foundDoc.fields?.['class '] || foundDoc.fields?.Class || foundDoc.fields?.['Class '];
                const studentClass = classField && classField.stringValue ? classField.stringValue.trim() : "";
                
                const phoneField = foundDoc.fields?.phoneNumber || foundDoc.fields?.['phoneNumber '] || foundDoc.fields?.PhoneNumber || foundDoc.fields?.['PhoneNumber '];
                const dbPhone = String(phoneField && phoneField.stringValue ? phoneField.stringValue : '').trim().replace(/\r?\n|\r/g, '');
                const enteredPhone = phoneNumber.replace(/\s+/g, '');

                if (dbPhone === enteredPhone) {
                    return { success: true, name: studentName, class: studentClass };
                } else {
                    const maskPhoneLastN = (phone, n) => {
                        const cleaned = String(phone || '').trim().replace(/\r?\n|\r/g, '');
                        if (cleaned.length <= n) return cleaned;
                        const visible = cleaned.slice(-n);
                        const masked = '*'.repeat(cleaned.length - n);
                        return masked + visible;
                    };
                    const hint = maskPhoneLastN(dbPhone, 2);
                    return { success: false, message: "Phone number does not match", hint };
                }
            }
            return { success: false, message: "Student not found" };
        } catch (e) {
            console.error("Direct student verify error:", e);
            return { success: false, message: e.message };
        }
    }

    async function getPhoneHintDirectly(admissionNo, classCode) {
        if (!admissionNo || !window.CONFIG || !window.CONFIG.FIREBASE) {
            return { success: false, message: "Missing config or parameters" };
        }
        const apiKey = window.CONFIG.FIREBASE.apiKey;
        const projectId = window.CONFIG.FIREBASE.projectId;
        try {
            const authRes = await fetch(`${window.CONFIG.FIREBASE.rest.identityToolkit}?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnSecureToken: true })
            });
            if (!authRes.ok) return { success: false, message: "Auth failed" };
            const authJson = await authRes.json();
            const refreshToken = authJson.refreshToken;

            const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
            });
            if (!tokenRes.ok) return { success: false, message: "Token exchange failed" };
            const tokenJson = await tokenRes.json();
            const accessToken = tokenJson.access_token;

            const endpoint = `${window.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents:runQuery`;
            const queryPayload = {
                structuredQuery: {
                    from: [{ collectionId: "students" }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: "admissionNo" },
                            op: "IN",
                            value: {
                                arrayValue: {
                                    values: [
                                        { stringValue: admissionNo },
                                        { stringValue: admissionNo + "\n" },
                                        { stringValue: admissionNo + "\r\n" },
                                        { stringValue: " " + admissionNo },
                                        { stringValue: admissionNo + " " }
                                    ]
                                }
                            }
                        }
                    }
                }
            };
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(queryPayload)
            });
            if (!res.ok) return { success: false, message: "Query failed" };
            const data = await res.json();
            let foundDoc = null;

            if (data && Array.isArray(data)) {
                for (const item of data) {
                    if (item.document) {
                        foundDoc = item.document;
                        break;
                    }
                }
            }

            if (foundDoc) {
                const nameField = foundDoc.fields?.name || foundDoc.fields?.['name '] || foundDoc.fields?.Name || foundDoc.fields?.['Name '];
                const studentName = nameField && nameField.stringValue ? nameField.stringValue.trim() : "";
                const phoneField = foundDoc.fields?.phoneNumber || foundDoc.fields?.['phoneNumber '] || foundDoc.fields?.PhoneNumber || foundDoc.fields?.['PhoneNumber '];
                const dbPhone = String(phoneField && phoneField.stringValue ? phoneField.stringValue : '').trim().replace(/\r?\n|\r/g, '');
                
                const maskPhoneLastN = (phone, n) => {
                    const cleaned = String(phone || '').trim().replace(/\r?\n|\r/g, '');
                    if (cleaned.length <= n) return cleaned;
                    const visible = cleaned.slice(-n);
                    const masked = '*'.repeat(cleaned.length - n);
                    return masked + visible;
                };
                
                const hint = maskPhoneLastN(dbPhone, 5);
                return { success: true, hint, name: studentName };
            }
            return { success: false, message: "Student not found" };
        } catch (e) {
            console.error("Direct student hint error:", e);
            return { success: false, message: e.message };
        }
    }

    async function updatePhoneHint() {
        const adm = admissionInput ? admissionInput.value.trim() : '';
        const classCode = classCodeInput ? classCodeInput.value.trim() : '';
        const hintContainer = document.getElementById('homepage-phone-hint-container');
        const hintEl = document.getElementById('homepage-phone-hint');
        const errorEl = document.getElementById('homepage-student-error');

        if (!adm) {
            if (hintContainer) hintContainer.style.display = 'none';
            return;
        }

        let result = null;
        if (!chrome || !chrome.storage) {
            result = await getPhoneHintDirectly(adm, classCode);
        } else {
            try {
                result = await chrome.runtime.sendMessage({
                    type: 'getPhoneHint',
                    admissionNo: adm,
                    classCode: classCode
                });
            } catch (err) {
                console.error("Failed to fetch phone hint via background:", err);
                result = { success: false, message: "Connection error" };
            }
        }

        if (result && result.success) {
            if (errorEl) errorEl.style.display = 'none';
            if (hintContainer && hintEl) {
                hintEl.textContent = `Registered Phone: ${result.hint}`;
                hintContainer.style.display = 'flex';
            }
        } else {
            if (hintContainer) hintContainer.style.display = 'none';
            if (errorEl) {
                errorEl.textContent = result?.message || 'Student not found';
                errorEl.style.display = 'inline-block';
            }
        }
    }




    if (!chrome || !chrome.storage) {
        if (ul) ul.innerHTML = '<li>Error: Cannot access extension storage. Running in local fallback mode.</li>';
        
        // Read local storage
        const savedStudentInfoStr = localStorage.getItem('studentInfo');
        const studentInfo = savedStudentInfoStr ? JSON.parse(savedStudentInfoStr) : {};
        const savedWishlistStr = localStorage.getItem('classWishlistCache');
        const classWishlistCache = savedWishlistStr ? JSON.parse(savedWishlistStr) : null;
        
        // Populate inputs
        if (classSelect && studentInfo.grade) {
            classSelect.value = studentInfo.grade;
        }
        if (classCodeInput && studentInfo.classCode) {
            classCodeInput.value = studentInfo.classCode;
        }
        updateIframeSrc(studentInfo);

        // Display student badge
        renderLoggedStudents(studentInfo);

        // Display class poster placeholder/image initially
        const posterImg = document.getElementById('class-poster-img');
        const posterPlaceholder = document.getElementById('class-poster-placeholder');
        if (posterImg && posterPlaceholder) {
            if (classWishlistCache && classWishlistCache.imageUrl) {
                posterImg.src = classWishlistCache.imageUrl;
                posterImg.style.display = 'block';
                posterPlaceholder.style.display = 'none';
            } else {
                posterImg.src = '';
                posterImg.style.display = 'none';
                posterPlaceholder.style.display = 'block';
            }
        }

        // Render websites whitelist
        let combined = [];
        if (classWishlistCache && Array.isArray(classWishlistCache.wishlist)) {
            combined = [...classWishlistCache.wishlist];
        }
        if (window.CONFIG && Array.isArray(window.CONFIG.REQUIRED_RULES)) {
            combined = [...combined, ...window.CONFIG.REQUIRED_RULES];
        }
        let finalWhitelist = Array.from(new Set(combined)).filter(url => 
            url.trim() !== '' &&
            !url.startsWith('chrome-extension://') &&
            !url.startsWith('chrome://')
        );
        if (ul) {
            if (finalWhitelist.length === 0) {
                ul.innerHTML = '<li>No whitelisted websites found.</li>';
            } else {
                finalWhitelist.sort();
                ul.innerHTML = finalWhitelist.map(url => {
                    let href = url;
                    if (!/^https?:\/\//i.test(href)) {
                        href = 'https://' + href.replace(/^\*\./, '').replace(/\/+$/, '');
                    }
                    let domain = href;
                    try { domain = new URL(href).hostname; } catch (e) {}
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                    return `<li>
                        <img src="${faviconUrl}" alt="" width="48" height="48" style="border-radius: 6px; flex-shrink: 0;">
                        <a href="${href}" target="_blank" style="color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${url}</a>
                    </li>`;
                }).join('');
            }
        }

        // Trigger an async direct fetch to refresh cache
        if (studentInfo.classCode) {
            fetchClassDetailsDirectly(studentInfo.classCode).then(details => {
                if (details.found) {
                    const cache = {
                        classCode: studentInfo.classCode,
                        wishlist: details.wishlist,
                        className: details.className,
                        imageUrl: details.imageUrl,
                        timestamp: Date.now()
                    };
                    localStorage.setItem('classWishlistCache', JSON.stringify(cache));
                    if (details.imageUrl) {
                        posterImg.src = details.imageUrl;
                        posterImg.style.display = 'block';
                        posterPlaceholder.style.display = 'none';
                    } else {
                        posterImg.src = '';
                        posterImg.style.display = 'none';
                        posterPlaceholder.style.display = 'block';
                    }
                }
            }).catch(e => console.error("Async direct fetch failed:", e));
        }

        return;
    }

    chrome.storage.local.get(['whitelist', 'classWishlistCache', 'studentInfo'], (result) => {
        let combined = [...(result.whitelist || [])];

        // Add class wishlist if available
        if (result.classWishlistCache && Array.isArray(result.classWishlistCache.wishlist)) {
            combined = [...combined, ...result.classWishlistCache.wishlist];
        }

        // Add REQUIRED_RULES from config.js
        if (window.CONFIG && Array.isArray(window.CONFIG.REQUIRED_RULES)) {
            combined = [...combined, ...window.CONFIG.REQUIRED_RULES];
        }

        // Remove duplicates and filter empty
        let finalWhitelist = Array.from(new Set(combined)).filter(url => url.trim() !== '');

        // Filter out extension URLs and browser internal URLs for better display
        finalWhitelist = finalWhitelist.filter(url =>
            !url.startsWith('chrome-extension://') &&
            !url.startsWith('chrome://') &&
            !url.startsWith('edge://')
        );

        if (ul) {
            if (finalWhitelist.length === 0) {
                ul.innerHTML = '<li>No whitelisted websites found.</li>';
            } else {
                finalWhitelist.sort();
                ul.innerHTML = finalWhitelist.map(url => {
                    // Convert rule to valid href
                    let href = url;
                    if (!/^https?:\/\//i.test(href)) {
                        href = 'https://' + href.replace(/^\*\./, '').replace(/\/+$/, '');
                    }

                    let domain = href;
                    try {
                        domain = new URL(href).hostname;
                    } catch (e) { }

                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

                    return `<li>
                        <img src="${faviconUrl}" alt="" width="48" height="48" style="border-radius: 6px; flex-shrink: 0;">
                        <a href="${href}" target="_blank" style="color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${url}</a>
                    </li>`;
                }).join('');
            }
        }

        // Display student badge if configured
        renderLoggedStudents(result.studentInfo);

        // Display class poster/image if available
        const posterImg = document.getElementById('class-poster-img');
        const posterPlaceholder = document.getElementById('class-poster-placeholder');
        if (posterImg && posterPlaceholder) {
            if (result.classWishlistCache && result.classWishlistCache.imageUrl) {
                posterImg.src = result.classWishlistCache.imageUrl;
                posterImg.style.display = 'block';
                posterPlaceholder.style.display = 'none';
            } else {
                posterImg.src = '';
                posterImg.style.display = 'none';
                posterPlaceholder.style.display = 'block';
            }
        }

        // Initialize and update iframe
        if (classSelect && result.studentInfo && result.studentInfo.grade) {
            classSelect.value = result.studentInfo.grade;
        }
        if (classCodeInput && result.studentInfo && result.studentInfo.classCode) {
            classCodeInput.value = result.studentInfo.classCode;
        }
        updateIframeSrc(result.studentInfo);
    });

    // ============================================================
    // Inactivity Auto-Logout Tracker
    // ============================================================
    (function initInactivityTracker() {
        let lastHeartbeatTime = 0;
        let localTimer = null;
        const LOCAL_TIMEOUT = 300000; // 5 minutes

        function resetLocalInactivity() {
            if (localTimer) clearTimeout(localTimer);
            localTimer = setTimeout(() => {
                console.log("[Inactivity] Local inactivity timeout, logging out...");
                logoutAllStudents();
            }, LOCAL_TIMEOUT);
        }

        function sendActivityHeartbeat() {
            const now = Date.now();
            if (now - lastHeartbeatTime > 2000) {
                lastHeartbeatTime = now;
                if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ type: 'userActivity' }).catch(() => {});
                } else {
                    resetLocalInactivity();
                }
            }
        }

        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        events.forEach(event => {
            window.addEventListener(event, sendActivityHeartbeat, { passive: true });
        });

        if (chrome && chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((message) => {
                if (message && message.type === 'autoLoggedOut') {
                    window.location.reload();
                }
            });
        }

        // Start local timer if in fallback mode
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
            resetLocalInactivity();
        }
    })();

});
