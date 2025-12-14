const HYTABLE_DOMAIN = "accounts.hytale.com";
const API_ENDPOINT = "/api/account/username-reservations/list";
const GAME_PROFILE_API_ENDPOINT = "/api/game-profile/list";

function injectModalStyles() {
  if (document.getElementById("talename-modal-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "talename-modal-styles";
  style.textContent = `
    #talename-modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999999;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #talename-modal-overlay.active {
      display: flex;
    }

    #talename-modal {
      background: #2a2a2a;
      border-radius: 8px;
      padding: 32px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      border: 1px solid #333;
      animation: talename-modal-fade-in 0.2s ease-out;
    }

    @keyframes talename-modal-fade-in {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    #talename-modal-header {
      margin-bottom: 20px;
    }

    #talename-modal-header h3 {
      font-size: 20px;
      color: #ffffff;
      margin-bottom: 8px;
      font-weight: 600;
    }

    #talename-modal-body {
      margin-bottom: 24px;
      color: #ccc;
      font-size: 15px;
      line-height: 1.6;
    }

    #talename-modal-footer {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .talename-modal-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .talename-modal-btn-primary {
      background: #4a90e2;
      color: white;
    }

    .talename-modal-btn-primary:hover {
      background: #357abd;
    }

    .talename-modal-btn-secondary {
      background: transparent;
      color: #999;
      border: 1px solid #333;
    }

    .talename-modal-btn-secondary:hover {
      background: #333;
    }
  `;
  document.head.appendChild(style);
}

function injectModalHTML() {
  if (document.getElementById("talename-modal-overlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "talename-modal-overlay";
  overlay.innerHTML = `
    <div id="talename-modal">
      <div id="talename-modal-header">
        <h3 id="talename-modal-title">Alert</h3>
      </div>
      <div id="talename-modal-body">
        <p id="talename-modal-message"></p>
      </div>
      <div id="talename-modal-footer">
        <button id="talename-modal-ok" class="talename-modal-btn talename-modal-btn-primary">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

const Modal = {
  show(title, message, onClose = null) {
    injectModalStyles();
    injectModalHTML();

    const overlay = document.getElementById("talename-modal-overlay");
    const titleEl = document.getElementById("talename-modal-title");
    const messageEl = document.getElementById("talename-modal-message");
    const okBtn = document.getElementById("talename-modal-ok");

    titleEl.textContent = title || "Alert";
    messageEl.textContent = message || "";

    overlay.classList.add("active");

    const closeModal = () => {
      overlay.classList.remove("active");
      document.removeEventListener("keydown", escapeHandler);
      if (onClose) onClose();
    };

    const escapeHandler = (e) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };

    okBtn.onclick = closeModal;
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };

    document.addEventListener("keydown", escapeHandler);
  }
};

function verifySSL(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== "https:") {
      return false;
    }
    if (urlObj.hostname !== HYTABLE_DOMAIN && !urlObj.hostname.endsWith(`.${HYTABLE_DOMAIN}`)) {
      return false;
    }
    if (window.location.protocol !== "https:") {
      return false;
    }
    if (window.location.hostname !== HYTABLE_DOMAIN && !window.location.hostname.endsWith(`.${HYTABLE_DOMAIN}`)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function verifyRequestOrigin(requestUrl, requestOptions) {
  if (!verifySSL(requestUrl)) {
    return false;
  }
  if (requestOptions && requestOptions.credentials === "include") {
    return true;
  }
  return false;
}

function interceptFetch() {
  if (window.location.hostname !== HYTABLE_DOMAIN || window.location.protocol !== "https:") {
    return;
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [url, options = {}] = args;
    const fullUrl = typeof url === "string" ? url : url.url || url.toString();

    const isReservationsEndpoint = fullUrl.includes(API_ENDPOINT);
    const isGameProfileEndpoint = fullUrl.includes(GAME_PROFILE_API_ENDPOINT);

    if (verifySSL(fullUrl) && verifyRequestOrigin(fullUrl, options) && (isReservationsEndpoint || isGameProfileEndpoint)) {
      try {
        const response = await originalFetch.apply(this, args);
        
        if (!response.ok) {
          return response;
        }

        const clonedResponse = response.clone();
        let data;
        
        try {
          data = await clonedResponse.json();
        } catch {
          return response;
        }

        if (Array.isArray(data) && data.length > 0) {
          let validData = [];
          let proofSource = "hytale-api";

          if (isReservationsEndpoint) {
            validData = data.filter((item) => {
              return item && typeof item === "object" && item.username && typeof item.username === "string" && item.reservedUntil;
            });
          } else if (isGameProfileEndpoint) {
            validData = data.filter((item) => {
              return item && typeof item === "object" && item.username && typeof item.username === "string";
            }).map((item) => {
              const reservation = {
                username: item.username.toLowerCase().trim()
              };
              if (item.uuid) reservation.uuid = item.uuid;
              if (item.createdAt) reservation.createdAt = item.createdAt;
              if (item.nextNameChangeAt) reservation.nextNameChangeAt = item.nextNameChangeAt;
              if (item.entitlements) reservation.entitlements = item.entitlements;
              return reservation;
            });
            proofSource = "game-profiles";
          }
          
          if (validData.length > 0) {
            const proofData = {
              reservations: validData,
              timestamp: Date.now(),
              source: proofSource
            };
            browserAPI.runtime.sendMessage({
              action: "reservationsDetected",
              reservations: validData,
              proof: proofData,
            }).catch((error) => {
              const errorMessage = error.message || 'Unknown error';
              if (!errorMessage.includes('Could not establish connection') && 
                  !errorMessage.includes('Receiving end does not exist') &&
                  !errorMessage.includes('Extension context invalidated')) {
                console.error("TaleName [Content]: Failed to send reservationsDetected:", errorMessage);
              }
            });
          }
        }

        return response;
      } catch (error) {
        console.error("TaleName: Failed to intercept API response", error);
        return originalFetch.apply(this, args);
      }
    }

    return originalFetch.apply(this, args);
  };
}

function createClaimButton() {
  const button = document.createElement("button");
  button.id = "talename-claim-btn";
  button.textContent = "Claim on TaleName";
  button.style.cssText = `
    background: #4a90e2;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    margin: 16px 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  button.addEventListener("mouseenter", () => {
    button.style.background = "#357abd";
  });

  button.addEventListener("mouseleave", () => {
    button.style.background = "#4a90e2";
  });

  button.addEventListener("click", async () => {
    if (window.location.hostname !== HYTABLE_DOMAIN) {
      Modal.show("Error", "This extension only works on accounts.hytale.com");
      return;
    }

    if (window.location.protocol !== "https:") {
      Modal.show("Error", "This extension requires a secure HTTPS connection");
      return;
    }

    button.disabled = true;
    button.textContent = "Loading...";
    button.style.opacity = "0.6";

    try {
      let reservations = [];
      let proofSource = "hytale-api";

      try {
        const apiUrl = `https://${HYTABLE_DOMAIN}${API_ENDPOINT}`;
        
        if (verifySSL(apiUrl)) {
          const response = await fetch(apiUrl, {
            method: "GET",
            credentials: "include",
            headers: {
              accept: "*/*",
            },
          });

          if (response.ok) {
            const apiReservations = await response.json();
            if (Array.isArray(apiReservations) && apiReservations.length > 0) {
              reservations = apiReservations.filter((r) => {
                return r && typeof r === "object" && r.username && typeof r.username === "string" && r.reservedUntil;
              });
            }
          }
        }
      } catch (apiError) {
        console.error("TaleName: API fetch failed", apiError);
        Modal.show("Error", "Failed to fetch reservations from Hytale API. Please ensure you're logged in to Hytale and try refreshing the page.");
        button.disabled = false;
        button.textContent = "Claim on TaleName";
        button.style.opacity = "1";
        return;
      }

      if (reservations.length === 0) {
        try {
          const gameProfileApiUrl = `https://${HYTABLE_DOMAIN}${GAME_PROFILE_API_ENDPOINT}`;
          
          if (verifySSL(gameProfileApiUrl)) {
            const gameProfileResponse = await fetch(gameProfileApiUrl, {
              method: "GET",
              credentials: "include",
              headers: {
                accept: "*/*",
              },
            });

            if (gameProfileResponse.ok) {
              const gameProfiles = await gameProfileResponse.json();
              if (Array.isArray(gameProfiles) && gameProfiles.length > 0) {
                const validProfiles = gameProfiles.filter((p) => {
                  return p && typeof p === "object" && p.username && typeof p.username === "string";
                });
                
                if (validProfiles.length > 0) {
                  reservations = validProfiles.map((p) => {
                    const reservation = {
                      username: p.username.toLowerCase().trim()
                    };
                    if (p.uuid) reservation.uuid = p.uuid;
                    if (p.createdAt) reservation.createdAt = p.createdAt;
                    if (p.nextNameChangeAt) reservation.nextNameChangeAt = p.nextNameChangeAt;
                    if (p.entitlements) reservation.entitlements = p.entitlements;
                    return reservation;
                  });
                  proofSource = "game-profiles";
                }
              }
            }
          }
        } catch (gameProfileError) {
          console.error("TaleName: Game profile API fetch failed", gameProfileError);
        }
      }

      if (reservations.length === 0) {
        const domUsernames = extractUsernamesFromDOM();
        if (domUsernames && domUsernames.length > 0) {
          reservations = domUsernames;
          proofSource = "game-profiles-dom";
        }
      }

      if (reservations.length === 0) {
        Modal.show("No Usernames", "No reserved usernames or game profiles found. Please reserve a username on Hytale or create a game profile first.");
        button.disabled = false;
        button.textContent = "Claim on TaleName";
        button.style.opacity = "1";
        return;
      }

      const validReservations = reservations.filter((r) => {
        return r && typeof r === "object" && r.username && typeof r.username === "string";
      });

      if (validReservations.length === 0) {
        Modal.show("Error", "No valid usernames found.");
        button.disabled = false;
        button.textContent = "Claim on TaleName";
        button.style.opacity = "1";
        return;
      }

      const proofData = {
        reservations: validReservations,
        timestamp: Date.now(),
        source: proofSource
      };

      console.log("TaleName: Sending proof data:", JSON.stringify(proofData, null, 2));

      browserAPI.runtime.sendMessage(
        {
          action: "openClaimDialog",
          reservations: validReservations,
          proof: proofData,
        },
        (response) => {
          if (browserAPI.runtime.lastError) {
            const errorMessage = browserAPI.runtime.lastError.message || '';
            const isConnectionError = errorMessage.includes('Could not establish connection') || 
                                     errorMessage.includes('Receiving end does not exist') ||
                                     errorMessage.includes('Extension context invalidated');
            
            if (!isConnectionError) {
              console.error("TaleName [Content]:", errorMessage);
            }
            
            if (!isConnectionError) {
              Modal.show("Authentication Required", "Please log in to TaleName via the extension popup first.");
            }
            button.disabled = false;
            button.textContent = "Claim on TaleName";
            button.style.opacity = "1";
            return;
          }
          if (response && !response.success) {
            Modal.show("Authentication Required", "Please log in to TaleName via the extension popup first.");
          } else {
            Modal.show("Select Username", "Please open the TaleName extension popup to select which username to claim.");
          }
          button.disabled = false;
          button.textContent = "Claim on TaleName";
          button.style.opacity = "1";
        }
      );
    } catch (error) {
      console.error("TaleName: Failed to fetch reservations", error);
      Modal.show("Error", "Failed to fetch reserved usernames. Please make sure you're logged in to Hytale and on the correct page.");
      button.disabled = false;
      button.textContent = "Claim on TaleName";
      button.style.opacity = "1";
    }
  });

  return button;
}

function extractUsernamesFromDOM() {
  const usernames = [];
  
  const oldLayout = document.querySelector('#username-reservations');
  if (oldLayout) {
    const usernameElements = oldLayout.querySelectorAll('div.bg-black\\/40 p.font-semibold');
    usernameElements.forEach((element) => {
      const username = element.textContent.trim();
      if (username) {
        usernames.push({ username });
      }
    });
  }

  const newLayout = document.querySelector('#game-profiles');
  if (newLayout) {
    const gameProfiles = newLayout.querySelectorAll('.game-profile');
    gameProfiles.forEach((profile) => {
      let usernameElement = profile.querySelector('p.font-semibold.text-xl');
      if (!usernameElement) {
        const allPs = profile.querySelectorAll('p');
        for (const p of allPs) {
          if (p.classList.contains('font-semibold') || p.classList.contains('text-xl')) {
            usernameElement = p;
            break;
          }
        }
      }
      
      if (usernameElement) {
        const username = usernameElement.textContent.trim();
        if (username && username.length > 0 && username.length < 50) {
          const profileData = { username: username.toLowerCase().trim() };
          
          const allSpans = profile.querySelectorAll('span');
          for (const span of allSpans) {
            const classes = span.className || '';
            const text = span.textContent.trim();
            if (classes.includes('font-bold') && text && text.length > 0 && text.length < 50 && !text.includes(':')) {
              profileData.entitlements = [text];
              break;
            }
          }
          
          const allText = profile.textContent || '';
          const createdMatch = allText.match(/Created[:\s]+([^a-z]+(?:at\s+)?[^a-z]+)/i);
          if (createdMatch && createdMatch[1]) {
            try {
              const createdDate = new Date(createdMatch[1].trim());
              if (!isNaN(createdDate.getTime())) {
                profileData.createdAt = createdDate.toISOString();
              }
            } catch (e) {
            }
          }
          
          const cooldownMatch = allText.match(/cooldown[:\s]+([^a-z]+(?:at\s+)?[^a-z]+)/i);
          if (cooldownMatch && cooldownMatch[1]) {
            try {
              const cooldownDate = new Date(cooldownMatch[1].trim());
              if (!isNaN(cooldownDate.getTime())) {
                profileData.nextNameChangeAt = cooldownDate.toISOString();
              }
            } catch (e) {
            }
          }
          
          usernames.push(profileData);
        }
      }
    });
  }

  return usernames;
}

function waitForSelector(selector, container = document.body, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = container.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = container.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Selector ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

function injectButton() {
  if (document.getElementById("talename-claim-btn")) {
    return;
  }

  const oldLayout = document.querySelector('#username-reservations');
  if (oldLayout) {
    const button = createClaimButton();
    oldLayout.parentElement.insertBefore(button, oldLayout.nextSibling);
    return;
  }

  const accountLayoutSlot = document.querySelector('#account-layout-slot');
  if (!accountLayoutSlot) {
    setTimeout(injectButton, 500);
    return;
  }

  waitForSelector('#game-profiles', accountLayoutSlot, 10000)
    .then((gameProfiles) => {
      if (document.getElementById("talename-claim-btn")) {
        return;
      }
      
      const button = createClaimButton();
      const targetContainer = gameProfiles.parentElement;
      if (targetContainer) {
        targetContainer.insertBefore(button, gameProfiles.nextSibling);
      } else {
        gameProfiles.parentNode.insertBefore(button, gameProfiles.nextSibling);
      }
    })
    .catch(() => {
      setTimeout(injectButton, 1000);
    });
}

function init() {
  if (window.location.hostname !== HYTABLE_DOMAIN || !window.location.pathname.startsWith("/profiles")) {
    return;
  }

  injectModalStyles();
  injectModalHTML();
  interceptFetch();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else {
    injectButton();
  }

  let injectTimeout = null;
  const observer = new MutationObserver(() => {
    if (!document.getElementById("talename-claim-btn")) {
      if (injectTimeout) {
        clearTimeout(injectTimeout);
      }
      injectTimeout = setTimeout(() => {
        injectButton();
      }, 300);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

init();

  browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "claimSuccess") {
    const button = document.getElementById("talename-claim-btn");
    if (button) {
      button.textContent = "Claimed!";
      button.style.background = "#22c55e";
      button.style.color = "white";
      setTimeout(() => {
        button.textContent = "Claim on TaleName";
        button.style.background = "#4a90e2";
        button.style.color = "white";
      }, 3000);
    }
  }
  return true;
});

