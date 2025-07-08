(function () {
  // Global variables for authentication
  let currentUser = null;
  let currentOTP = null;
  let sessionStartTime = null;
  let lastSummaryViewTime = null;
  let pageClicks = [];
  let summaryViewDuration = 0;
  let uniquePages = new Set();
  let selectedHotels = []; // For hotel comparison
  let buttonsAdded = false; // Prevent duplicate buttons

  // Complete list of amenities to compare
  const AMENITIES = [
    "Free parking", "Free High Speed Internet (WiFi)", "Fitness Centre with Gym / Workout Room", 
    "Pool", "Bar / lounge", "Beach", "Water sport equipment rentals", "Highchairs available",
    "Electric vehicle charging station", "Valet parking", "Paid public parking on-site", 
    "Wifi", "Fitness / spa changing rooms", "Pool / beach towels", "Rooftop pool", 
    "Pool with view", "Outdoor pool", "Coffee shop", "Restaurant", "Breakfast available", 
    "Breakfast buffet", "Breakfast in the room", "Airport transportation", "Shuttle bus service", 
    "Car hire", "Taxi service", "Meeting rooms", "Photo copier / fax In business centre", 
    "Spa", "Rooftop terrace", "24-hour security", "Baggage storage", "Concierge", 
    "Newspaper", "Non-smoking hotel", "Outdoor furniture", "Sun loungers / beach chairs", 
    "Sun terrace", "Sun umbrellas", "Doorperson", "First aid kit", "Umbrella",
    "24-hour check-in", "24-hour front desk", "Dry cleaning", "Laundry service", 
    "Iron", "Blackout curtains", "Bathrobes", "Seating area", "Separate dining area", 
    "Separate living room", "Sofa", "Private bathrooms", "Tile / marble floor", 
    "Wake-up service / alarm clock", "Flatscreen TV", "On-demand films", "Radio", 
    "Walk-in shower", "Bath / shower", "Complimentary toiletries"
  ];

  // Function to track session data
  async function trackSessionData(action, details = {}) {
    if (!currentUser) return;

    const sessionData = {
      userId: currentUser.userId,
      email: currentUser.email,
      reviewerVersion: currentUser.reviewerVersion,
      timestamp: new Date().toISOString(),
      action,
      sessionDuration: sessionStartTime ? (new Date() - sessionStartTime) / 1000 : 0,
      summaryViewDuration,
      currentUrl: window.location.href,
      pageTitle: document.title,
      pageClicks: pageClicks.length > 0 ? pageClicks : null,
      sessionStart: sessionStartTime ? sessionStartTime.toISOString() : null,
      sessionEnd: action === 'logout' ? new Date().toISOString() : null,
      totalClicks: pageClicks.length,
      uniquePages: uniquePages.size,
      ...details
    };

    try {
      await fetch('http://localhost:3000/track-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
    } catch (error) {
      console.error('Failed to track session data:', error);
    }
  }

  // Function to sync data periodically
  function startPeriodicSync() {
    let lastSyncTime = new Date();
    let hasActivity = false;
    let syncTimeout = null;

    function debouncedSync() {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        if (hasActivity && currentUser) {
          await trackSessionData('activity_sync');
          hasActivity = false;
          lastSyncTime = new Date();
        }
      }, 2000);
    }

    document.addEventListener('click', () => {
      hasActivity = true;
      debouncedSync();
    });

    document.addEventListener('scroll', () => {
      hasActivity = true;
      debouncedSync();
    });

    setInterval(async () => {
      if (currentUser && (new Date() - lastSyncTime) > 30000) {
        await trackSessionData('periodic_sync');
        lastSyncTime = new Date();
      }
    }, 30000);
  }

  // Function to track page clicks
  function trackPageClick(event) {
    if (!currentUser) return;

    const clickData = {
      timestamp: new Date().toISOString(),
      target: event.target.tagName,
      targetId: event.target.id,
      targetClass: event.target.className,
      targetText: event.target.textContent?.slice(0, 100),
      url: window.location.href,
      pageTitle: document.title,
      x: event.clientX,
      y: event.clientY
    };

    pageClicks.push(clickData);
    uniquePages.add(window.location.href);
  }

  // Function to track summary view time
  function trackSummaryView() {
    if (!currentUser) return;
    
    const summaryElement = document.querySelector('#summarize-popup');
    if (!summaryElement) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          lastSummaryViewTime = new Date();
        } else if (lastSummaryViewTime) {
          const duration = (new Date() - lastSummaryViewTime) / 1000;
          summaryViewDuration += duration;
          lastSummaryViewTime = null;
        }
      });
    });

    observer.observe(summaryElement);
  }

  // Check if user is already logged in
  chrome.storage.local.get(['currentUser'], (result) => {
    if (result.currentUser) {
      currentUser = result.currentUser;
      sessionStartTime = new Date();
      document.addEventListener('click', trackPageClick);
      trackSessionData('login');
      startPeriodicSync();
      initializeContentScript();
    } else {
      createAuthUI();
    }
  });

  // Authentication functions
  function createAuthUI() {
    const authContainer = document.createElement('div');
    authContainer.id = 'ta-auth-container';
    Object.assign(authContainer.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '10000',
      backgroundColor: '#ffffff',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
      width: '300px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif'
    });

    const style = document.createElement('style');
    style.textContent = `
      .ta-form-group { margin-bottom: 12px; }
      .ta-form-group label { display: block; margin-bottom: 5px; font-weight: 500; }
      .ta-form-group input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
      .ta-button { margin: 8px 0; padding: 10px; background: #1976d2; color: white; border: none; width: 100%; border-radius: 6px; font-weight: 500; cursor: pointer; transition: background 0.3s ease; }
      .ta-button:hover { background: #125ca1; }
      .ta-toggle-form { text-align: center; margin-top: 10px; font-size: 0.9rem; }
      .ta-toggle-form a { color: #1976d2; cursor: pointer; text-decoration: underline; }
      .ta-otp-container { display: none; margin-top: 10px; }
      .ta-error-message { color: #e74c3c; font-size: 0.9rem; margin-top: 5px; }
      .ta-success-message { color: #27ae60; font-size: 0.9rem; margin-top: 5px; }
    `;
    document.head.appendChild(style);

    const loginForm = document.createElement('div');
    loginForm.id = 'ta-login-form';
    loginForm.innerHTML = `
      <h3 style="margin-top: 0; font-size: 1.2rem; text-align: center; color: #1976d2;">TripAdvisor Reviews</h3>
      <div class="ta-form-group">
        <label for="ta-login-email">Email:</label>
        <input type="email" id="ta-login-email" placeholder="Enter your email">
      </div>
      <button id="ta-login-btn" class="ta-button">Login</button>
      <div id="ta-login-error" class="ta-error-message"></div>
      <div class="ta-toggle-form">
        <span>Don't have an account? </span>
        <a id="ta-show-register">Register</a>
      </div>
    `;

    const registerForm = document.createElement('div');
    registerForm.id = 'ta-register-form';
    registerForm.style.display = 'none';
    registerForm.innerHTML = `
      <h3 style="margin-top: 0; font-size: 1.2rem; text-align: center; color: #1976d2;">TripAdvisor Reviews</h3>
      <div class="ta-form-group">
        <label for="ta-register-email">Email:</label>
        <input type="email" id="ta-register-email" placeholder="Enter your email">
      </div>
      <button id="ta-register-btn" class="ta-button">Register</button>
      <div id="ta-register-error" class="ta-error-message"></div>
      <div id="ta-register-success" class="ta-success-message"></div>
      
      <div id="ta-otp-container" class="ta-otp-container">
        <div class="ta-form-group">
          <label for="ta-otp-input">Enter OTP sent to your email:</label>
          <input type="text" id="ta-otp-input" placeholder="Enter OTP">
        </div>
        <button id="ta-verify-otp-btn" class="ta-button">Verify OTP</button>
        <div id="ta-otp-error" class="ta-error-message"></div>
      </div>
      
      <div class="ta-toggle-form">
        <span>Already have an account? </span>
        <a id="ta-show-login">Login</a>
      </div>
    `;

    authContainer.appendChild(loginForm);
    authContainer.appendChild(registerForm);
    document.body.appendChild(authContainer);

    document.getElementById('ta-show-register').addEventListener('click', () => {
      document.getElementById('ta-login-form').style.display = 'none';
      document.getElementById('ta-register-form').style.display = 'block';
    });

    document.getElementById('ta-show-login').addEventListener('click', () => {
      document.getElementById('ta-register-form').style.display = 'none';
      document.getElementById('ta-login-form').style.display = 'block';
    });

    document.getElementById('ta-register-btn').addEventListener('click', registerUser);
    document.getElementById('ta-verify-otp-btn').addEventListener('click', verifyOTP);
    document.getElementById('ta-login-btn').addEventListener('click', loginUser);
  }

  function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
  }

  function assignReviewerVersion() {
    return Math.floor(Math.random() * 5) + 1;
  }

  async function registerUser() {
    const email = document.getElementById('ta-register-email').value.trim();
    const registerError = document.getElementById('ta-register-error');
    const registerSuccess = document.getElementById('ta-register-success');
    
    if (!email || !email.includes('@')) {
      registerError.textContent = 'Please enter a valid email address';
      return;
    }
    
    const users = await loadUsers();
    if (users.find(user => user.email === email)) {
      registerError.textContent = 'This email is already registered';
      return;
    }
    
    currentOTP = generateOTP();
    registerError.textContent = '';
    registerSuccess.textContent = `OTP sent to ${email}. For demo purposes, your OTP is: ${currentOTP}`;
    document.getElementById('ta-otp-container').style.display = 'block';
  }

  async function verifyOTP() {
    const email = document.getElementById('ta-register-email').value.trim();
    const otpInput = document.getElementById('ta-otp-input').value.trim();
    const otpError = document.getElementById('ta-otp-error');
    
    if (otpInput !== currentOTP) {
      otpError.textContent = 'Invalid OTP. Please try again.';
      return;
    }
    
    const userId = generateUserId();
    const reviewerVersion = assignReviewerVersion();
    
    const newUser = {
      email,
      userId,
      reviewerVersion,
      registrationDate: new Date().toISOString()
    };
    
    const users = await loadUsers();
    users.push(newUser);
    await saveUsers(users);

    try {
      await fetch('http://localhost:3000/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
    } catch (error) {
      console.error('Registration error:', error);
    }
    
    currentUser = newUser;
    sessionStartTime = new Date();
    document.addEventListener('click', trackPageClick);
    await saveCurrentUser(newUser);
    await trackSessionData('login');
    
    const authContainer = document.getElementById('ta-auth-container');
    if (authContainer) {
      authContainer.remove();
    }
    
    initializeContentScript();
  }

  async function loginUser() {
    const email = document.getElementById('ta-login-email').value.trim();
    const loginError = document.getElementById('ta-login-error');
    
    if (!email || !email.includes('@')) {
      loginError.textContent = 'Please enter a valid email address';
      return;
    }
    
    const users = await loadUsers();
    const user = users.find(user => user.email === email);
    
    if (!user) {
      loginError.textContent = 'Email not found. Please register first.';
      return;
    }
    
    currentUser = user;
    sessionStartTime = new Date();
    document.addEventListener('click', trackPageClick);
    await saveCurrentUser(user);
    await trackSessionData('login');
    
    const authContainer = document.getElementById('ta-auth-container');
    if (authContainer) {
      authContainer.remove();
    }
    
    initializeContentScript();
  }

  async function logoutUser() {
    finalizeSummaryViewTime();
    if (currentUser) {
      await trackSessionData('logout');
    }
    currentUser = null;
    sessionStartTime = null;
    lastSummaryViewTime = null;
    pageClicks = [];
    summaryViewDuration = 0;
    uniquePages.clear();
    selectedHotels = [];
    buttonsAdded = false;

    document.removeEventListener('click', trackPageClick);
    chrome.storage.local.set({ currentUser: null }, () => {
      window.location.reload();
    });
  }

  async function loadUsers() {
    return new Promise(resolve => {
      chrome.storage.local.get(['users_csv'], (result) => {
        if (!result.users_csv) {
          resolve([]);
          return;
        }
        
        const lines = result.users_csv.split('\n');
        const headers = lines[0].split(',');
        
        const users = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',');
          const user = {};
          
          headers.forEach((header, index) => {
            const value = values[index].replace(/^"|"$/g, '').replace(/""/g, '"');
            user[header] = value;
          });
          
          users.push(user);
        }
        
        resolve(users);
      });
    });
  }

  async function saveUsers(users) {
    return new Promise(resolve => {
      if (users.length === 0) {
        const headers = ['email', 'userId', 'reviewerVersion', 'registrationDate'];
        const csv = headers.join(',');
        chrome.storage.local.set({ users_csv: csv }, resolve);
        return;
      }
      
      const headers = ['email', 'userId', 'reviewerVersion', 'registrationDate'];
      const csvLines = [
        headers.join(','),
        ...users.map(user => {
          return headers.map(header => {
            const value = user[header] || '';
            return `${value.toString().replace(/"/g, '""')}`;
          }).join(',');
        })
      ];
      
      const csv = csvLines.join('\n');
      chrome.storage.local.set({ users_csv: csv }, resolve);
    });
  }

  async function saveCurrentUser(user) {
    return new Promise(resolve => {
      chrome.storage.local.set({ currentUser: user }, resolve);
    });
  }

  // Main content script functionality
  function initializeContentScript() {
    trackSummaryView();
    const GROQ_API_KEY = "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";

    let attempts = 0;
    const hideGAIInterval = setInterval(() => {
      const gaiDiv = document.getElementById("GAI_REVIEWS");
      if (gaiDiv) {
        gaiDiv.hidden = true;
        clearInterval(hideGAIInterval);
      }
      if (++attempts > 20) clearInterval(hideGAIInterval);
    }, 500);

    async function summarizeReviews(reviewsText) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [{
            role: "user",
            content: `You are a review analyst. Summarize the following product or attraction reviews into a structured format with emoji headers and clear sections.

                    Please format the output exactly like this:
                    🏷 Attraction:
                    [Insert attraction name, if known]

                    ⭐ Overall Rating:
                    [Summarize general sentiment — mention if reviews are mostly positive, mixed, or negative]

                    🏆 Key Highlights:
                    1. [Theme or category]
                      - [Detail 1]
                      - [Detail 2]
                      - [Detail 3]

                    2. [Next theme or category]
                      - [Detail 1]
                      - [Detail 2]

                    ⚠ Common Criticisms:
                    1. [Category]
                      - [Critical observation 1]
                      - [Critical observation 2]

                    💡 Visitor Tips:
                    - [Tip 1]
                    - [Tip 2]

                    ✅ Recommended For:
                    - [Audience 1]
                    - [Audience 2]

                    Here are the reviews:
                    ${reviewsText}`
          }],
          temperature: 0.7
        })
      });

      const data = await response.json();
      if (data.error) {
        console.error("GROQ API Error:", data.error);
        return `Summary generation failed: ${data.error.message || data.error}`;
      }
      return data.choices?.[0]?.message?.content || "No summary generated.";
    }

    async function summarizeWithLLM(reviews) {
      const rawText = reviews.map(r => r.text || r.review || '').join(" ").slice(0, 3000);
      return await summarizeReviews(rawText);
    }

    function createAndShowPopup() {
      const popup = document.createElement("div");
      popup.id = "summarize-popup";

      Object.assign(popup.style, {
        margin: "20px 0",
        padding: "24px",
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        border: "1px solid #e0e0e0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
      });

      popup.innerHTML = `
          <div clasfs="biGQs _P fiohW uuBRH" style="margin-bottom: 16px;">
              AI Summary Generator
          </div>
          <div style="margin-bottom: 10px; font-size: 0.9rem;">
              Logged in as: ${currentUser.email} | Reviewer Version: ${currentUser.reviewerVersion}
          </div>
          <div id="reviews">Loading reviews...</div>
          <button id="ta-logout-btn" class="ta-button" style="margin-top: 15px;">Logout</button>
      `;

      const targetSection = document.querySelector(".MNtpD.f.e, div[class*='reviews-section']");
      if (targetSection) {
        const ratingsSection = targetSection.querySelector(".wtCeG.f, div[class*='ratings-section']");
        if (ratingsSection) {
          ratingsSection.parentNode.insertBefore(popup, ratingsSection.nextSibling);
        } else {
          targetSection.insertBefore(popup, targetSection.firstChild);
        }
      } else {
        document.body.appendChild(popup);
      }

      document.getElementById('ta-logout-btn').addEventListener('click', logoutUser);

      renderReviews(document.getElementById("reviews"));
    }

    // Apify integration
  

    async function fetchHotelReviews(tripUrl) {
      try {
        const actorUrl = `https://api.apify.com/v2/acts/maxcopell~tripadvisor-reviews/runs?token=${APIFY_TOKEN}`;
        const payload = {
          startUrls: [{ url: tripUrl, uniqueKey: Date.now().toString() }],
          maxReviews: 30,
          useStealth: true,
          proxyConfig: { useApifyProxy: true }
        };

        const startRun = await fetch(actorUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const runData = await startRun.json();
        if (!runData.data || !runData.data.id) {
          throw new Error('Failed to start Apify run');
        }

        const runId = runData.data.id;
        let status = "RUNNING";
        let attempts = 0;

        while ((status === "RUNNING" || status === "READY") && attempts < 15) {
          await new Promise((r) => setTimeout(r, 4000));
          const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
          const statusData = await statusRes.json();
          status = statusData.data.status;
          attempts++;
        }

        if (status !== "SUCCEEDED") {
          throw new Error(`Apify run failed with status: ${status}`);
        }

        const datasetId = runData.data.defaultDatasetId;
        const reviewRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`);
        const reviews = await reviewRes.json();
        
        return Array.isArray(reviews) ? reviews : [];
      } catch (error) {
        console.error('Apify fetch error:', error);
        return [];
      }
    }

    async function autoSummarize(container, reviews) {
      const loadingDiv = document.createElement("div");
      loadingDiv.innerHTML = "<p style='margin: 10px 0;'>Generating Summary...</p>";
      container.prepend(loadingDiv);

      try {
        const summary = await summarizeWithLLM(reviews);

        try {
          const currentUrl = window.location.href;
          await fetch('http://localhost:3000/final-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: currentUrl,
              reviewerVersion: currentUser?.reviewerVersion || 'unknown',
              summary: summary,
              reviews: reviews
            })
          });
        } catch (e) {
          console.error("Failed to post to FinalReviews:", e);
        }

        const summaryDiv = document.createElement("div");
        summaryDiv.innerHTML = `
          <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h3 style="color: #2c3e50; margin-bottom: 10px;"></h3>
            <div style="white-space: pre-line; line-height: 1.5;">${summary}</div>
          </div>
        `;
        loadingDiv.remove();
        container.prepend(summaryDiv);
      } catch (error) {
        console.error('Summary generation error:', error);
        loadingDiv.innerHTML = "<p style='color: #dc3545;'>Failed to generate summary. Please try again.</p>";
      }
    }

    async function renderReviews(container) {
      const currentUrl = window.location.href;
      if (!currentUrl.includes("tripadvisor")) {
        container.innerHTML = "Please open a TripAdvisor page.";
        return;
      }

      const reviews = await fetchHotelReviews(currentUrl);

      if (!reviews || reviews.length === 0) {
        container.innerHTML = "No reviews found.";
        return;
      }

      container.innerHTML = "";
      await autoSummarize(container, reviews);
      
    }

    // Enhanced Hotel Comparison Feature with Amenities
 // 1. Update the floating compare bar creation
function createFloatingCompareBar() {
  if (document.getElementById('floating-compare-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'floating-compare-bar';
  bar.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #fff;
    border: 2px solid #1976d2;
    border-radius: 10px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    padding: 16px 20px;
    z-index: 99999;
    min-width: 300px;
    font-family: inherit;
  `;
  bar.innerHTML = `
    <div style="font-weight:bold; color:#1976d2; margin-bottom:8px;">🏨 Hotel Comparison (3 Hotels)</div>
    <div id="selected-hotel-1" style="margin-bottom:6px; color:#333; font-size:13px;">Hotel 1: <span style="color:#888;">None Selected</span></div>
    <div id="selected-hotel-2" style="margin-bottom:6px; color:#333; font-size:13px;">Hotel 2: <span style="color:#888;">None Selected</span></div>
    <div id="selected-hotel-3" style="margin-bottom:10px; color:#333; font-size:13px;">Hotel 3: <span style="color:#888;">None Selected</span></div>
    <button id="do-compare-btn" style="width:100%;padding:8px;background:#1976d2;color:#fff;border:none;border-radius:6px;font-weight:500;cursor:pointer;" disabled>Compare Hotels</button>
    <button id="clear-selection-btn" style="width:100%;padding:6px;background:#ff6b6b;color:#fff;border:none;border-radius:6px;font-size:12px;margin-top:5px;">Clear Selection</button>
  `;
  document.body.appendChild(bar);

  document.getElementById('do-compare-btn').onclick = async () => {
    if (selectedHotels.length === 3 && selectedHotels[0] && selectedHotels[1] && selectedHotels[2]) {
      await showComparisonPopup([...selectedHotels]);
    }
  };

  document.getElementById('clear-selection-btn').onclick = () => {
    selectedHotels = [];
    updateFloatingCompareBar();
    refreshCompareButtons();
  };
}
  // 2. Update the floating compare bar display
function updateFloatingCompareBar() {
  const bar = document.getElementById('floating-compare-bar');
  if (!bar) return;
  
  const [h1, h2, h3] = selectedHotels;
  const hotel1Text = h1 ? h1.name.substring(0, 22) + (h1.name.length > 22 ? '...' : '') : 'None Selected';
  const hotel2Text = h2 ? h2.name.substring(0, 22) + (h2.name.length > 22 ? '...' : '') : 'None Selected';
  const hotel3Text = h3 ? h3.name.substring(0, 22) + (h3.name.length > 22 ? '...' : '') : 'None Selected';
  
  document.getElementById('selected-hotel-1').innerHTML = `Hotel 1: <span style="color:#1976d2;">${hotel1Text}</span>`;
  document.getElementById('selected-hotel-2').innerHTML = `Hotel 2: <span style="color:#1976d2;">${hotel2Text}</span>`;
  document.getElementById('selected-hotel-3').innerHTML = `Hotel 3: <span style="color:#1976d2;">${hotel3Text}</span>`;
  document.getElementById('do-compare-btn').disabled = !(h1 && h2 && h3);
}

    function refreshCompareButtons() {
      document.querySelectorAll('.set-hotel-btn').forEach(btn => btn.remove());
      document.querySelectorAll('.hotel-btn-container').forEach(container => container.remove());
      buttonsAdded = false;
      
      setTimeout(() => {
        addCompareButtons();
      }, 100);
    }
function isValidHotelElement(element) {
      const text = element.textContent.toLowerCase();
      const href = element.querySelector('a')?.href || element.href || '';
      
      if (element.closest('nav') || 
          element.closest('.menu') || 
          element.closest('.header') || 
          element.closest('.footer') ||
          element.closest('.sidebar')) {
        return false;
      }
      
      return href.includes('/Hotel_Review-') || 
             href.includes('/hotels/') || 
             (text.includes('hotel') && href.includes('tripadvisor'));
    }

  // Enhanced Hotel Comparison Feature - Shows buttons on ALL hotel types
// Enhanced Hotel Comparison Feature - Shows buttons on ALL hotel types

function addCompareButtons() {
  if (buttonsAdded) return;
  
  // EXPANDED SELECTORS - Cover all possible hotel elements
  const hotelSelectors = [
    // Original selectors
    'a[href*="/Hotel_Review-"]',
    'a[href*="/hotels/"]',
    
    // Search results and listing pages
    'a[href*="tripadvisor.com/Hotel"]',
    'a[href*="/hotel/"]',
    'a[href*="/g"][href*="-Hotels"]',
    'a[href*="/LocationPhotoDirectLink"]',
    
    // Property cards and listings
    '.property-title a',
    '.listing-title a',
    '.hotel-name a',
    '.property_title a',
    '.ui_link[href*="Hotel"]',
    
    // Search result cards
    '.result-title a',
    '.search-result .property-title a',
    '.listing .property-title a',
    
    // Map and location based
    'a[data-test-target*="hotel"]',
    'a[data-automation*="hotel"]',
    
    // Generic TripAdvisor hotel links
    'a[href*="tripadvisor"][href*="hotel" i]',
    'a[href*="tripadvisor"][href*="Resort" i]',
    'a[href*="tripadvisor"][href*="Inn" i]',
    'a[href*="tripadvisor"][href*="Lodge" i]',
    
    // International domain variations
    'a[href*="tripadvisor.co.uk/Hotel"]',
    'a[href*="tripadvisor.ca/Hotel"]',
    'a[href*="tripadvisor.in/Hotel"]',
    'a[href*="tripadvisor.com.au/Hotel"]',
    
    // Mobile and responsive selectors
    '.hotel-card a',
    '.property-card a',
    '.accommodation-card a',
    '.listing-card a[href*="Hotel"]'
  ];
  
  // Get all potential hotel elements
  const allHotelElements = [];
  hotelSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      allHotelElements.push(...elements);
    } catch (e) {
      console.log(`Invalid selector: ${selector}`);
    }
  });
  
  // Remove duplicates
  const uniqueHotelElements = [...new Set(allHotelElements)];
  
  console.log(`Found ${uniqueHotelElements.length} potential hotel elements`);
  
  uniqueHotelElements.forEach(element => {
    if (!isValidHotelElement(element) || element.dataset.compareButtonAdded === "true") return;
    // if (!isValidHotelElement(element) || element.querySelector('.hotel-btn-container')) return;
    
    // Enhanced hotel name extraction
    const hotelName = extractHotelName(element);
    const hotelUrl = element.href;
    
    if (!hotelName || hotelName.length < 2 || !hotelUrl) return;
    element.dataset.compareButtonAdded = "true";

    
    // Create button container with better positioning
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'hotel-btn-container';
    buttonContainer.style.cssText = `
      position: relative;
      display: inline-block;
      margin-left: 6px;
      vertical-align: middle;
      z-index: 1000;
    `;
    
    const addButton = document.createElement('button');
    addButton.className = 'set-hotel-btn';
    addButton.textContent = '+ Compare';
    addButton.style.cssText = `
      background: linear-gradient(135deg, #1976d2, #1565c0);
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 11px;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
      position: relative;
      z-index: 1001;
    `;
    
    // Add hover effects
    addButton.addEventListener('mouseenter', () => {
      addButton.style.transform = 'scale(1.05)';
      addButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
    });
    
    addButton.addEventListener('mouseleave', () => {
      addButton.style.transform = 'scale(1)';
      addButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    });
    
    // 3. Update the button click handler
addButton.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  const hotelData = { name: hotelName, url: hotelUrl };
  
  // Visual feedback
  addButton.textContent = '✓ Added';
  addButton.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
  
  setTimeout(() => {
    addButton.textContent = '+ Compare';
    addButton.style.background = 'linear-gradient(135deg, #1976d2, #1565c0)';
  }, 1500);
  
  // Add hotel to comparison (max 3)
  if (selectedHotels.length < 3) {
    selectedHotels.push(hotelData);
  } else {
    // Replace the oldest hotel (shift array)
    selectedHotels.shift();
    selectedHotels.push(hotelData);
  }
  
  updateFloatingCompareBar();
  createFloatingCompareBar();
  
  // Track button click
  console.log(`Hotel added to comparison: ${hotelName}`);
};
    buttonContainer.appendChild(addButton);
    
    // Smart positioning - try different insertion points
    if (insertButtonSafely(element, buttonContainer)) {
      console.log(`Button added for: ${hotelName}`);
    }
  });
  
  buttonsAdded = true;
}

// Enhanced hotel name extraction
function extractHotelName(element) {
  // Try multiple methods to get hotel name
  let hotelName = '';
  
  // Method 1: Direct text content
  hotelName = element.textContent.trim();
  
  // Method 2: aria-label
  if (!hotelName) {
    hotelName = element.getAttribute('aria-label') || '';
  }
  
  // Method 3: title attribute
  if (!hotelName) {
    hotelName = element.getAttribute('title') || '';
  }
  
  // // Method 4: Look for hotel name in child elements
  // if (!hotelName) {
  //   const titleElements = element.querySelectorAll('.title, .name, .hotel-name, .property-title, .listing-title');
  //   if (titleElements.length > 0) {
  //     hotelName = titleElements[0].textContent.trim();
  //   }
  // }
  
  // // Method 5: Extract from URL
  // if (!hotelName) {
  //   const urlMatch = element.href.match(/Hotel_Review-g\d+-d\d+-(.*?)\.html/);
  //   if (urlMatch) {
  //     hotelName = urlMatch[1].replace(/_/g, ' ').replace(/-/g, ' ');
  //   }
  // }
  
  // Clean up the name
  hotelName = hotelName
    .replace(/\s+/g, ' ')
    .replace(/^[^\w]+/, '')
    .replace(/[^\w\s&-'.]/g, '')
    .trim();
  
  return hotelName;
}

// Enhanced validation - Less restrictive
function isValidHotelElement(element) {
  const href = element.href || '';
  const text = element.textContent.toLowerCase().trim();
  
  // Must have valid href
  if (!href || !href.includes('tripadvisor')) return false;
  
  // Skip if clearly not a hotel
  if (text.includes('advertisement') || 
      text.includes('sponsored') || 
      text.length < 2) {
    return false;
  }
  
  // Skip navigation elements (less restrictive)
  if (element.closest('.nav') || 
      element.closest('.breadcrumb') || 
      element.closest('.pagination')) {
    return false;
  }
  
  // Must be hotel-related
  return href.includes('Hotel') || 
         href.includes('hotel') || 
         href.includes('Resort') || 
         href.includes('Inn') || 
         href.includes('Lodge') ||
         text.includes('hotel') ||
         text.includes('resort');
}

// Smart button insertion
function insertButtonSafely(element, buttonContainer) {
  try {
    // Method 1: Insert after element
    if (element.nextSibling) {
      element.parentNode.insertBefore(buttonContainer, element.nextSibling);
      return true;
    }
    
    // // Method 2: Insert as last child of parent
    // if (element.parentNode) {
    //   element.parentNode.appendChild(buttonContainer);
    //   return true;
    // }
    
    // // Method 3: Insert inside element if it has space
    // if (element.children.length === 0) {
    //   element.appendChild(buttonContainer);
    //   return true;
    // }
    
    return false;
  } catch (e) {
    console.error('Failed to insert button:', e);
    return false;
  }
}


// Enhanced observer for dynamic content
function setupDynamicObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // Check if new content contains hotel links
            const hasHotelLinks = node.querySelector && 
              (node.querySelector('a[href*="Hotel"]') || 
               node.querySelector('a[href*="hotel"]') ||
               node.matches('a[href*="Hotel"]') ||
               node.matches('a[href*="hotel"]'));
            
            if (hasHotelLinks) {
              shouldUpdate = true;
            }
          }
        });
      }
    });
    
    if (shouldUpdate) {
      console.log('New hotel content detected, updating buttons...');
      buttonsAdded = false;
      setTimeout(() => {
        addCompareButtons();
      }, 500);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  return observer;
}

// Enhanced initialization
function initializeHotelComparison() {
  // Initial button addition
  setTimeout(() => {
    addCompareButtons();
  }, 1000);
  
  // Setup dynamic observer
  setupDynamicObserver();
  
  // Handle page navigation and URL changes
  let currentURL = window.location.href;
  setInterval(() => {
    if (window.location.href !== currentURL) {
      currentURL = window.location.href;
      console.log('Page changed, refreshing buttons...');
      buttonsAdded = false;
      setTimeout(() => {
        addCompareButtons();
      }, 1500);
    }
  }, 1000);
  
  // Handle scroll-based lazy loading
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (!buttonsAdded) {
        addCompareButtons();
      }
    }, 1000);
  });
  
  // Force refresh on click (in case of AJAX loads)
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'A' || e.target.closest('a')) {
      setTimeout(() => {
        buttonsAdded = false;
        addCompareButtons();
      }, 2000);
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeHotelComparison);
} else {
  initializeHotelComparison();
}
    async function getHotelAmenities(hotelUrl) {
      try {
        const response = await fetch(hotelUrl);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const amenities = [];
        const amenityElements = doc.querySelectorAll('[data-test-target="amenity-item"], .amenity-item, .property-amenity');
        
        amenityElements.forEach(element => {
          const text = element.textContent.trim();
          if (text && AMENITIES.includes(text)) {
            amenities.push(text);
          }
        });
        
        // Fallback: look for text content that matches our amenities list
        const bodyText = doc.body.textContent;
        AMENITIES.forEach(amenity => {
          if (bodyText.includes(amenity) && !amenities.includes(amenity)) {
            amenities.push(amenity);
          }
        });
        
        return [...new Set(amenities)];
      } catch (error) {
        console.error('Error fetching amenities:', error);
        return [];
      }
    }

   // 4. Update the comparison popup to handle 3 hotels
async function showComparisonPopup(hotels) {
  const popup = document.createElement('div');
  popup.id = 'comparison-popup';
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 100000;
    max-width: 95vw;
    max-height: 85vh;
    overflow-y: auto;
    font-family: inherit;
  `;
  
  popup.innerHTML = `
    <div style="padding: 20px; border-bottom: 1px solid #eee;">
      <h2 style="margin: 0; color: #1976d2;">🏨 Hotel Comparison (3 Hotels)</h2>
      <button id="close-comparison" style="float: right; margin-top: -30px; background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
    </div>
    <div id="comparison-content" style="padding: 20px;">
      <div style="text-align: center; margin: 20px 0;">
        <div style="display: inline-block; margin: 10px; padding: 10px; background: #f0f0f0; border-radius: 6px;">
          Loading amenities data for 3 hotels...
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  document.getElementById('close-comparison').onclick = () => {
    popup.remove();
  };
  
  // Fetch amenities for all three hotels
  const hotel1Amenities = await getHotelAmenities(hotels[0].url);
  const hotel2Amenities = await getHotelAmenities(hotels[1].url);
  const hotel3Amenities = await getHotelAmenities(hotels[2].url);
  
  // Generate comparison for 3 hotels
  const allAmenities = [...new Set([...hotel1Amenities, ...hotel2Amenities, ...hotel3Amenities])].sort();
  
  // Find common amenities across all 3 hotels
  const commonToAll = hotel1Amenities.filter(a => 
    hotel2Amenities.includes(a) && hotel3Amenities.includes(a)
  );
  
  // Find amenities unique to each hotel
  const hotel1Unique = hotel1Amenities.filter(a => 
    !hotel2Amenities.includes(a) && !hotel3Amenities.includes(a)
  );
  const hotel2Unique = hotel2Amenities.filter(a => 
    !hotel1Amenities.includes(a) && !hotel3Amenities.includes(a)
  );
  const hotel3Unique = hotel3Amenities.filter(a => 
    !hotel1Amenities.includes(a) && !hotel2Amenities.includes(a)
  );
  
  // Create detailed comparison table for 3 hotels
  const comparisonHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
      <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
        <h3 style="color: #1976d2; margin-top: 0; font-size: 16px;">${hotels[0].name}</h3>
        <div style="margin-bottom: 10px;">
          <strong>Total Amenities:</strong> ${hotel1Amenities.length}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Unique Amenities:</strong> ${hotel1Unique.length}
        </div>
        <a href="${hotels[0].url}" target="_blank" style="color: #1976d2; text-decoration: none; font-size: 14px;">View Hotel →</a>
      </div>
      
      <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
        <h3 style="color: #1976d2; margin-top: 0; font-size: 16px;">${hotels[1].name}</h3>
        <div style="margin-bottom: 10px;">
          <strong>Total Amenities:</strong> ${hotel2Amenities.length}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Unique Amenities:</strong> ${hotel2Unique.length}
        </div>
        <a href="${hotels[1].url}" target="_blank" style="color: #1976d2; text-decoration: none; font-size: 14px;">View Hotel →</a>
      </div>
      
      <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center;">
        <h3 style="color: #1976d2; margin-top: 0; font-size: 16px;">${hotels[2].name}</h3>
        <div style="margin-bottom: 10px;">
          <strong>Total Amenities:</strong> ${hotel3Amenities.length}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Unique Amenities:</strong> ${hotel3Unique.length}
        </div>
        <a href="${hotels[2].url}" target="_blank" style="color: #1976d2; text-decoration: none; font-size: 14px;">View Hotel →</a>
      </div>
    </div>
    
    <div style="margin-bottom: 20px;">
      <h4 style="color: #495057; margin-bottom: 15px; text-align: center;">🔍 Detailed Amenities Comparison</h4>
      <div style="max-height: 450px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f8f9fa; position: sticky; top: 0;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd; font-weight: 600; min-width: 200px;">Amenity</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; font-weight: 600; min-width: 80px;">${hotels[0].name.length > 12 ? hotels[0].name.substring(0, 12) + '...' : hotels[0].name}</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; font-weight: 600; min-width: 80px;">${hotels[1].name.length > 12 ? hotels[1].name.substring(0, 12) + '...' : hotels[1].name}</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; font-weight: 600; min-width: 80px;">${hotels[2].name.length > 12 ? hotels[2].name.substring(0, 12) + '...' : hotels[2].name}</th>
            </tr>
          </thead>
          <tbody>
            ${allAmenities.map((amenity, index) => {
              const hasHotel1 = hotel1Amenities.includes(amenity);
              const hasHotel2 = hotel2Amenities.includes(amenity);
              const hasHotel3 = hotel3Amenities.includes(amenity);
              const rowColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
              
              let status = '';
              const count = [hasHotel1, hasHotel2, hasHotel3].filter(Boolean).length;
              
              if (count === 3) {
                status = 'all';
              } else if (count === 2) {
                status = 'partial';
              } else {
                status = 'few';
              }
              
              return `
                <tr style="background: ${rowColor}; ${status === 'all' ? 'border-left: 4px solid #27ae60;' : status === 'partial' ? 'border-left: 4px solid #ff9800;' : ''}">
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: ${status === 'all' ? '600' : '400'}; color: ${status === 'all' ? '#27ae60' : status === 'partial' ? '#ff9800' : '#333'};">
                    ${status === 'all' ? '✅ ' : status === 'partial' ? '⚠️ ' : ''}${amenity}
                  </td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                    ${hasHotel1 ? '<span style="color: #27ae60; font-size: 14px; font-weight: bold;">✓</span>' : '<span style="color: #dc3545; font-size: 14px;">✗</span>'}
                  </td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                    ${hasHotel2 ? '<span style="color: #27ae60; font-size: 14px; font-weight: bold;">✓</span>' : '<span style="color: #dc3545; font-size: 14px;">✗</span>'}
                  </td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                    ${hasHotel3 ? '<span style="color: #27ae60; font-size: 14px; font-weight: bold;">✓</span>' : '<span style="color: #dc3545; font-size: 14px;">✗</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px;">
      <div style="padding: 12px; background: #e8f5e8; border-radius: 8px; border-left: 4px solid #27ae60;">
        <h4 style="margin-top: 0; color: #27ae60; font-size: 14px;">✅ All 3 Hotels</h4>
        <div style="font-size: 20px; font-weight: bold; color: #27ae60; margin-bottom: 5px;">${commonToAll.length}</div>
        <div style="font-size: 11px; color: #666;">Common amenities</div>
      </div>
      
      <div style="padding: 12px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #1976d2;">
        <h4 style="margin-top: 0; color: #1976d2; font-size: 14px;">🏨 ${hotels[0].name.length > 8 ? hotels[0].name.substring(0, 8) + '...' : hotels[0].name}</h4>
        <div style="font-size: 20px; font-weight: bold; color: #1976d2; margin-bottom: 5px;">${hotel1Unique.length}</div>
        <div style="font-size: 11px; color: #666;">Unique amenities</div>
      </div>
      
      <div style="padding: 12px; background: #fff3e0; border-radius: 8px; border-left: 4px solid #ff9800;">
        <h4 style="margin-top: 0; color: #ff9800; font-size: 14px;">🏨 ${hotels[1].name.length > 8 ? hotels[1].name.substring(0, 8) + '...' : hotels[1].name}</h4>
        <div style="font-size: 20px; font-weight: bold; color: #ff9800; margin-bottom: 5px;">${hotel2Unique.length}</div>
        <div style="font-size: 11px; color: #666;">Unique amenities</div>
      </div>
      
      <div style="padding: 12px; background: #fce4ec; border-radius: 8px; border-left: 4px solid #e91e63;">
        <h4 style="margin-top: 0; color: #e91e63; font-size: 14px;">🏨 ${hotels[2].name.length > 8 ? hotels[2].name.substring(0, 8) + '...' : hotels[2].name}</h4>
        <div style="font-size: 20px; font-weight: bold; color: #e91e63; margin-bottom: 5px;">${hotel3Unique.length}</div>
        <div style="font-size: 11px; color: #666;">Unique amenities</div>
      </div>
    </div>
    
    <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
      <h4 style="margin-top: 0; color: #495057;">📊 3-Hotel Comparison Summary</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; font-size: 13px;">
        <div style="text-align: center; padding: 10px; background: white; border-radius: 6px;">
          <div style="font-size: 18px; font-weight: bold; color: #27ae60; margin-bottom: 5px;">${commonToAll.length}</div>
          <div style="color: #666;">Common to All</div>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 6px;">
          <div style="font-size: 18px; font-weight: bold; color: #1976d2; margin-bottom: 5px;">${allAmenities.length}</div>
          <div style="color: #666;">Total Features</div>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 6px;">
          <div style="font-size: 18px; font-weight: bold; color: #ff9800; margin-bottom: 5px;">${hotel1Unique.length + hotel2Unique.length + hotel3Unique.length}</div>
          <div style="color: #666;">Unique Features</div>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 6px;">
          <div style="font-size: 18px; font-weight: bold; color: #e91e63; margin-bottom: 5px;">${Math.round((commonToAll.length / allAmenities.length) * 100)}%</div>
          <div style="color: #666;">Agreement Rate</div>
        </div>
      </div>
    </div>
    
    <div style="margin-top: 15px; padding: 12px; background: #e8f4fd; border-radius: 8px; border-left: 4px solid #1976d2;">
      <div style="font-size: 12px; color: #1976d2; font-weight: 500;">
        💡 <strong>Legend:</strong> 
        ✅ Available in all 3 hotels | 
        ⚠️ Available in 2 hotels | 
        ✓ Available | ✗ Not available
      </div>
    </div>
  `;
  
  document.getElementById('comparison-content').innerHTML = comparisonHTML;
  
     // Track comparison action for 3 hotels
  await trackSessionData('hotel_comparison_3', {
    hotel1: hotels[0].name,
    hotel2: hotels[1].name,
    hotel3: hotels[2].name,
    commonToAll: commonToAll.length,
    hotel1Unique: hotel1Unique.length,
    hotel2Unique: hotel2Unique.length,
    hotel3Unique: hotel3Unique.length,
    totalAmenities: allAmenities.length
  });
}

    function finalizeSummaryViewTime() {
      if (lastSummaryViewTime) {
        const duration = (new Date() - lastSummaryViewTime) / 1000;
        summaryViewDuration += duration;
        lastSummaryViewTime = null;
      }
    }

    // Initialize the main functionality
    createAndShowPopup();
    createFloatingCompareBar();
    
    // Add compare buttons with delay to ensure page is loaded
    setTimeout(() => {
      addCompareButtons();
    }, 2000);
    
    // Add observer for dynamic content
    const observer = new MutationObserver(() => {
      if (!buttonsAdded) {
        addCompareButtons();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Handle page navigation
    let currentPath = window.location.pathname;
    setInterval(() => {
      if (window.location.pathname !== currentPath) {
        currentPath = window.location.pathname;
        buttonsAdded = false;
        setTimeout(() => {
          addCompareButtons();
        }, 1000);
      }
    }, 1000);
    
    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        finalizeSummaryViewTime();
      } else {
        trackSessionData('page_visible');
      }
    });
    
    // Track page unload
    window.addEventListener('beforeunload', () => {
      finalizeSummaryViewTime();
      if (currentUser) {
        trackSessionData('page_unload');
      }
    });
    
    startPeriodicSync();
  }

  // Handle page load events
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Content will be initialized after authentication
    });
  } else {
    // Content will be initialized after authentication
  }
})();