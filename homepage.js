document.addEventListener('DOMContentLoaded', () => {
    const ul = document.getElementById('whitelist-ul');
    const iframe = document.getElementById('quiz-iframe');
    const classSelect = document.getElementById('homepage-class-select');
    const classCodeInput = document.getElementById('homepage-class-code-input');
    const admissionInput = document.getElementById('homepage-admission-input');
    const guardianPhoneInput = document.getElementById('homepage-guardian-phone-input');

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

    // Always attach the event listener so it works even when testing locally
    if (classSelect) {
        classSelect.addEventListener('change', (e) => saveStudentInfo({ grade: e.target.value }));
    }
    
    if (admissionInput) {
        admissionInput.addEventListener('blur', (e) => saveStudentInfo({ admissionNumber: e.target.value.trim() }));
    }
    
    if (guardianPhoneInput) {
        guardianPhoneInput.addEventListener('blur', (e) => saveStudentInfo({ guardianPhone: e.target.value.trim() }));
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
        if (admissionInput && studentInfo.admissionNumber) {
            admissionInput.value = studentInfo.admissionNumber;
        }
        if (guardianPhoneInput && studentInfo.guardianPhone) {
            guardianPhoneInput.value = studentInfo.guardianPhone;
        }
        updateIframeSrc(studentInfo);

        // Display student badge
        const infoEl = document.getElementById('homepage-student-info');
        const infoContainer = document.getElementById('homepage-student-info-container');
        if (infoEl && infoContainer && studentInfo.classCode) {
            const displayClass = studentInfo.className || studentInfo.classCode;
            infoEl.textContent = `Class: ${displayClass}`;
            infoContainer.style.display = 'flex';
        } else if (infoContainer) {
            infoContainer.style.display = 'none';
        }

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
        const infoEl = document.getElementById('homepage-student-info');
        const infoContainer = document.getElementById('homepage-student-info-container');
        if (infoEl && infoContainer && result.studentInfo && result.studentInfo.classCode) {
            const displayClass = result.studentInfo.className || result.studentInfo.classCode;
            infoEl.textContent = `Class: ${displayClass}`;
            infoContainer.style.display = 'flex';
        } else if (infoContainer) {
            infoContainer.style.display = 'none';
        }

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
        if (admissionInput && result.studentInfo && result.studentInfo.admissionNumber) {
            admissionInput.value = result.studentInfo.admissionNumber;
        }
        if (guardianPhoneInput && result.studentInfo && result.studentInfo.guardianPhone) {
            guardianPhoneInput.value = result.studentInfo.guardianPhone;
        }
        updateIframeSrc(result.studentInfo);
    });

});
