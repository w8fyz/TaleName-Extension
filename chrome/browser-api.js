const browserAPI = (() => {
  if (typeof browser !== 'undefined' && browser.runtime) {
    const api = {
      runtime: {
        onMessage: {
          addListener: (callback) => {
            browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
              const result = callback(message, sender, sendResponse);
              if (result === true) {
                return true;
              }
              if (result && typeof result.then === 'function') {
                result.then(sendResponse).catch((error) => {
                  sendResponse({ success: false, error: error.message });
                });
                return true;
              }
              return false;
            });
          }
        },
        sendMessage: (message, callback) => {
          if (callback) {
            browser.runtime.sendMessage(message)
              .then((response) => {
                api.runtime.lastError = null;
                callback(response);
              })
              .catch((error) => {
                const errorMessage = error.message || 'Unknown error';
                const isConnectionError = errorMessage.includes('Could not establish connection') || 
                                         errorMessage.includes('Receiving end does not exist') ||
                                         errorMessage.includes('Extension context invalidated');
                
                if (!isConnectionError) {
                  console.error("TaleName [browser-api]: Runtime sendMessage error:", errorMessage);
                }
                
                api.runtime.lastError = { message: errorMessage };
                if (error.message) {
                  const lastError = { message: errorMessage };
                  callback({ success: false, error: lastError });
                } else {
                  callback({ success: false });
                }
              });
          } else {
            return browser.runtime.sendMessage(message).catch((error) => {
              const errorMessage = error.message || 'Unknown error';
              const isConnectionError = errorMessage.includes('Could not establish connection') || 
                                       errorMessage.includes('Receiving end does not exist') ||
                                       errorMessage.includes('Extension context invalidated');
              
              if (!isConnectionError) {
                console.error("TaleName [browser-api]: Runtime sendMessage error:", errorMessage);
              }
              throw error;
            });
          }
        },
        onInstalled: browser.runtime.onInstalled,
        getURL: browser.runtime.getURL,
        lastError: null
      },
      storage: {
        local: {
          get: (keys, callback) => {
            if (callback) {
              browser.storage.local.get(keys).then(callback);
            } else {
              return browser.storage.local.get(keys);
            }
          },
          set: (items, callback) => {
            if (callback) {
              browser.storage.local.set(items).then(() => {
                if (callback) callback();
              }).catch((error) => {
                if (callback) callback();
              });
            } else {
              return browser.storage.local.set(items);
            }
          },
          remove: (keys, callback) => {
            if (callback) {
              browser.storage.local.remove(keys).then(() => {
                if (callback) callback();
              }).catch((error) => {
                if (callback) callback();
              });
            } else {
              return browser.storage.local.remove(keys);
            }
          }
        }
      },
      tabs: {
        create: (options, callback) => {
          if (callback) {
            browser.tabs.create(options).then((tab) => {
              callback(tab);
            });
          } else {
            return browser.tabs.create(options);
          }
        },
        query: (queryInfo, callback) => {
          if (callback) {
            browser.tabs.query(queryInfo).then(callback);
          } else {
            return browser.tabs.query(queryInfo);
          }
        },
        sendMessage: (tabId, message, callback) => {
          if (callback) {
            browser.tabs.sendMessage(tabId, message)
              .then((response) => {
                callback(response);
              })
              .catch((error) => {
                const errorMessage = error.message || 'Unknown error';
                const isConnectionError = errorMessage.includes('Could not establish connection') || 
                                         errorMessage.includes('Receiving end does not exist') ||
                                         errorMessage.includes('Extension context invalidated');
                
                if (!isConnectionError) {
                  console.error("TaleName [browser-api]: Tabs sendMessage error:", errorMessage);
                }
                
                if (error.message) {
                  const lastError = { message: errorMessage };
                  callback({ success: false, error: lastError });
                } else {
                  callback({ success: false });
                }
              });
          } else {
            return browser.tabs.sendMessage(tabId, message).catch((error) => {
              const errorMessage = error.message || 'Unknown error';
              const isConnectionError = errorMessage.includes('Could not establish connection') || 
                                       errorMessage.includes('Receiving end does not exist') ||
                                       errorMessage.includes('Extension context invalidated');
              
              if (!isConnectionError) {
                console.error("TaleName [browser-api]: Tabs sendMessage error:", errorMessage);
              }
              throw error;
            });
          }
        }
      },
      cookies: {
        getAll: (details, callback) => {
          if (callback) {
            browser.cookies.getAll(details)
              .then((cookies) => {
                callback(cookies);
              })
              .catch((error) => {
                console.error("TaleName: Error getting cookies", error);
                callback([]);
              });
          } else {
            return browser.cookies.getAll(details);
          }
        }
      }
    };
    return api;
  } else if (typeof chrome !== 'undefined' && chrome.runtime) {
    return chrome;
  } else {
    throw new Error('Browser extension APIs not available');
  }
})();
