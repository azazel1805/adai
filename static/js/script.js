document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Auth ---
    const auth = firebase.auth(); // Get auth instance
    const userInfo = document.querySelector('.user-info');
    const userEmailDisplay = document.getElementById('user-email');
    const signOutButton = document.getElementById('sign-out-button');
    const mainContent = document.getElementById('main-content');
    const loadingOverlay = document.getElementById('loading-overlay');
    const bodyElement = document.body; // Get the body element

    // --- Initial Loading State ---
    showLoading(true);
    if (mainContent) mainContent.style.display = 'none';
    if (bodyElement) bodyElement.classList.add('auth-loading');


    // --- Auth State Listener (Core Logic) ---
    let initialAuthCheckComplete = false;
    auth.onAuthStateChanged(user => {
        const currentPath = window.location.pathname;
        if (!initialAuthCheckComplete) {
            console.log("Initial auth state determined.");
            initialAuthCheckComplete = true;
            if (bodyElement) bodyElement.classList.remove('auth-loading');
        }
        if (user) {
            // User is SIGNED IN
            console.log('Auth State: Signed In - User:', user.email);
            if(userEmailDisplay) userEmailDisplay.textContent = user.email;
            if(userInfo) userInfo.style.display = 'flex';
            if(mainContent) mainContent.style.display = 'flex';
            if (currentPath === '/signin' || currentPath.startsWith('/signin?')) {
                 console.log("Redirecting signed-in user from /signin to /");
                 window.location.replace('/');
            } else { showLoading(false); }
        } else {
            // User is SIGNED OUT
            console.log('Auth State: Signed Out');
            if(userInfo) userInfo.style.display = 'none';
            if(mainContent) mainContent.style.display = 'none';
            if (currentPath !== '/signin' && !currentPath.startsWith('/signin?')) {
                console.log("Redirecting signed-out user to /signin");
                window.location.replace('/signin');
            } else { showLoading(false); }
        }
    });

    // --- Sign Out Button ---
    if (signOutButton) {
        signOutButton.addEventListener('click', () => {
            showLoading(true);
            auth.signOut().then(() => {
                console.log('Sign-out successful, redirect should happen via onAuthStateChanged');
            }).catch((error) => {
                console.error('Sign-out error:', error);
                alert('Error signing out: ' + error.message);
                showLoading(false);
            });
        });
    }

    // --- Loading Overlay ---
    function showLoading(show) {
        if (loadingOverlay) { loadingOverlay.style.display = show ? 'flex' : 'none'; }
        else { console.warn("Loading overlay element not found."); }
    }
     function showOutputLoading(outputElementId, show) {
        const element = document.getElementById(outputElementId);
        if (element) { element.classList.toggle('loading', show); }
    }

    // --- API Call Helper (Sends ID Token) ---
    async function callApi(endpoint, data) {
        showLoading(true);
        let idToken = null;
        if (!auth.currentUser) {
            alert("You need to be signed in to use this feature.");
            showLoading(false);
            return null;
        }
        try {
            idToken = await auth.currentUser.getIdToken(true);
        } catch (tokenError) {
             console.error("Error getting Firebase ID token:", tokenError);
             alert("Authentication error getting token. Please try signing out and back in. Error: " + tokenError.message);
             showLoading(false);
             return null;
        }
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` };
        try {
            const response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(data) });
            if (!response.ok) {
                let errorMsg = `API Error (${response.status})`;
                let errorData = null;
                try { errorData = await response.json(); } catch (e) { /* Ignore */ }
                errorMsg = (errorData && errorData.error) ? errorData.error : `${errorMsg} - ${response.statusText}`;
                console.error(`API Error calling ${endpoint}:`, errorMsg, errorData);
                if (response.status === 401 || response.status === 403) {
                      alert(`Authentication failed for API request. Your session might have expired. Please sign in again. (${errorMsg})`);
                      auth.signOut().catch(e => console.error("Error during forced sign out:", e));
                } else { alert(`Error communicating with server: ${errorMsg}`); }
                throw new Error(errorMsg);
            }
             const contentType = response.headers.get("content-type");
             if (contentType && contentType.includes("application/json")) { return await response.json(); }
             else if (contentType && contentType.includes("audio/mpeg")) { return await response.blob(); }
             else { console.warn("Received unexpected content type:", contentType); return await response.text(); }
        } catch (error) {
            // Avoid double logging if handled above
            if (!error.message.includes("API Error")) {
                 console.error(`Network or processing error calling ${endpoint}:`, error);
                 alert(`Network or processing error: ${error.message}`);
            }
            return null;
        } finally {
            showLoading(false);
        }
    }

    // --- Feature Switching Logic ---
    const featureButtons = document.querySelectorAll('.feature-button');
    const featureContents = document.querySelectorAll('.feature-content');
    const welcomeMessage = document.getElementById('welcome-message');
    featureButtons.forEach(button => {
        button.addEventListener('click', () => {
            const featureId = button.dataset.feature;
            featureButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            featureContents.forEach(content => content.classList.remove('active'));
            const activeContent = document.getElementById(featureId);
            if (activeContent) { activeContent.classList.add('active'); }
            else if (welcomeMessage) { welcomeMessage.classList.add('active'); }
        });
    });

    // --- TTS Toggle State & Button Logic ---
    let isTtsEnabled = localStorage.getItem('isTtsEnabled') !== 'false'; // Default to true
    const toggleTtsButton = document.getElementById('toggle-tts-button');
    const ttsIcon = toggleTtsButton ? toggleTtsButton.querySelector('i') : null;
    function updateTtsButtonState() {
        if (!toggleTtsButton || !ttsIcon) return;
        if (isTtsEnabled) {
            ttsIcon.classList.remove('fa-volume-mute'); ttsIcon.classList.add('fa-volume-up');
            toggleTtsButton.title = "Toggle Bot Speech Output (On)"; toggleTtsButton.classList.remove('muted');
            console.log("TTS Enabled");
        } else {
            ttsIcon.classList.remove('fa-volume-up'); ttsIcon.classList.add('fa-volume-mute');
            toggleTtsButton.title = "Toggle Bot Speech Output (Off)"; toggleTtsButton.classList.add('muted');
            console.log("TTS Disabled");
        }
    }
    updateTtsButtonState(); // Set initial state
    if (toggleTtsButton) {
        toggleTtsButton.addEventListener('click', () => {
            isTtsEnabled = !isTtsEnabled;
            localStorage.setItem('isTtsEnabled', isTtsEnabled);
            updateTtsButtonState();
            if (!isTtsEnabled && typeof synth !== 'undefined' && synth.speaking) { synth.cancel(); }
        });
    } else { console.warn("Toggle TTS Button not found."); }


     // --- Chatbot (General) ---
    const chatBox = document.getElementById('chat-box');
    const chatInput = document.getElementById('chat-input'); // input[type=text]
    const sendChatButton = document.getElementById('send-chat-button');
    const speakModeButton = document.getElementById('speak-mode-button');
    const speechStatus = document.getElementById('speech-status');
    let chatHistory = [];
    let isSpeakMode = false;
    let recognition;

    function initializeChat() {
        const initialBotMessage = "Hi! I'm Ada. How can I help you practice English today?";
        if (chatBox && chatBox.querySelectorAll('.message').length === 0) {
             addChatMessage('bot', initialBotMessage);
        }
         chatHistory = chatBox ? Array.from(chatBox.querySelectorAll('.message')).map(div => ({
              sender: div.classList.contains('user') ? 'user' : 'bot',
              text: div.textContent
          })) : [];
    }
    initializeChat();


    // Web Speech API - Speech Synthesis (TTS)
    const synth = window.speechSynthesis;
    let britVoice = null;
    function loadVoices() {
        if (typeof synth === 'undefined') return;
        const voices = synth.getVoices();
        britVoice = voices.find(voice => voice.lang === 'en-GB' && voice.name.includes('Google')) ||
                   voices.find(voice => voice.lang === 'en-GB');
    }
    if (typeof synth !== 'undefined') {
        if (synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = loadVoices; }
        loadVoices();
    }

    function speakText(text, useElevenLabs = true) {
        if (!isTtsEnabled || !text || typeof text !== 'string') return;
        if (typeof synth !== 'undefined') synth.cancel();
        if (useElevenLabs) {
             callApi('/api/elevenlabs_tts', { text: text }).then(audioBlob => {
                 if (audioBlob instanceof Blob) {
                     const audioUrl = URL.createObjectURL(audioBlob); const audio = new Audio(audioUrl);
                     if (!isTtsEnabled) { URL.revokeObjectURL(audioUrl); return; }
                     audio.play().catch(e => { console.error("Error playing ElevenLabs audio:", e); speakText(text, false); });
                     audio.onended = () => URL.revokeObjectURL(audioUrl);
                 } else { console.warn("ElevenLabs call failed/no Blob, falling back."); speakText(text, false); }
             }).catch(e => { console.error("Error fetching ElevenLabs audio:", e); speakText(text, false); });
        } else {
             console.log("Using Web Speech API TTS...");
             speakUtterance(text);
        }
    }

    function speakUtterance(text){
         if (!isTtsEnabled || typeof synth === 'undefined') return;
         try {
             const utterance = new SpeechSynthesisUtterance(text);
             utterance.onerror = (event) => console.error('SpeechSynthesisUtterance Error:', event.error);
             if (britVoice) { utterance.voice = britVoice; utterance.lang = 'en-GB'; }
             else { utterance.lang = 'en-GB'; }
             utterance.pitch = 1; utterance.rate = 1;
             synth.speak(utterance);
         } catch (e) { console.error("Error initiating speech synthesis:", e); }
    }


    // Web Speech API - Speech Recognition (STT)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        try {
             recognition = new SpeechRecognition();
             recognition.continuous = false; recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
             recognition.onresult = (event) => { const transcript = event.results[event.results.length - 1][0].transcript.trim(); if(chatInput) chatInput.value = transcript; if(speechStatus) speechStatus.textContent = 'Ready'; if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; };
             recognition.onspeechend = () => { if (isSpeakMode) { recognition.stop(); } if(speechStatus) speechStatus.textContent = 'Processing...'; };
             recognition.onnomatch = (event) => { if(speechStatus) speechStatus.textContent = 'No match'; if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; };
             recognition.onerror = (event) => { console.error('STT error:', event.error, event.message); if(speechStatus) speechStatus.textContent = `Error: ${event.error}`; if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { alert("Mic access denied."); } };
             recognition.onstart = () => { if(speechStatus) speechStatus.textContent = 'Listening...'; };
             recognition.onend = () => { if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; if (speechStatus && speechStatus.textContent === 'Listening...') { speechStatus.textContent = ''; } console.log("STT ended."); };
        } catch (sttError) { console.error("Failed to initialize STT:", sttError); recognition = null; if(speakModeButton) speakModeButton.disabled = true; if(speechStatus) speechStatus.textContent = 'STT Error'; }
    } else { console.warn("STT not supported."); if(speakModeButton) speakModeButton.disabled = true; if(speechStatus) speechStatus.textContent = 'STT N/A'; }

    // STT Button Listener
    if(speakModeButton) {
        speakModeButton.addEventListener('click', () => {
            if (!recognition) { alert("Speech input not available."); return; }
            if (isSpeakMode) { recognition.stop(); }
            else { try { recognition.start(); speakModeButton.classList.add('active'); isSpeakMode = true; } catch (e) { console.error("Error starting STT:", e); if (e.name !== 'InvalidStateError') { alert(`Could not start listening: ${e.message}`); } if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; } }
        });
    } else { console.warn("Speak Mode Button not found."); }


    // --- Chatbot Message Sending Logic ---
    function addChatMessage(sender, text) {
        if (!chatBox) return; const messageDiv = document.createElement('div'); messageDiv.classList.add('message', sender); messageDiv.textContent = text; chatBox.appendChild(messageDiv); chatBox.scrollTop = chatBox.scrollHeight; chatHistory.push({ sender, text });
    }

    async function sendChatMessage() {
        console.log("sendChatMessage started.");
        if (!chatInput || !sendChatButton) { return; } if (!auth.currentUser) { return; }
        const messageText = chatInput.value.trim(); if (!messageText) { return; }
        addChatMessage('user', messageText); const currentMessage = messageText; chatInput.value = ''; chatInput.disabled = true; sendChatButton.disabled = true;
        const typingIndicator = document.createElement('div'); typingIndicator.classList.add('message', 'bot', 'typing'); typingIndicator.textContent = 'Ada is typing...'; if(chatBox) { chatBox.appendChild(typingIndicator); chatBox.scrollTop = chatBox.scrollHeight; }
        const historyForApi = chatHistory.slice(0, -1).slice(-6); let botReplyText = null;
        try {
            const response = await callApi('/api/chat', { message: currentMessage, history: historyForApi });
            if (response && response.reply) { botReplyText = response.reply; addChatMessage('bot', botReplyText); }
            else { addChatMessage('bot', 'Sorry, I couldn\'t get a response.'); }
        } catch (error) { console.error("Error processing /api/chat call:", error); addChatMessage('bot', 'An error occurred.'); }
        finally { if(chatBox && chatBox.contains(typingIndicator)) { chatBox.removeChild(typingIndicator); } chatInput.disabled = false; sendChatButton.disabled = false; chatInput.focus(); console.log("Chat input re-enabled."); }
        if (botReplyText) { try { speakText(botReplyText, true); } catch (ttsError) { console.error("Error initiating TTS:", ttsError); } }
        console.log("sendChatMessage finished.");
    }
    if(sendChatButton) sendChatButton.addEventListener('click', sendChatMessage);
    if(chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });

    // --- Text Generator ---
    const textGenLevel = document.getElementById('text-gen-level'); const textGenTopic = document.getElementById('text-gen-topic'); const generateTextButton = document.getElementById('generate-text-button'); const textGenOutput = document.getElementById('text-gen-output');
    if(generateTextButton) { generateTextButton.addEventListener('click', async () => { const level = textGenLevel?.value || 'encounter'; const topic = textGenTopic?.value.trim() || ''; if (!topic) { alert('Please enter topic.'); return; } if(textGenOutput) textGenOutput.textContent = ''; showOutputLoading('text-gen-output', true); const response = await callApi('/api/generate_text', { level, topic }); showOutputLoading('text-gen-output', false); if(textGenOutput) textGenOutput.textContent = (response?.generated_text) || 'Error generating text.'; }); } else { console.warn("Generate Text Button not found."); }

    // --- Dictionary ---
    const dictWordInput = document.getElementById('dict-word'); const lookupWordButton = document.getElementById('lookup-word-button'); const dictOutput = document.getElementById('dict-output');
    function renderDictionaryResult(details, word) { /* ... same rendering logic ... */ if (!dictOutput) return; dictOutput.innerHTML = ''; if (!details || details.toLowerCase().includes("not found") || details.toLowerCase().includes("nonsensical")) { dictOutput.textContent = `Could not find info for "${word}".`; return; } const header = document.createElement('h4'); header.textContent = word.charAt(0).toUpperCase() + word.slice(1) + ' '; const speakButton = document.createElement('button'); speakButton.innerHTML = '<i class="fas fa-volume-up"></i>'; speakButton.classList.add('speak-word-button'); speakButton.title = `Speak "${word}"`; speakButton.onclick = () => { speakText(word, false); }; header.appendChild(speakButton); dictOutput.appendChild(header); const detailsDiv = document.createElement('div'); detailsDiv.innerHTML = details.replace(/</g, "<").replace(/>/g, ">").replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/(\r\n|\r|\n){2,}/g, '<br><br>').replace(/(\r\n|\r|\n)/g, '<br>'); dictOutput.appendChild(detailsDiv); }
    if(lookupWordButton) { lookupWordButton.addEventListener('click', async () => { const word = dictWordInput?.value.trim() || ''; if (!word) { alert('Please enter word.'); return; } if(dictOutput) dictOutput.innerHTML = ''; showOutputLoading('dict-output', true); const response = await callApi('/api/dictionary', { word }); showOutputLoading('dict-output', false); if (response?.details) { renderDictionaryResult(response.details, word); } else if(dictOutput) { dictOutput.textContent = 'Error looking up word.'; } }); } else { console.warn("Lookup Button not found."); }
    if(dictWordInput) dictWordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && lookupWordButton) { lookupWordButton.click(); } });

    // --- Text Corrector ---
    const correctorInput = document.getElementById('corrector-input'); const correctTextButton = document.getElementById('correct-text-button'); const correctedTextDisplay = document.getElementById('corrected-text-display'); const feedbackDisplay = document.getElementById('feedback-display');
    if(correctTextButton) { correctTextButton.addEventListener('click', async () => { const text = correctorInput?.value.trim() || ''; if (!text) { alert('Please enter text.'); return; } if(correctedTextDisplay) correctedTextDisplay.textContent = ''; if(feedbackDisplay) feedbackDisplay.textContent = ''; showOutputLoading('corrector-output', true); const response = await callApi('/api/correct_text', { text }); showOutputLoading('corrector-output', false); if (response) { if(correctedTextDisplay) correctedTextDisplay.textContent = response.corrected_text || "No correction."; if(feedbackDisplay) feedbackDisplay.innerHTML = response.feedback ? response.feedback.replace(/\n/g, '<br>') : "No feedback."; } else { if(correctedTextDisplay) correctedTextDisplay.textContent = 'Error.'; } }); } else { console.warn("Correct Text Button not found."); }

    // --- Grammar Aid ---
    const grammarTopicInput = document.getElementById('grammar-topic'); const explainGrammarButton = document.getElementById('explain-grammar-button'); const grammarOutput = document.getElementById('grammar-output');
    if(explainGrammarButton) { explainGrammarButton.addEventListener('click', async () => { const topic = grammarTopicInput?.value.trim() || ''; if (!topic) { alert('Please enter topic.'); return; } if(grammarOutput) grammarOutput.textContent = ''; showOutputLoading('grammar-output', true); const response = await callApi('/api/grammar_aid', { topic }); showOutputLoading('grammar-output', false); if(grammarOutput) grammarOutput.innerHTML = (response?.explanation) ? response.explanation.replace(/\n/g, '<br>') : 'Error explaining topic.'; }); } else { console.warn("Explain Grammar Button not found."); }
    if(grammarTopicInput) grammarTopicInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && explainGrammarButton) { explainGrammarButton.click(); } });

    // --- Essay Helper ---
    const essayTopicInput = document.getElementById('essay-topic'); const essayTypeSelect = document.getElementById('essay-type'); const generateOutlineButton = document.getElementById('generate-outline-button'); const generateEssayButton = document.getElementById('generate-essay-button'); const essayOutput = document.getElementById('essay-output');
    async function generateEssayContent(outlineOnly) { const topic = essayTopicInput?.value.trim() || ''; const essayType = essayTypeSelect?.value || 'argumentative'; if (!topic) { alert('Please enter topic.'); return; } if(essayOutput) essayOutput.textContent = ''; showOutputLoading('essay-output', true); const response = await callApi('/api/essay', { topic, essay_type: essayType, outline_only: outlineOnly }); showOutputLoading('essay-output', false); if(essayOutput) essayOutput.innerHTML = (response?.essay_content) ? response.essay_content.replace(/\n/g, '<br>') : `Error generating ${outlineOnly ? 'outline' : 'essay'}.`; }
    if(generateOutlineButton) generateOutlineButton.addEventListener('click', () => generateEssayContent(true)); else { console.warn("Generate Outline Button not found."); }
    if(generateEssayButton) generateEssayButton.addEventListener('click', () => generateEssayContent(false)); else { console.warn("Generate Essay Button not found."); }

    // --- Paraphraser ---
    const paraphraseInput = document.getElementById('paraphrase-input'); const paraphraseStyleSelect = document.getElementById('paraphrase-style'); const rephraseButton = document.getElementById('rephrase-button'); const paraphraseOutput = document.getElementById('paraphrase-output');
    if (rephraseButton) { rephraseButton.addEventListener('click', async () => { const textToRephrase = paraphraseInput?.value.trim() || ''; const selectedStyle = paraphraseStyleSelect?.value || 'simpler'; if (!textToRephrase) { alert('Please enter text.'); return; } if (paraphraseOutput) paraphraseOutput.textContent = ''; showOutputLoading('paraphrase-output', true); const response = await callApi('/api/paraphrase', { text: textToRephrase, style: selectedStyle }); showOutputLoading('paraphrase-output', false); if (paraphraseOutput) { paraphraseOutput.textContent = (response?.rephrased_text) || 'Error rephrasing.'; } }); } else { console.warn("Rephrase Button not found."); }


    // --- START SCENARIO PRACTICE LOGIC ---
    const scenarioSetupDiv = document.getElementById('scenario-setup');
    const scenarioDescriptionInput = document.getElementById('scenario-description');
    const startScenarioButton = document.getElementById('start-scenario-button');
    const scenarioInteractionDiv = document.getElementById('scenario-interaction');
    const scenarioTitleDisplay = document.getElementById('scenario-title-display');
    const scenarioChatBox = document.getElementById('scenario-chat-box');
    const scenarioChatInput = document.getElementById('scenario-chat-input'); // Textarea or Input
    const sendScenarioChatButton = document.getElementById('send-scenario-chat-button');
    const resetScenarioButton = document.getElementById('reset-scenario-button');
    let currentScenarioDescription = null;
    let scenarioChatHistory = [];

    function addScenarioChatMessage(sender, text) {
        if (!scenarioChatBox) return;
        const messageDiv = document.createElement('div'); messageDiv.classList.add('message', sender); messageDiv.textContent = text;
        scenarioChatBox.appendChild(messageDiv); scenarioChatBox.scrollTop = scenarioChatBox.scrollHeight;
        scenarioChatHistory.push({ sender, text });
    }

    async function sendScenarioChatMessage() {
        console.log("sendScenarioChatMessage started.");
        if (!scenarioChatInput || !sendScenarioChatButton || !currentScenarioDescription) { return; }
        if (!auth.currentUser) { return; }
        const messageText = scenarioChatInput.value.trim(); if (!messageText) { return; }

        addScenarioChatMessage('user', messageText);
        const currentUserMessage = messageText; scenarioChatInput.value = '';
        scenarioChatInput.disabled = true; sendScenarioChatButton.disabled = true;

        const typingIndicator = document.createElement('div'); typingIndicator.classList.add('message', 'bot', 'typing'); typingIndicator.textContent = 'Ada is thinking...'; if(scenarioChatBox) { scenarioChatBox.appendChild(typingIndicator); scenarioChatBox.scrollTop = scenarioChatBox.scrollHeight; }

        const historyForApi = scenarioChatHistory.slice(0, -1).slice(-8); // History before current msg
        let botReplyText = null;

        try {
            const response = await callApi('/api/scenario-chat', { scenario: currentScenarioDescription, history: historyForApi, message: currentUserMessage });
            if (response?.reply) { botReplyText = response.reply; addScenarioChatMessage('bot', botReplyText); }
            else { addScenarioChatMessage('bot', 'Sorry, issue in scenario.'); }
        } catch (error) { console.error("Error processing /api/scenario-chat call:", error); addScenarioChatMessage('bot', 'Error in scenario.'); }
        finally {
            if(scenarioChatBox && scenarioChatBox.contains(typingIndicator)) { scenarioChatBox.removeChild(typingIndicator); }
            scenarioChatInput.disabled = false; sendScenarioChatButton.disabled = false;
            scenarioChatInput.focus(); console.log("Scenario input re-enabled.");
        }
        // --- TTS Disabled for Scenario Replies ---
        if (botReplyText) { console.log("Scenario reply generated, TTS disabled."); }
        else { console.log("No scenario reply text."); }
        console.log("sendScenarioChatMessage finished.");
    }

    if (startScenarioButton) {
        startScenarioButton.addEventListener('click', async () => {
            const description = scenarioDescriptionInput?.value.trim() || '';
            if (!description) { alert('Please describe scenario.'); return; }
            currentScenarioDescription = description; scenarioChatHistory = [];
            console.log("Starting scenario:", currentScenarioDescription);
            if (scenarioChatBox) scenarioChatBox.innerHTML = '';
            if (scenarioTitleDisplay) scenarioTitleDisplay.textContent = `Scenario: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`;
            if (scenarioSetupDiv) scenarioSetupDiv.style.display = 'none';
            if (scenarioInteractionDiv) scenarioInteractionDiv.style.display = 'block';
            if (scenarioChatInput) scenarioChatInput.value = '';

            showLoading(true);
            const response = await callApi('/api/scenario-chat', { scenario: currentScenarioDescription, start: true });
            showLoading(false);

            if (response?.reply) {
                 addScenarioChatMessage('bot', response.reply);
                 console.log("Scenario started, TTS disabled.");
                // speakText(response.reply, true); // TTS explicitly disabled
            } else { addScenarioChatMessage('bot', 'Okay, ready. You start.'); } // Fallback
            if(scenarioChatInput) scenarioChatInput.focus();
        });
    } else { console.warn("Start Scenario Button not found."); }

    if (sendScenarioChatButton) { sendScenarioChatButton.addEventListener('click', sendScenarioChatMessage); }
    else { console.warn("Send Scenario Chat Button not found."); }

    if (scenarioChatInput) {
        scenarioChatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendScenarioChatMessage(); } });
    } else { console.warn("Scenario Chat Input not found."); }

    if (resetScenarioButton) {
        resetScenarioButton.addEventListener('click', () => {
            console.log("Resetting scenario."); currentScenarioDescription = null; scenarioChatHistory = [];
            if (scenarioChatBox) scenarioChatBox.innerHTML = ''; if (scenarioChatInput) scenarioChatInput.value = '';
            if (scenarioInteractionDiv) scenarioInteractionDiv.style.display = 'none'; if (scenarioSetupDiv) scenarioSetupDiv.style.display = 'block';
            if (scenarioDescriptionInput) scenarioDescriptionInput.value = '';
        });
    } else { console.warn("Reset Scenario Button not found."); }
    // --- END SCENARIO PRACTICE LOGIC ---

}); // End DOMContentLoaded
