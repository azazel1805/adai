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
    let isTtsEnabled = localStorage.getItem('isTtsEnabled') !== 'false'; // Default to true if not set
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
            if (!isTtsEnabled && typeof synth !== 'undefined' && synth.speaking) { synth.cancel(); } // Stop speech if muted
        });
    } else { console.warn("Toggle TTS Button not found."); }


     // --- Chatbot ---
    const chatBox = document.getElementById('chat-box');
    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat-button');
    const speakModeButton = document.getElementById('speak-mode-button');
    const speechStatus = document.getElementById('speech-status');
    let chatHistory = [];
    let isSpeakMode = false;
    let recognition;

    function initializeChat() {
        const initialBotMessage = "Hi! I'm Ada. How can I help you practice English today?";
        if (chatBox && chatBox.querySelectorAll('.message').length === 0) { // Add only if chatbox is empty
             addChatMessage('bot', initialBotMessage);
        }
         chatHistory = chatBox ? Array.from(chatBox.querySelectorAll('.message')).map(div => ({
              sender: div.classList.contains('user') ? 'user' : 'bot',
              text: div.textContent
          })) : [];
    }
    initializeChat(); // Set up chat history


    // Web Speech API - Speech Synthesis (TTS)
    const synth = window.speechSynthesis;
    let britVoice = null;
    function loadVoices() {
        if (typeof synth === 'undefined') return; // Safety check
        const voices = synth.getVoices();
        britVoice = voices.find(voice => voice.lang === 'en-GB' && voice.name.includes('Google')) ||
                   voices.find(voice => voice.lang === 'en-GB');
    }
    if (typeof synth !== 'undefined' && synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = loadVoices; } loadVoices();

    function speakText(text, useElevenLabs = true) {
        if (!isTtsEnabled || !text || typeof text !== 'string') return;
        if (typeof synth !== 'undefined') synth.cancel();

        // NOTE: Client-side check for ELEVENLABS_API_KEY is just indicative.
        // The actual check happens on the backend. We assume it *might* be configured.
        if (useElevenLabs) {
             console.log("Calling backend for ElevenLabs TTS...");
             callApi('/api/elevenlabs_tts', { text: text }).then(audioBlob => {
                 if (audioBlob instanceof Blob) {
                     const audioUrl = URL.createObjectURL(audioBlob);
                     const audio = new Audio(audioUrl);
                     if (!isTtsEnabled) { URL.revokeObjectURL(audioUrl); return; } // Re-check
                     audio.play().catch(e => { console.error("Error playing ElevenLabs audio:", e); speakText(text, false); });
                     audio.onended = () => URL.revokeObjectURL(audioUrl);
                 } else { console.warn("ElevenLabs call did not return Blob, falling back."); speakText(text, false); }
             }).catch(e => { console.error("Error in ElevenLabs API call promise:", e); speakText(text, false); });
        } else {
             console.log("Using Web Speech API TTS...");
             speakUtterance(text); // Fallback to browser voice
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
        try { // Wrap initialization in try-catch
             recognition = new SpeechRecognition();
             recognition.continuous = false; recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
             recognition.onresult = (event) => { /* ... */ if(chatInput) chatInput.value = event.results[event.results.length - 1][0].transcript.trim(); if(speechStatus) speechStatus.textContent = 'Ready'; if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; };
             recognition.onspeechend = () => { recognition.stop(); if(speechStatus) speechStatus.textContent = 'Processing...'; };
             recognition.onnomatch = (event) => { if(speechStatus) speechStatus.textContent = 'No match'; if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; };
             recognition.onerror = (event) => { /* ... error handling ... */ console.error('Speech recognition error:', event.error, event.message); if(speechStatus) speechStatus.textContent = `Error: ${event.error}`; if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { alert("Microphone access denied."); } else { /* alert(`Speech recognition error: ${event.error}`); */ } };
             recognition.onstart = () => { if(speechStatus) speechStatus.textContent = 'Listening...'; };
             recognition.onend = () => { if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; };
        } catch (sttError) {
             console.error("Failed to initialize SpeechRecognition:", sttError);
             recognition = null; // Ensure recognition is null if init fails
             if(speakModeButton) speakModeButton.disabled = true; if(speechStatus) speechStatus.textContent = 'STT Error';
        }
    } else { console.warn("Speech Recognition not supported."); if(speakModeButton) speakModeButton.disabled = true; if(speechStatus) speechStatus.textContent = 'STT N/A'; }

    if(speakModeButton) {
        speakModeButton.addEventListener('click', () => {
            if (!recognition) { alert("Speech input is not available or failed to initialize."); return; } // Check if initialized
            if (isSpeakMode) { recognition.stop(); }
            else { try { recognition.start(); speakModeButton.classList.add('active'); isSpeakMode = true; } catch (e) { console.error("Error starting STT:", e); alert(`Could not start listening: ${e.message}`); } }
        });
    } else { console.warn("Speak Mode Button not found."); }


    function addChatMessage(sender, text) {
        if (!chatBox) return;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        messageDiv.textContent = text;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        chatHistory.push({ sender, text });
    }

    async function sendChatMessage() {
        console.log("sendChatMessage function started.");
        if (!chatInput || !sendChatButton) { console.error("Input or Button missing in sendChatMessage."); return; }
        if (!auth.currentUser) { console.error("sendChatMessage called but no user signed in."); alert("Error: Not signed in."); return; }
        const messageText = chatInput.value.trim();
        if (!messageText) { console.log("Empty message."); return; }
        console.log("Attempting to send message:", messageText);
        addChatMessage('user', messageText);
        const currentMessage = messageText;
        chatInput.value = '';
        chatInput.disabled = true; sendChatButton.disabled = true;
        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('message', 'bot', 'typing');
        typingIndicator.textContent = 'Ada is typing...';
        if(chatBox) { chatBox.appendChild(typingIndicator); chatBox.scrollTop = chatBox.scrollHeight; }
        const historyForApi = chatHistory.slice(0, -1).slice(-6);
        let botReplyText = null;
        try {
            console.log("Calling API for chat response...");
            const response = await callApi('/api/chat', { message: currentMessage, history: historyForApi });
            console.log("API call finished.");
            if (response && response.reply) { botReplyText = response.reply; addChatMessage('bot', botReplyText); }
            else { console.log("No valid reply from API."); addChatMessage('bot', 'Sorry, I couldn\'t get a response.'); }
        } catch (error) { console.error("Error during /api/chat call processing:", error); addChatMessage('bot', 'An error occurred while getting my reply.'); }
        finally {
            console.log("Entering finally block.");
            if(chatBox && chatBox.contains(typingIndicator)) { chatBox.removeChild(typingIndicator); }
            chatInput.disabled = false; sendChatButton.disabled = false;
            console.log("Chat input re-enabled.");
            chatInput.focus();
        }
        if (botReplyText) {
            try { console.log("Attempting to speak bot reply..."); speakText(botReplyText, true); }
            catch (ttsError) { console.error("Error initiating TTS:", ttsError); }
        } else { console.log("No bot reply text to speak."); }
        console.log("sendChatMessage function finished.");
    }
    if(sendChatButton) sendChatButton.addEventListener('click', sendChatMessage);
    if(chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });

    // --- Text Generator ---
    const textGenLevel = document.getElementById('text-gen-level');
    const textGenTopic = document.getElementById('text-gen-topic');
    const generateTextButton = document.getElementById('generate-text-button');
    const textGenOutput = document.getElementById('text-gen-output');
    if(generateTextButton) {
        generateTextButton.addEventListener('click', async () => { /* ... keep existing logic ... */
            const level = textGenLevel ? textGenLevel.value : 'encounter';
            const topic = textGenTopic ? textGenTopic.value.trim() : '';
            if (!topic) { alert('Please enter a topic.'); return; }
            if(textGenOutput) textGenOutput.textContent = ''; showOutputLoading('text-gen-output', true);
            const response = await callApi('/api/generate_text', { level, topic });
            showOutputLoading('text-gen-output', false);
            if(textGenOutput) textGenOutput.textContent = (response && response.generated_text) ? response.generated_text : 'Error generating text.';
        });
    } else { console.warn("Generate Text Button not found."); }


    // --- Dictionary ---
    const dictWordInput = document.getElementById('dict-word');
    const lookupWordButton = document.getElementById('lookup-word-button');
    const dictOutput = document.getElementById('dict-output');
    function renderDictionaryResult(details, word) { /* ... keep existing logic ... */
         if (!dictOutput) return; dictOutput.innerHTML = '';
         if (details.toLowerCase().includes("not found") || details.toLowerCase().includes("nonsensical")) { dictOutput.textContent = `Could not find info for "${word}".`; return; }
         const header = document.createElement('h4'); header.textContent = word.charAt(0).toUpperCase() + word.slice(1) + ' ';
         const speakButton = document.createElement('button'); speakButton.innerHTML = '<i class="fas fa-volume-up"></i>'; speakButton.classList.add('speak-word-button'); speakButton.title = `Speak "${word}"`;
         speakButton.onclick = () => { speakText(word, false); };
         header.appendChild(speakButton); dictOutput.appendChild(header);
         const detailsDiv = document.createElement('div');
         detailsDiv.innerHTML = details.replace(/</g, "<").replace(/>/g, ">").replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/(\n\d+\.\s)/g, '<br>$1').replace(/\n/g, '<br>');
         dictOutput.appendChild(detailsDiv);
    }
    if(lookupWordButton) {
        lookupWordButton.addEventListener('click', async () => { /* ... keep existing logic ... */
            const word = dictWordInput ? dictWordInput.value.trim() : '';
            if (!word) { alert('Please enter a word.'); return; }
            if(dictOutput) dictOutput.innerHTML = ''; showOutputLoading('dict-output', true);
            const response = await callApi('/api/dictionary', { word });
            showOutputLoading('dict-output', false);
            if (response && response.details) { renderDictionaryResult(response.details, word); }
            else if(dictOutput) { dictOutput.textContent = 'Error looking up word.'; }
        });
    } else { console.warn("Lookup Word Button not found."); }
    if(dictWordInput) dictWordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && lookupWordButton) { lookupWordButton.click(); } });


    // --- Text Corrector ---
    const correctorInput = document.getElementById('corrector-input');
    const correctTextButton = document.getElementById('correct-text-button');
    const correctedTextDisplay = document.getElementById('corrected-text-display');
    const feedbackDisplay = document.getElementById('feedback-display');
    if(correctTextButton) {
        correctTextButton.addEventListener('click', async () => { /* ... keep existing logic ... */
            const text = correctorInput ? correctorInput.value.trim() : '';
            if (!text) { alert('Please enter text to correct.'); return; }
            if(correctedTextDisplay) correctedTextDisplay.textContent = ''; if(feedbackDisplay) feedbackDisplay.textContent = '';
            showOutputLoading('corrector-output', true);
            const response = await callApi('/api/correct_text', { text });
            showOutputLoading('corrector-output', false);
            if (response) {
                if(correctedTextDisplay) correctedTextDisplay.textContent = response.corrected_text || "No correction provided.";
                if(feedbackDisplay) feedbackDisplay.innerHTML = response.feedback ? response.feedback.replace(/\n/g, '<br>') : "No feedback provided.";
            } else { if(correctedTextDisplay) correctedTextDisplay.textContent = 'Error correcting text.'; }
        });
    } else { console.warn("Correct Text Button not found."); }


    // --- Grammar Aid ---
    const grammarTopicInput = document.getElementById('grammar-topic');
    const explainGrammarButton = document.getElementById('explain-grammar-button');
    const grammarOutput = document.getElementById('grammar-output');
    if(explainGrammarButton) {
        explainGrammarButton.addEventListener('click', async () => { /* ... keep existing logic ... */
            const topic = grammarTopicInput ? grammarTopicInput.value.trim() : '';
            if (!topic) { alert('Please enter a grammar topic.'); return; }
            if(grammarOutput) grammarOutput.textContent = ''; showOutputLoading('grammar-output', true);
            const response = await callApi('/api/grammar_aid', { topic });
            showOutputLoading('grammar-output', false);
            if(grammarOutput) grammarOutput.innerHTML = (response && response.explanation) ? response.explanation.replace(/\n/g, '<br>') : 'Error explaining grammar topic.';
        });
    } else { console.warn("Explain Grammar Button not found."); }
    if(grammarTopicInput) grammarTopicInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && explainGrammarButton) { explainGrammarButton.click(); } });


    // --- Essay Helper ---
    const essayTopicInput = document.getElementById('essay-topic');
    const essayTypeSelect = document.getElementById('essay-type');
    const generateOutlineButton = document.getElementById('generate-outline-button');
    const generateEssayButton = document.getElementById('generate-essay-button');
    const essayOutput = document.getElementById('essay-output');
    async function generateEssayContent(outlineOnly) { /* ... keep existing logic ... */
        const topic = essayTopicInput ? essayTopicInput.value.trim() : '';
        const essayType = essayTypeSelect ? essayTypeSelect.value : 'argumentative';
        if (!topic) { alert('Please enter an essay topic.'); return; }
        if(essayOutput) essayOutput.textContent = ''; showOutputLoading('essay-output', true);
        const response = await callApi('/api/essay', { topic, essay_type: essayType, outline_only: outlineOnly });
        showOutputLoading('essay-output', false);
        if(essayOutput) essayOutput.innerHTML = (response && response.essay_content) ? response.essay_content.replace(/\n/g, '<br>') : `Error generating ${outlineOnly ? 'outline' : 'essay'}.`;
    }
    if(generateOutlineButton) generateOutlineButton.addEventListener('click', () => generateEssayContent(true));
    else { console.warn("Generate Outline Button not found."); }
    if(generateEssayButton) generateEssayButton.addEventListener('click', () => generateEssayContent(false));
    else { console.warn("Generate Essay Button not found."); }

    // --- START NEW PARAPHRASER LOGIC ---
    const paraphraseInput = document.getElementById('paraphrase-input');
    const paraphraseStyleSelect = document.getElementById('paraphrase-style');
    const rephraseButton = document.getElementById('rephrase-button');
    const paraphraseOutput = document.getElementById('paraphrase-output');

    if (rephraseButton) {
        rephraseButton.addEventListener('click', async () => {
            const textToRephrase = paraphraseInput ? paraphraseInput.value.trim() : '';
            const selectedStyle = paraphraseStyleSelect ? paraphraseStyleSelect.value : 'simpler';

            if (!textToRephrase) {
                alert('Please enter text to rephrase.');
                return;
            }

            console.log(`Requesting paraphrase. Style: ${selectedStyle}, Text: ${textToRephrase.substring(0, 50)}...`);

            if (paraphraseOutput) paraphraseOutput.textContent = ''; // Clear previous output
            showOutputLoading('paraphrase-output', true);

            // Call the new backend endpoint
            const response = await callApi('/api/paraphrase', {
                text: textToRephrase,
                style: selectedStyle
            });

            showOutputLoading('paraphrase-output', false);

            if (paraphraseOutput) {
                if (response && response.rephrased_text) {
                    paraphraseOutput.textContent = response.rephrased_text;
                } else {
                    paraphraseOutput.textContent = 'Error rephrasing text.';
                }
            }
        });
    } else {
         console.warn("Rephrase Button not found.");
    }
    // --- END NEW PARAPHRASER LOGIC ---

}); // End DOMContentLoaded
