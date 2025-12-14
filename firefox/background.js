if (typeof importScripts !== 'undefined') {
  try {
    importScripts('browser-api.js');
  } catch (error) {
    console.error("TaleName [Background]: Failed to load browser-api.js via importScripts", error);
    throw error;
  }
} else {
  console.log("TaleName [Background]: importScripts not available (running in background page context, browser-api.js should be loaded via manifest)");
}

if (typeof browserAPI === 'undefined') {
  console.error("TaleName [Background]: browserAPI is not defined. Make sure browser-api.js is loaded before background.js");
  throw new Error("browserAPI is not available");
}

const API_BASE_URL = "https://api.talename.net";

const isFirefox = typeof browser !== 'undefined' && browser.runtime && !browser.runtime.getBrowserInfo === undefined;
console.log(`TaleName [Background]: Service worker initialized at ${new Date().toISOString()}`);
console.log(`TaleName [Background]: Browser API available, Firefox: ${isFirefox}`);
console.log(`TaleName [Background]: API Base URL: ${API_BASE_URL}`);

async function getCookiesForDomain(domain) {
  try {
    const allCookies = [];
    
    const urlsToCheck = [
      `https://${domain}`,
      `https://api.${domain}`,
      `https://www.${domain}`
    ];
    
    for (const url of urlsToCheck) {
      try {
        const cookies = await browserAPI.cookies.getAll({ url: url });
        if (cookies && cookies.length > 0) {
          allCookies.push(...cookies);
        }
      } catch (e) {
        try {
          const cookies = await browserAPI.cookies.getAll({ domain: url.replace('https://', '') });
          if (cookies && cookies.length > 0) {
            allCookies.push(...cookies);
          }
        } catch (e2) {
          console.log("TaleName: Could not get cookies for", url, e2);
        }
      }
    }
    
    if (allCookies.length > 0) {
      const uniqueCookies = new Map();
      allCookies.forEach(cookie => {
        if (!uniqueCookies.has(cookie.name)) {
          uniqueCookies.set(cookie.name, cookie);
        }
      });
      const cookieString = Array.from(uniqueCookies.values())
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
      console.log("TaleName: Found cookies for", domain, uniqueCookies.size, "unique cookies");
      return cookieString;
    }
    console.log("TaleName: No cookies found for", domain);
    return null;
  } catch (error) {
    console.error("TaleName: Error getting cookies", error);
    return null;
  }
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const timestamp = new Date().toISOString();
  
  console.log(`TaleName [Background] [${timestamp}]: Making API request to ${url}`);
  
  try {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const cookieHeader = await getCookiesForDomain("talename.net");
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
      console.log(`TaleName [Background] [${timestamp}]: Including cookies in request (${cookieHeader.split(';').length} cookies)`);
    } else {
      console.log(`TaleName [Background] [${timestamp}]: No cookies found for talename.net`);
    }

    const fetchOptions = {
      method: options.method || "GET",
      credentials: "include",
      headers: headers,
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    console.log(`TaleName [Background] [${timestamp}]: Fetch options:`, JSON.stringify({
      method: fetchOptions.method,
      url: url,
      hasCookies: !!cookieHeader,
      hasBody: !!fetchOptions.body
    }));

    const response = await fetch(url, fetchOptions);
    const responseTimestamp = new Date().toISOString();
    
    console.log(`TaleName [Background] [${responseTimestamp}]: Response status ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`TaleName [Background] [${responseTimestamp}]: API error:`, error);
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204 || response.headers.get("content-length") === "0") {
      console.log(`TaleName [Background] [${responseTimestamp}]: Empty response (204)`);
      return "";
    }

    const data = await response.json();
    console.log(`TaleName [Background] [${responseTimestamp}]: API request successful`);
    return data;
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`TaleName [Background] [${errorTimestamp}]: Fetch error:`, error.message, error);
    throw error;
  }
}

const api = {

  async getCurrentUser() {
    return apiRequest("/auth/me");
  },

  async claimUsernameFromExtension(username, proof) {
    return apiRequest("/api/username/claim-from-extension", {
      method: "POST",
      body: JSON.stringify({ username, proof }),
    });
  },
};

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const timestamp = new Date().toISOString();
  console.log(`TaleName [Background] [${timestamp}]: Received message - Action: ${request.action}`);

  if (request.action === "getUser") {
    const timestamp = new Date().toISOString();
    console.log(`TaleName [Background] [${timestamp}]: Getting user from API`);
    
    api.getCurrentUser()
      .then((user) => {
        const successTimestamp = new Date().toISOString();
        console.log(`TaleName [Background] [${successTimestamp}]: getUser success - User: ${user.username || 'unknown'}, Email: ${user.email || 'unknown'}`);
        browserAPI.storage.local.set({ user, authenticated: true });
        sendResponse({ success: true, user });
      })
      .catch((error) => {
        const errorTimestamp = new Date().toISOString();
        console.error(`TaleName [Background] [${errorTimestamp}]: getUser error: ${error.message}`);
        browserAPI.storage.local.remove(["user", "authenticated"]);
        sendResponse({ success: false });
      });
    return true;
  }

  if (request.action === "claimUsername") {
    api.claimUsernameFromExtension(request.username, request.proof)
      .then((result) => {
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "openClaimDialog") {
    browserAPI.storage.local.get(["user", "authenticated"], (data) => {
      if (!data.authenticated || !data.user) {
        sendResponse({ success: false, error: "Not authenticated" });
        return;
      }
      browserAPI.storage.local.set({ 
        pendingReservations: request.reservations,
        pendingProof: request.proof
      });
      try {
        browserAPI.runtime.sendMessage({
          action: "showClaimDialog",
          reservations: request.reservations,
          proof: request.proof
        }).catch((error) => {
          const errorMessage = error.message || '';
          const isConnectionError = errorMessage.includes('Could not establish connection') || 
                                   errorMessage.includes('Receiving end does not exist') ||
                                   errorMessage.includes('Extension context invalidated');
          
          if (!isConnectionError) {
            console.log(`TaleName [Background]: Could not send showClaimDialog (popup may not be open): ${errorMessage}`);
          }
        });
      } catch (e) {
        const errorMessage = e.message || '';
        const isConnectionError = errorMessage.includes('Could not establish connection') || 
                                 errorMessage.includes('Receiving end does not exist') ||
                                 errorMessage.includes('Extension context invalidated');
        
        if (!isConnectionError) {
          console.log(`TaleName [Background]: Exception sending showClaimDialog: ${errorMessage}`);
        }
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === "reservationsDetected") {
    browserAPI.storage.local.set({ 
      pendingReservations: request.reservations,
      pendingProof: request.proof
    });
    return false;
  }

  return false;
});

browserAPI.runtime.onInstalled.addListener(() => {
  browserAPI.storage.local.get(["authenticated"], (data) => {
    if (data.authenticated) {
      api.getCurrentUser()
        .then((user) => {
          browserAPI.storage.local.set({ user });
        })
        .catch(() => {
          browserAPI.storage.local.remove(["user", "authenticated"]);
        });
    }
  });
});

