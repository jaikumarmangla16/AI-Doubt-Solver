// Ensure the logo is inserted and the user can click on it
function insertLogo() {
    const problemHeadingElement = document.querySelector('.fw-bolder.problem_heading.fs-4');
    
    if (problemHeadingElement && !document.querySelector('.ai-logo')) {
        const logoImage = document.createElement('img');
        logoImage.src = chrome.runtime.getURL('assets/icon.png');
        logoImage.alt = 'AI Doubt Solver Logo';
        logoImage.classList.add('ai-logo');

        problemHeadingElement.parentElement.appendChild(logoImage);

        logoImage.addEventListener('click', () => {
            chrome.storage.local.get("geminiAPIKey", (data) => {
                if (!data.geminiAPIKey) {
                    alert("Please enter your API key in the extension popup.");
                } else {
                    openChatBox();
                }
            });
        });
    }
}

// Function to monitor DOM changes
function observeDOMChanges() {
    const targetNode = document.body;
    const config = { childList: true, subtree: true };

    const observer = new MutationObserver(() => {
        insertLogo();
        
        // Track problem changes
        const currentProblem = getProblemDetails();
        const chatBox = document.querySelector('.chat-box');
        
        if (chatBox && chatBox.dataset.currentProblemId !== currentProblem.id) {
            // If the problem changed while chat box is open, close it
            closeChatBox();
        }
    });
    
    observer.observe(targetNode, config);
}

// Initialize
insertLogo();
observeDOMChanges();
// Monitor URL changes to close chatbox when navigating away
window.addEventListener('beforeunload', function() {
    closeChatBox();
});

// Also listen for SPA navigation events
let lastUrl = location.href; 
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        closeChatBox();
    }
}).observe(document, {subtree: true, childList: true});

// Function to close the chat box
function closeChatBox() {
    const chatBox = document.querySelector('.chat-box');
    if (chatBox && chatBox.style.display !== 'none') {
        chatBox.style.display = 'none';
    }
}

// Function to fetch problem details (use problem's title or ID)
function getProblemDetails() {
    const problemContainer = document.querySelector('.coding_leftside_scroll__CMpky.pb-5');
    const problemTitle = document.querySelector('.fw-bolder.problem_heading.fs-4');
    
    // Get problem ID or title for unique identification
    const problemId = problemTitle ? problemTitle.innerText.trim() : "unknown-problem";
    
    // Get user's code from the editor
    const userCode = getUserCodeFromEditor();
    
    return {
        id: problemId,
        details: problemContainer ? problemContainer.innerText.trim() : "Problem details not found.",
        userCode: userCode
    };
}

// New function to get user's code from the editor
function getUserCodeFromEditor() {
    // Check if we're on a maang.in problem page
    if (!window.location.href.includes('maang.in/problem/')) {
        return '';
    }
    
    // Try to get the code editor content
    // This selector needs to be updated based on the actual structure of maang.in
    const codeEditorElement = document.querySelector('.monaco-editor');
    
    if (!codeEditorElement) {
        return '';
    }
    
    // Try different approaches to get the code
    // First try: monaco editor model if it's accessible
    if (window.monaco && window.monaco.editor) {
        const editors = window.monaco.editor.getEditors();
        if (editors && editors.length > 0) {
            return editors[0].getValue() || '';
        }
    }
    
    // Second try: textarea or pre element within the editor
    const codeElement = codeEditorElement.querySelector('textarea') || codeEditorElement.querySelector('pre');
    if (codeElement) {
        return codeElement.value || codeElement.innerText || '';
    }
    
    // If we can't get it dynamically, try checking local storage
    // Many coding platforms save current code in localStorage
    try {
        const storageKeys = Object.keys(localStorage);
        for (const key of storageKeys) {
            if (key.includes('code') || key.includes('editor')) {
                const storedCode = localStorage.getItem(key);
                if (storedCode && typeof storedCode === 'string' && storedCode.length > 10) {
                    return storedCode;
                }
            }
        }
    } catch (e) {
        console.error("Error accessing localStorage:", e);
    }
    
    return '';
}

// Function to open the chat overlay
function openChatBox() {
    let chatBox = document.querySelector('.chat-box');
    
    // Get current problem before creating chat box
    const currentProblem = getProblemDetails();
    
    // Ensure chatBox is created if it doesn't exist
    if (!chatBox) {
        chatBox = createChatBox();  // This creates and returns the chatBox
        document.body.appendChild(chatBox);  // Append it to the body
    }
    
    // Set the current problem ID before displaying the chat box
    chatBox.dataset.currentProblemId = currentProblem.id;
    
    // Display the chat box
    chatBox.style.display = 'flex';
    
    // Load chat history for this problem
    loadChatHistory(currentProblem.id);
    
    // Show greeting message if it's a new chat
    chrome.storage.local.get(['chatHistory'], (result) => {
        const chatHistory = result.chatHistory || {};
        const problemHistory = chatHistory[currentProblem.id] || [];
        
        if (problemHistory.length === 0) {
            // Display greeting only for new chats
            const greeting = "👋 Hello! I'm your AI Doubt Solver. I'll help you understand this problem and provide hints. What would you like to know?";
            displayBotMessage(greeting);
            
            // Save the greeting message
            const botMessageObj = {
                role: 'bot',
                content: greeting,
                timestamp: new Date().toISOString()
            };
            saveChatMessage(botMessageObj, currentProblem.id);
        }
    });
}

// Function to create the chat box element
function createChatBox() {
    const chatBox = document.createElement('div');
    chatBox.classList.add('chat-box');
    chatBox.innerHTML = `
        <div class="chat-header">
            <span>AI Doubt Solver</span>
            <button class="export-btn">Export</button>
            <button class="clear-btn">Clear</button>
            <button class="close-btn">X</button>
        </div>
        <div class="chat-content">
            <div class="messages"></div>
            <input id="userQuery" type="text" placeholder="Ask your question..." />
            <button class="send-btn">Send</button>
        </div>
        <div class="resizer"></div>
    `;

    // Close button event listener
    chatBox.querySelector('.close-btn').addEventListener('click', () => {
        chatBox.style.display = 'none';
    });
    
    // Clear button event listener with confirmation
    chatBox.querySelector('.clear-btn').addEventListener('click', () => {
        if (confirm("Are you sure you want to clear this chat history?")) {
            clearChatHistory();
        }
    });
    
    // Export button event listener
    chatBox.querySelector('.export-btn').addEventListener('click', () => {
        exportChatHistory();
    });

    // Send button event listener
    chatBox.querySelector('.send-btn').addEventListener('click', async () => {
        const userQuery = document.querySelector('#userQuery').value.trim();
        if (userQuery) {
            // Always get the latest problem ID from the dataset
            const problemId = chatBox.dataset.currentProblemId;
            
            // Display user message in UI
            displayUserMessage(userQuery);
            
            const problem = getProblemDetails();
            
            // Get the entire chat history to provide context to the AI
            chrome.storage.local.get(['chatHistory'], async (result) => {
                const chatHistory = result.chatHistory || {};
                const previousChat = chatHistory[problemId] || [];
                
                // Convert chat history to format suitable for context
                const chatContext = previousChat.map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n');
                
                // Get response with context
                const response = await sendToGeminiAI(userQuery, problem.details, problem.userCode, chatContext);
                
                // Display bot message in UI with formatting
                displayFormattedBotMessage(response);
                
                // Check if the response should be filtered before saving
                if (!shouldFilterMessage(response)) {
                    // Save both user query and bot response
                    const userMessageObj = {
                        role: 'user',
                        content: userQuery,
                        timestamp: new Date().toISOString()
                    };
                    
                    const botMessageObj = {
                        role: 'bot',
                        content: response,
                        timestamp: new Date().toISOString()
                    };
                    
                    // Save both messages
                    saveChatMessages([userMessageObj, botMessageObj], problemId);
                }
            });
        }
    });

    // Enter key event listener for input
    chatBox.querySelector('#userQuery').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            chatBox.querySelector('.send-btn').click();
        }
    });

    makeChatBoxDraggable(chatBox);
    makeChatBoxResizable(chatBox);

    return chatBox;
}

// Enhanced filter function to check for messages that shouldn't be stored
function shouldFilterMessage(message) {
    const filterPatterns = [
        /error/i,
        /fail/i,
        /couldn't generate/i,
        /API key missing/i,
        /try again later/i,
        /sorry/i,
        /I can't answer this/i,
        /I can only help with coding problems/i,
        /can only help with/i,
        /not designed for/i,
        /not able to/i,
        /cannot provide/i,
        /I'm unable to/i,
        /I am unable to/i,
        /I don't have/i,
        /I do not have/i,
        /Please ask something about/i
    ];
    
    return filterPatterns.some(pattern => pattern.test(message));
}

// Save multiple chat messages to local storage (allows saving/skipping batches)
function saveChatMessages(messageObjs, problemId) {
    if (!Array.isArray(messageObjs) || messageObjs.length === 0) return;
    
    if (!problemId) {
        const chatBox = document.querySelector('.chat-box');
        problemId = chatBox ? chatBox.dataset.currentProblemId : getProblemDetails().id;
    }
    
    chrome.storage.local.get(['chatHistory'], (result) => {
        const chatHistory = result.chatHistory || {};
        
        if (!chatHistory[problemId]) {
            chatHistory[problemId] = [];
        }
        
        // Add all messages at once
        chatHistory[problemId] = [...chatHistory[problemId], ...messageObjs];
        
        chrome.storage.local.set({ chatHistory });
    });
}

// Legacy function for single message save (keeping for compatibility)
function saveChatMessage(messageObj, problemId) {
    if (!problemId) {
        const chatBox = document.querySelector('.chat-box');
        problemId = chatBox ? chatBox.dataset.currentProblemId : getProblemDetails().id;
    }
    
    chrome.storage.local.get(['chatHistory'], (result) => {
        const chatHistory = result.chatHistory || {};
        
        if (!chatHistory[problemId]) {
            chatHistory[problemId] = [];
        }
        
        chatHistory[problemId].push(messageObj);
        
        chrome.storage.local.set({ chatHistory });
    });
}

// Export chat history as a text file
// Fix the exportChatHistory function to show acknowledgment
function exportChatHistory() {
    const chatBox = document.querySelector('.chat-box');
    if (!chatBox) return;
    
    const problemId = chatBox.dataset.currentProblemId;
    const problem = getProblemDetails();
    
    chrome.storage.local.get(['chatHistory'], (result) => {
        const chatHistory = result.chatHistory || {};
        const problemHistory = chatHistory[problemId] || [];
        
        // Create formatted content for export
        let exportContent = `# AI Doubt Solver Chat - ${problemId}\n`;
        exportContent += `Date: ${new Date().toLocaleString()}\n\n`;
        exportContent += `## Problem Statement\n${problem.details}\n\n`;
        exportContent += `## Conversation\n\n`;
        
        problemHistory.forEach(message => {
            const formattedTime = new Date(message.timestamp).toLocaleTimeString();
            exportContent += `[${formattedTime}] ${message.role === 'user' ? 'You' : 'AI'}: ${message.content}\n\n`;
        });
        
        // Create and download the file
        const blob = new Blob([exportContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AI_Doubt_Solver_${problemId.replace(/\s+/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Show acknowledgment message
        const acknowledgment = "Chat history has been exported successfully!";
        displayBotMessage(acknowledgment);
    });
}
// Load chat history for a specific problem
function loadChatHistory(problemId) {
    const messagesDiv = document.querySelector('.chat-content .messages');
    if (!messagesDiv) return;
    
    messagesDiv.innerHTML = ''; // Clear existing messages
    
    chrome.storage.local.get(['chatHistory'], (result) => {
        const chatHistory = result.chatHistory || {};
        const problemHistory = chatHistory[problemId] || [];
        
        // Add a debug message to show current problem ID (optional, remove in production)
        console.log(`Loading chat history for problem: ${problemId}`);
        
        // Display messages in order
        problemHistory.forEach(message => {
            if (message.role === 'user') {
                displayUserMessage(message.content, false);
            } else if (message.role === 'bot') {
                displayFormattedBotMessage(message.content, false);
            }
        });
        
        // Scroll to bottom of chat
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// Display user's message
function displayUserMessage(message, scrollToBottom = true) {
    const messagesDiv = document.querySelector('.chat-content .messages');
    if (!messagesDiv) return;
    
    const userMessage = document.createElement('div');
    userMessage.classList.add('message', 'user-message');
    userMessage.textContent = message;
    messagesDiv.appendChild(userMessage);
    
    const inputField = document.querySelector('#userQuery');
    if (inputField) inputField.value = '';
    
    if (scrollToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}


// Function to copy text to clipboard
// Improved function to copy text to clipboard with better fallback
// Improved function to copy text to clipboard with proper formatting
function copyToClipboard(text) {
    // Clean the text - remove any HTML entities and preserve line breaks
    const cleanText = text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        // The following ensures line breaks are preserved in the clipboard
        .replace(/<br\s*\/?>/gi, '\n');
    
    // Try the modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(cleanText).then(() => {
            console.log('Text copied to clipboard successfully');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            fallbackCopyTextToClipboard(cleanText);
        });
    } else {
        // If the modern API is not available, use the fallback
        fallbackCopyTextToClipboard(cleanText);
    }
}

// Fallback method for copying text to clipboard
// Fallback method for copying text to clipboard
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Make the textarea invisible but ensure its content is fully selected
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        console.log(successful ? 'Successfully copied text' : 'Unable to copy text');
    } catch (err) {
        console.error('Fallback: Unable to copy', err);
    }
    
    document.body.removeChild(textArea);
}

// Enhanced helper function to format message with improved code blocks and copy buttons
// Enhanced helper function to format message with improved code blocks and copy buttons
// Enhanced function to format message with improved code blocks and copy buttons
function formatMessageWithCodeBlocks(message) {
    // First, escape HTML to prevent XSS
    let escapedMessage = message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Format code blocks (```code```) with proper syntax highlighting and copy button
    escapedMessage = escapedMessage.replace(/```([\s\S]*?)```/g, (match, code) => {
        // Generate a unique ID for this code block
        const codeBlockId = 'code-block-' + Math.random().toString(36).substr(2, 9);
        
        // Preserve line breaks in the code
        const formattedCode = code.trim();
        
        return `
        <div class="code-block-container">
            <div class="code-header">
                <button class="copy-code-btn" data-code-id="${codeBlockId}">Copy Code</button>
            </div>
            <pre class="code-block" id="${codeBlockId}"><code>${formattedCode}</code></pre>
        </div>`;
    });
    
    // Format inline code (`code`)
    escapedMessage = escapedMessage.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Format headers (# Header)
    escapedMessage = escapedMessage.replace(/^# (.+)$/gm, '<h3>$1</h3>');
    escapedMessage = escapedMessage.replace(/^## (.+)$/gm, '<h4>$1</h4>');
    escapedMessage = escapedMessage.replace(/^### (.+)$/gm, '<h5>$1</h5>');
    
    // Format bullet points
    escapedMessage = escapedMessage.replace(/^\* (.+)$/gm, '<li>$1</li>');
    escapedMessage = escapedMessage.replace(/^- (.+)$/gm, '<li>$1</li>');
    
    // Format numbered lists
    escapedMessage = escapedMessage.replace(/^(\d+)\. (.+)$/gm, '<li>$1. $2</li>');
    
    // Wrap lists in <ul> or <ol> tags
    let inList = false;
    const lines = escapedMessage.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('<li>')) {
            if (!inList) {
                lines[i] = '<ul>' + lines[i];
                inList = true;
            }
        } else if (inList) {
            lines[i-1] = lines[i-1] + '</ul>';
            inList = false;
        }
    }
    if (inList) {
        lines[lines.length-1] += '</ul>';
    }
    escapedMessage = lines.join('\n');
    
    // Convert line breaks to <br> (but not within code blocks)
    // First, temporarily replace <pre> content line breaks
    const preBlocks = [];
    escapedMessage = escapedMessage.replace(/<pre[\s\S]*?<\/pre>/g, (match) => {
        const index = preBlocks.length;
        preBlocks.push(match);
        return `__PRE_BLOCK_${index}__`;
    });
    
    // Now convert normal line breaks to <br>
    escapedMessage = escapedMessage.replace(/\n/g, '<br>');
    
    // Restore <pre> blocks
    preBlocks.forEach((block, index) => {
        escapedMessage = escapedMessage.replace(`__PRE_BLOCK_${index}__`, block);
    });
    
    return escapedMessage;
}



// For backward compatibility
// Enhanced function to display formatted bot messages with visible copy button and code
// Keep only one version of this function (removing the duplicate)
function displayFormattedBotMessage(message, scrollToBottom = true) {
    const messagesDiv = document.querySelector('.chat-content .messages');
    if (!messagesDiv) return;
    
    const botMessage = document.createElement('div');
    botMessage.classList.add('message', 'bot-message');
    
    // Convert markdown-style code blocks to HTML with copy buttons
    const formattedContent = formatMessageWithCodeBlocks(message);
    botMessage.innerHTML = formattedContent;
    
    messagesDiv.appendChild(botMessage);
    
    // Add click handlers for all copy buttons that were created
    const copyButtons = botMessage.querySelectorAll('.copy-code-btn');
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Get the code element using the data attribute
            const codeBlockId = this.getAttribute('data-code-id');
            const codeElement = document.getElementById(codeBlockId);
            
            if (codeElement) {
                // Get the raw text from the code block, preserving line breaks
                const codeText = codeElement.innerText || codeElement.textContent;
                
                // Copy text to clipboard
                copyToClipboard(codeText);
                
                // Show feedback that code was copied
                const originalText = this.textContent;
                this.textContent = 'Copied!';
                this.classList.add('copied');
                
                setTimeout(() => {
                    this.textContent = originalText;
                    this.classList.remove('copied');
                }, 2000);
            }
        });
    });
    
    if (scrollToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

// Add this function which was missing but is being called in some places
function displayBotMessage(message, scrollToBottom = true) {
    const messagesDiv = document.querySelector('.chat-content .messages');
    if (!messagesDiv) return;
    
    const botMessage = document.createElement('div');
    botMessage.classList.add('message', 'bot-message');
    botMessage.textContent = message;
    messagesDiv.appendChild(botMessage);
    
    if (scrollToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

// Enhanced function to better analyze and respond to coding-related queries
async function sendToGeminiAI(userQuery, problemDetails, userCode = "", chatContext = "") {
    return new Promise((resolve) => {
        chrome.storage.local.get("geminiAPIKey", async (data) => {
            const apiKey = data.geminiAPIKey;
            if (!apiKey) {
                alert("API key is missing. Please enter it in the extension popup.");
                return resolve("API key missing.");
            }

            // Include the user's code if available
            const codeContext = userCode ? 
                `\n\nUser's current code:\n\`\`\`\n${userCode}\n\`\`\`\n` : 
                "";

            // Improved examples of good responses to similar questions
            const exampleResponses = `
Examples of good responses with proper formatting:

Example 1 - When asked for an approach:
User: How do I approach the two sum problem?
AI: # Two Sum Problem Approach

Here are some effective approaches:

1. **Brute Force** 
   - Time Complexity: O(n²)
   - Check every pair of numbers in the array

2. **Hash Map Approach** (Recommended)
   - Time Complexity: O(n)
   - Space Complexity: O(n)
   - Algorithm:
     - Create a hash map to store values and indices
     - For each number, check if (target - current) exists in the map
     - If found, return both indices
     - Otherwise, add the current number to the map

The hash map approach is more efficient because it trades space for time complexity.

Example 2 - When asked for code:
User: Can you show me code for two sum?
AI: # Two Sum Solution

Here's an efficient implementation:

\`\`\`javascript
function twoSum(nums, target) {
    // Create a map to store values and their indices
    const seen = {};
    
    // Loop through the array once
    for (let i = 0; i < nums.length; i++) {
        // Calculate the complement we're looking for
        const complement = target - nums[i];
        
        // If the complement exists in our map, we found a solution
        if (complement in seen) {
            return [seen[complement], i];
        }
        
        // Otherwise, add the current number to our map
        seen[nums[i]] = i;
    }
    
    // If no solution is found
    return null;
}
\`\`\`

This solution:
- Uses a hash map to track numbers we've seen
- Has O(n) time complexity (just one pass through the array)
- Has O(n) space complexity in the worst case

Example 3 - When asked about time complexity:
User: What's the time complexity of merge sort?
AI: # Merge Sort Time Complexity

Merge sort has a time complexity of **O(n log n)** in all cases:
- Best case: O(n log n)
- Average case: O(n log n)
- Worst case: O(n log n)

## Why O(n log n)?

- The **divide** step splits the array in half each time
  - This creates a tree of height log n (base 2)
  - We have log n levels of recursion

- The **merge** step processes each element once at each level
  - Each level requires n operations to merge all partitions
  - n operations per level × log n levels = O(n log n)

This consistent performance makes merge sort an excellent choice for large datasets. It's also a stable sort, preserving the relative order of equal elements.
`;

            // Enhanced prompt with better guidance for formatting and response analysis
            let prompt = `You are an AI assistant specialized in helping users solve coding problems on maang.in. Your responses must be:

1. WELL-FORMATTED with proper headings, bullet points, and structure
2. CLEAR AND CONCISE with appropriate code examples when requested
3. FOCUSED ONLY on coding and problem-solving topics
4. HELPFUL in improving the user's understanding without giving away complete solutions unless explicitly asked
5. SPECIFIC to the current problem context

Guidelines:
- Format code blocks with triple backticks (\`\`\`) for proper display
- Use markdown-style formatting (\`#\` for headers, \`-\` or \`*\` for bullet points)
- Break down complex concepts with clear explanations
- Include time and space complexity analysis when relevant
- ALWAYS respond to coding and programming related questions
- If not a coding question, FIRST check if it could be related to programming concepts, algorithms, data structures, debugging, or software development in any way
- Only respond with "I can only help with coding problems and related questions" for questions that are completely unrelated to programming

${exampleResponses}

Here is the problem statement:
${problemDetails}
${codeContext}

${chatContext ? `Previous conversation context:\n${chatContext}\n\n` : ''}

User's query: ${userQuery}`;

            // Improved query categorization with stronger programming focus
            const programmingTerms = /algorithm|code|program|function|method|class|object|variable|loop|array|string|int|float|boolean|list|map|hash|tree|graph|stack|queue|recursion|iteration|sort|search|complexity|big o|time|space|memory|optimize|efficient|solve|solution|approach|implement|debug|error|fix|problem|challenge|test|case|example|input|output|return|concept|data structure|logic|syntax|language|python|java|javascript|c\+\+|c#|go|rust|swift|kotlin|typescript|php|ruby|scala|help|hint|explain|understand|how|what|why|edge case|corner case|test case|boundary|constraint|limitation|restriction|requirement/i;

            // Check if question is likely programming-related using a more aggressive approach
            const isProgrammingRelated = 
                programmingTerms.test(userQuery) || 
                userQuery.includes('?') || // Questions might be coding related
                /how|what|why|can|should|would|will|is|are|does|do|explain/i.test(userQuery); // Common question starters
            
            if (!isProgrammingRelated && 
                !/hello|hi|hey|greet/i.test(userQuery) && // Allow greetings
                userQuery.split(' ').length > 3) { // Only filter longer non-programming queries
                return resolve("I can only help with coding problems and related questions. Please ask something about the current problem, programming concepts, algorithms, or coding techniques.");
            }

            // Add specific response guidance based on query type
            if (/code|solution|implement|write/i.test(userQuery)) {
                prompt += "\nThe user is asking for code. Provide a well-formatted, clearly indented solution with explanatory comments. Use descriptive variable names and break your solution into logical sections.";
            } else if (/complexity|big o/i.test(userQuery)) {
                prompt += "\nExplain the time and space complexity clearly with step-by-step reasoning. Include best, average, and worst cases if applicable.";
            } else if (/help|hint|approach/i.test(userQuery)) {
                prompt += "\nProvide hints and approaches in a structured way, starting with simpler concepts before suggesting more optimized solutions.";
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            try {
                const response = await fetch(apiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("API Error Response:", errorText);
                    throw new Error(`Error ${response.status}: ${errorText}`);
                }

                const data = await response.json();

                if (data && data.candidates && data.candidates.length > 0) {
                    resolve(data.candidates[0].content.parts[0].text);
                } else {
                    resolve("Sorry, I couldn't generate a response.");
                }
            } catch (error) {
                console.error("API Request Failed:", error);
                resolve("Error processing request. Try again later.");
            }
        });
    });
}

// Make the chat box draggable
function makeChatBoxDraggable(chatBox) {
    const header = chatBox.querySelector('.chat-header');
    let isDragging = false, offsetX = 0, offsetY = 0;

    header.addEventListener('mousedown', (e) => {
        // Don't start dragging if clicking on a button
        if (e.target.tagName === 'BUTTON') return;
        
        isDragging = true;
        offsetX = e.clientX - chatBox.offsetLeft;
        offsetY = e.clientY - chatBox.offsetTop;
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', () => {
            isDragging = false;
            document.removeEventListener('mousemove', onDrag);
        });
    });

    function onDrag(e) {
        if (isDragging) {
            chatBox.style.left = `${e.clientX - offsetX}px`;
            chatBox.style.top = `${e.clientY - offsetY}px`;
        }
    }
}

// Make chat box resizable
function makeChatBoxResizable(chatBox) {
    const resizer = chatBox.querySelector('.resizer');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', () => {
            isResizing = false;
            document.removeEventListener('mousemove', onResize);
        });
    });

    function onResize(e) {
        if (isResizing) {
            chatBox.style.width = `${e.clientX - chatBox.offsetLeft}px`;
            chatBox.style.height = `${e.clientY - chatBox.offsetTop}px`;
        }
    }
}

// Clear chat history for current problem
// Fix the clearChatHistory function
function clearChatHistory() {
    const chatBox = document.querySelector('.chat-box');
    if (!chatBox) return;
    
    const problemId = chatBox.dataset.currentProblemId;
    
    chrome.storage.local.get(['chatHistory'], (result) => {
        const chatHistory = result.chatHistory || {};
        
        // Delete history for current problem
        if (chatHistory[problemId]) {
            delete chatHistory[problemId];
            chrome.storage.local.set({ chatHistory });
            
            // Clear the UI
            const messagesDiv = document.querySelector('.chat-content .messages');
            if (messagesDiv) messagesDiv.innerHTML = '';
            
            // Show fresh greeting after clearing
            const greeting = "👋 Chat history cleared! What would you like to know about this problem?";
            displayBotMessage(greeting);
            
            // Save the new greeting message
            const botMessageObj = {
                role: 'bot',
                content: greeting,
                timestamp: new Date().toISOString()
            };
            saveChatMessage(botMessageObj, problemId);
        }
    });
}



