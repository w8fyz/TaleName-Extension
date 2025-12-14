let currentUser = null;
let reservations = null;
let authPollInterval = null;

const Modal = {
  show(title, message, onClose = null) {
    const overlay = document.getElementById("modal-overlay");
    const titleEl = document.getElementById("modal-title");
    const messageEl = document.getElementById("modal-message");
    const okBtn = document.getElementById("modal-ok");

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


function showSuccess(message) {
  const successDiv = document.createElement("div");
  successDiv.className = "success show";
  successDiv.textContent = message;
  const container = document.querySelector(".container");
  container.insertBefore(successDiv, container.firstChild);
  setTimeout(() => {
    successDiv.remove();
  }, 3000);
}


function isHytaleProfilesPage(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === "accounts.hytale.com" && 
           (urlObj.pathname.startsWith("/profiles") || urlObj.pathname === "/");
  } catch {
    return false;
  }
}

function updateUI(currentTabUrl = null) {
  const loading = document.getElementById("loading");
  const authSection = document.getElementById("auth-section");
  const userSection = document.getElementById("user-section");
  const hytaleAccessSection = document.getElementById("hytale-access-section");

  if (loading) loading.style.display = "none";

  const isOnHytaleProfiles = isHytaleProfilesPage(currentTabUrl);

  if (!isOnHytaleProfiles) {
    if (authSection) authSection.classList.remove("active");
    if (userSection) userSection.classList.remove("active");
    if (hytaleAccessSection) hytaleAccessSection.classList.add("active");
    if (!authPollInterval) {
      startAuthPolling();
    }
    return;
  }

  if (hytaleAccessSection) hytaleAccessSection.classList.remove("active");

  if (currentUser) {
    if (authSection) authSection.classList.remove("active");
    if (userSection) userSection.classList.add("active");
    const usernameEl = document.getElementById("user-username");
    const emailEl = document.getElementById("user-email");
    if (usernameEl) usernameEl.textContent = `Username: ${currentUser.username}`;
    if (emailEl) emailEl.textContent = `Email: ${currentUser.email}`;
    if (!authPollInterval) {
      startAuthPolling();
    }
  } else {
    if (authSection) authSection.classList.add("active");
    if (userSection) userSection.classList.remove("active");
    if (!authPollInterval) {
      startAuthPolling();
    }
  }
}

function checkAuth(currentTabUrl = null) {
  const timestamp = new Date().toISOString();
  console.log(`TaleName [Popup] [${timestamp}]: Checking auth status`);
  browserAPI.runtime.sendMessage({ action: "getUser" }, (response) => {
    const hadUser = currentUser !== null;
    if (response && response.success && response.user) {
      const wasNewUser = !hadUser;
      currentUser = response.user;
      console.log(`TaleName [Popup] [${new Date().toISOString()}]: User authenticated - ${currentUser.username}${wasNewUser ? ' (NEW)' : ''}`);
    } else {
      const wasLoggedOut = hadUser;
      currentUser = null;
      if (wasLoggedOut) {
        console.log(`TaleName [Popup] [${new Date().toISOString()}]: User logged out`);
      } else {
        console.log(`TaleName [Popup] [${new Date().toISOString()}]: User not authenticated`);
      }
    }
    if (!currentTabUrl) {
      browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        updateUI(tabs[0]?.url || null);
      });
    } else {
      updateUI(currentTabUrl);
    }
    checkPendingReservations();
  });
}

function checkPendingReservations() {
  if (!currentUser) {
    return;
  }
  browserAPI.storage.local.get(["pendingReservations", "pendingProof"], (data) => {
    if (data.pendingReservations && currentUser) {
      showClaimDialog(data.pendingReservations, data.pendingProof);
      chrome.storage.local.remove(["pendingReservations", "pendingProof"]);
    }
  });
}

function startAuthPolling() {
  if (authPollInterval) {
    return;
  }
  console.log("TaleName [Popup]: Starting continuous auth polling (every 1 second)");
  authPollInterval = setInterval(() => {
    console.log("TaleName [Popup]: Polling - checking auth status");
    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      checkAuth(tabs[0]?.url || null);
    });
  }, 1000);
}

function stopAuthPolling() {
  if (authPollInterval) {
    console.log("TaleName: Stopping auth polling");
    clearInterval(authPollInterval);
    authPollInterval = null;
  }
}

function handleLogin() {
  browserAPI.tabs.create({ url: "https://talename.net/login" });
}

function handleAccessHytale() {
  browserAPI.tabs.create({ url: "https://accounts.hytale.com/profiles" });
}


function claimUsername(username, proof) {
  if (!currentUser) {
    Modal.show("Authentication Required", "Please log in to TaleName first.");
    handleLogin();
    return;
  }

  if (!reservations || !Array.isArray(reservations)) {
    Modal.show("Error", "Reservation data not available. Please try again from the Hytale page.");
    return;
  }

  if (!proof || !proof.timestamp) {
    Modal.show("Error", "Proof data is invalid. Please try again from the Hytale page.");
    return;
  }

  browserAPI.runtime.sendMessage(
    {
      action: "claimUsername",
      username,
      proof: proof,
    },
    (response) => {
      if (response && response.success) {
        showSuccess(`Successfully claimed ${username}!`);
        browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            browserAPI.tabs.sendMessage(tabs[0].id, {
              action: "claimSuccess",
              username,
            }).catch((error) => {
              const errorMessage = error.message || '';
              const isConnectionError = errorMessage.includes('Could not establish connection') || 
                                       errorMessage.includes('Receiving end does not exist') ||
                                       errorMessage.includes('Extension context invalidated');
              
              if (!isConnectionError) {
                console.error("TaleName [Popup]: Failed to send claimSuccess message:", errorMessage);
              }
            });
          }
        });
        document.getElementById("claim-dialog").classList.remove("active");
        reservations = null;
      } else {
        Modal.show("Error", response?.error || "Failed to claim username");
      }
    }
  );
}

function showClaimDialog(reservationsData, proofData) {
  if (!reservationsData || !Array.isArray(reservationsData) || reservationsData.length === 0) {
    return;
  }

  reservations = reservationsData;
  const dialog = document.getElementById("claim-dialog");
  const list = document.getElementById("reservations-list");
  
  if (!dialog || !list) {
    return;
  }

  list.innerHTML = "";

  reservationsData.forEach((reservation) => {
    const item = document.createElement("div");
    item.className = "reservation-item";
    const username = reservation.username || "Unknown";
    const reservedUntil = reservation.reservedUntil
      ? new Date(reservation.reservedUntil).toLocaleDateString()
      : "N/A";

    item.innerHTML = `
      <div>
        <div class="username">${username}</div>
        <div class="reserved-until">Reserved until: ${reservedUntil}</div>
      </div>
      <button class="claim-btn-small" data-username="${username}">Claim</button>
    `;

    const claimBtn = item.querySelector(".claim-btn-small");
    claimBtn.addEventListener("click", () => {
      claimBtn.disabled = true;
      claimBtn.textContent = "Claiming...";
      claimUsername(username, proofData);
    });

    list.appendChild(item);
  });

  dialog.classList.add("active");
  const userSection = document.getElementById("user-section");
  if (userSection) {
    userSection.style.display = "block";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("TaleName [Popup]: Popup loaded, initializing...");
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTabUrl = tabs[0]?.url || null;
    console.log(`TaleName [Popup]: Current tab URL: ${currentTabUrl || 'unknown'}`);
    checkAuth(currentTabUrl);
    
    setTimeout(() => {
      if (!authPollInterval) {
        console.log("TaleName [Popup]: Starting continuous polling after initial check");
        startAuthPolling();
      }
    }, 500);
  });

  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document.getElementById("access-hytale-btn").addEventListener("click", handleAccessHytale);

  window.addEventListener("beforeunload", () => {
    stopAuthPolling();
  });

  browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showClaimDialog") {
      const proof = request.proof || request.proofData;
      if (currentUser && request.reservations) {
        showClaimDialog(request.reservations, proof);
        browserAPI.storage.local.remove(["pendingReservations", "pendingProof"]);
      } else if (!currentUser) {
        browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          checkAuth(tabs[0]?.url || null);
          setTimeout(() => {
            if (currentUser && request.reservations) {
              showClaimDialog(request.reservations, proof);
              browserAPI.storage.local.remove(["pendingReservations", "pendingProof"]);
            } else if (!currentUser) {
              browserAPI.storage.local.get(["pendingReservations", "pendingProof"], (data) => {
                if (data.pendingReservations && currentUser) {
                  showClaimDialog(data.pendingReservations, data.pendingProof);
                  browserAPI.storage.local.remove(["pendingReservations", "pendingProof"]);
                }
              });
            }
          }, 500);
        });
      }
    }
    return true;
  });
});

