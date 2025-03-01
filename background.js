chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "askGemini") {
      chrome.storage.local.get("geminiAPIKey", async (data) => {
          const apiKey = data.geminiAPIKey;
          if (!apiKey) {
              sendResponse({ error: "API key is missing. Please set it in the extension settings." });
              return;
          }

          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateText?key=${apiKey}`;

          try {
              const response = await fetch(apiUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ prompt: { text: request.query }, temperature: 0.7 }),
              });

              if (!response.ok) throw new Error(`Error ${response.status}`);

              const data = await response.json();
              if (data?.candidates?.length > 0) {
                  sendResponse({ reply: data.candidates[0].output });
              } else {
                  sendResponse({ reply: "Sorry, I couldn't understand that." });
              }
          } catch (error) {
              console.error("API Error:", error);
              sendResponse({ error: "Error processing request. Try again later." });
          }
      });

      return true; // Keeps the message channel open for async response
  }
});
