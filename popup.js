document.addEventListener("DOMContentLoaded", () => {
    const apiKeyInput = document.getElementById("apiKeyInput");
    const saveButton = document.getElementById("saveButton");
    const apiForm = document.getElementById("apiForm");

    // Check if API key already exists
    chrome.storage.local.get("geminiAPIKey", (data) => {
        if (data.geminiAPIKey) {
            apiForm.style.display = "none"; // Hide API input form
        }
    });

    // Save API key when user enters it
    saveButton.addEventListener("click", () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ geminiAPIKey: apiKey }, () => {
                alert("API Key saved successfully!");
                apiForm.style.display = "none"; // Hide input after saving
            });
        } else {
            alert("Please enter a valid API Key.");
        }
    });
});
