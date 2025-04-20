document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Auth ---
    const auth = firebase.auth(); // Get auth instance
    const userInfo = document.querySelector('.user-info');
    const userEmailDisplay = document.getElementById('user-email');
    const signOutButton = document.getElementById('sign-out-button');
    const mainContent = document.getElementById('main-content');
    const loadingOverlay = document.getElementById('loading-overlay');

    // --- Auth State Listener (Core Logic) ---
    auth.onAuthStateChanged(user => {
        const currentPath = window.location.pathname; // Get current page path

        if (user) {
            // --- User is SIGNED IN ---
            console.log('Auth State: Signed In - User:', user.email);
            if(userEmailDisplay) userEmailDisplay.textContent = user.email;
            if(userInfo) userInfo.style.display = 'flex';
            if(mainContent) mainContent.style.display = 'flex'; // Show main content area

            // Redirect away from signin page if somehow landed there while logged in
            if (currentPath === '/signin' || currentPath.startsWith('/signin?')) {
                 console.log("Redirecting signed-in user from /signin to /");
                 window.location.replace('/'); // Use replace to avoid history entry
            }
        } else {
            // --- User is SIGNED OUT ---
            console.log('Auth State: Signed Out');
            if(userInfo) userInfo.style.display = 'none';
            if(mainContent) mainContent.style.display = 'none'; // Hide main content area

            // Redirect TO signin page IF NOT ALREADY THERE
            if (currentPath !== '/signin' && !currentPath.startsWith('/signin?')) {
                console.log("Redirecting signed-out user to /signin");
                window.location.replace('/signin'); // Use replace to avoid history entry
            }
        }
        // Hide general loading overlay once auth state is determined
        showLoading(false);
    });

    // --- Sign Out Button ---
    if (signOutButton) {
        signOutButton.addEventListener('click', () => {
            showLoading(true); // Show loading indicator during sign out
            auth.signOut().then(() => {
                console.log('Sign-out successful, redirect should happen via onAuthStateChanged');
                // No explicit redirect needed here, onAuthStateChanged handles it
            }).catch((error) => {
                console.error('Sign-out error:', error);
                alert('Error signing out: ' + error.message);
                showLoading(false); // Hide loading on error
            });
            // Note: showLoading(false) is handled by onAuthStateChanged after state update
        });
    }

    // --- Loading Overlay ---
    function showLoading(show) {
        if (loadingOverlay) {
             loadingOverlay.style.display = show ? 'flex' : 'none';
        } else {
             console.warn("Loading overlay element not found.");
        }
    }
     function showOutputLoading(outputElementId, show) {
        const element = document.getElementById(outputElementId);
        if (element) {
            element.classList.toggle('loading', show);
        }
    }

    // --- API Call Helper (Sends ID Token) ---
    async function callApi(endpoint, data) {
        showLoading(true); // Show general loading for API calls
        let idToken = null;

        if (!auth.currentUser) {
            console.warn("API call attempted without signed-in user for endpoint:", endpoint);
            // Depending on backend, this might fail. Alert user or handle gracefully.
            alert("You need to be signed in to use this feature.");
            showLoading(false);
            // Optionally redirect to sign-in: window.location.href = '/signin';
            return null; // Stop the API call
        }

        try {
            // Force refresh recommended to ensure token is not expired
            idToken = await auth.currentUser.getIdToken(/* forceRefresh */ true);
            // console.log("Got ID Token for API call to", endpoint); // Debug logging
        } catch (tokenError) {
             console.error("Error getting Firebase ID token:", tokenError);
             alert("Authentication error getting token. Please try signing out and back in. Error: " + tokenError.message);
             showLoading(false);
             return null; // Stop the API call
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}` // Add the token
        };

        try {
            // Use relative paths for API calls when frontend/backend are on same domain/proxy
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                let errorMsg = `API Error (${response.status})`;
                let errorData = null;
                try { errorData = await response.json(); } catch (e) { /* Ignore if response not JSON */ }

                if (errorData && errorData.error) {
                     errorMsg = errorData.error; // Use error message from backend if available
                } else {
                     errorMsg = `${errorMsg} - ${response.statusText}`;
                }
                 console.error(`API Error calling ${endpoint}:`, errorMsg, errorData);

                 // Handle specific auth error responses from backend
                 if (response.status === 401 || response.status === 403) {
                      alert(`Authentication failed for API request. Your session might have expired. Please sign in again. (${errorMsg})`);
                      // Force sign out and redirect
                      auth.signOut().catch(e => console.error("Error during forced sign out:", e));
                 } else {
                      alert(`Error communicating with server: ${errorMsg}`);
                 }
                throw new Error(errorMsg); // Throw to be caught below
            }

             // Handle different response types (JSON or Blob for audio)
             const contentType = response.headers.get("content-type");
             if (contentType && contentType.includes("application/json")) {
                 return await response.json();
             } else if (contentType && contentType.includes("audio/mpeg")) {
                 return await response.blob(); // Return audio blob for TTS
             } else {
                 // Fallback for unexpected content types
                 console.warn("Received unexpected content type:", contentType);
                 return await response.text();
             }
        } catch (error) {
            // Error already logged above if it came from response.ok check
            // Log network errors here
            if (!error.message.includes("API Error")) { // Avoid double logging
                 console.error(`Network or processing error calling ${endpoint}:`, error);
                 alert(`Network or processing error: ${error.message}`);
            }
            return null; // Indicate failure
        } finally {
            showLoading(false); // Hide general loading overlay
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

    // --- Chatbot ---
    const chatBox = document.getElementById('chat-box');
    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat-button');
    const speakModeButton = document.getElementById('speak-mode-button');
    const speechStatus = document.getElementById('speech-status');
    let chatHistory = []; // Start with empty history, add initial bot message below
    let isSpeakMode = false;
    let recognition; // SpeechRecognition instance

    function initializeChat() {
        const initialBotMessage = "Hi! I'm Ada. How can I help you practice English today?";
        if (chatBox && !chatBox.querySelector('.message.bot')) { // Add only if not already present
             addChatMessage('bot', initialBotMessage);
        }
         chatHistory = chatBox ? Array.from(chatBox.querySelectorAll('.message')).map(div => ({
              sender: div.classList.contains('user') ? 'user' : 'bot',
              text: div.textContent
          })) : [];
    }
    initializeChat(); // Set up chat history


    // Web Speech API - Speech Synthesis (TTS) - Keep this section
    const synth = window.speechSynthesis;
    let britVoice = null;
    function loadVoices() {
        const voices = synth.getVoices();
        britVoice = voices.find(voice => voice.lang === 'en-GB' && voice.name.includes('Google')) ||
                   voices.find(voice => voice.lang === 'en-GB');
        // console.log("Selected British voice:", britVoice);
    }
    if (synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = loadVoices; } loadVoices();

    function speakText(text, useElevenLabs = true) {
        if (!text || typeof text !== 'string') return;
        console.log(`Attempting to speak (ElevenLabs: ${useElevenLabs}): ${text.substring(0,50)}...`);
        synth.cancel(); // Cancel any ongoing speech

        if (useElevenLabs && ELEVENLABS_API_KEY) { // Check key exists client-side (only for conditional call)
             console.log("Calling backend for ElevenLabs TTS...");
             callApi('/api/elevenlabs_tts', { text: text }).then(audioBlob => {
                 if (audioBlob instanceof Blob) {
                     const audioUrl = URL.createObjectURL(audioBlob);
                     const audio = new Audio(audioUrl);
                     audio.play().catch(e => {
                         console.error("Error playing ElevenLabs audio:", e);
                         alert("Error playing generated audio. Trying browser voice.");
                         speakText(text, false); // Fallback
                     });
                     audio.onended = () => URL.revokeObjectURL(audioUrl);
                 } else {
                      console.warn("ElevenLabs call did not return Blob, falling back.");
                      speakText(text, false); // Fallback if API call failed or returned error json
                 }
             }).catch(e => {
                 console.error("Error in ElevenLabs API call promise:", e);
                 speakText(text, false); // Fallback on error
             });
        } else {
             console.log("Using Web Speech API TTS...");
             speakUtterance(text);
        }
    }

    function speakUtterance(text){
         try {
             const utterance = new SpeechSynthesisUtterance(text);
             utterance.onerror = (event) => console.error('SpeechSynthesisUtterance Error:', event.error);
             if (britVoice) { utterance.voice = britVoice; utterance.lang = 'en-GB'; }
             else { utterance.lang = 'en-GB'; console.warn("Speaking with default voice, requested en-GB."); }
             utterance.pitch = 1; utterance.rate = 1;
             synth.speak(utterance);
         } catch (e) { console.error("Error initiating speech synthesis:", e); alert("Could not initiate browser speech synthesis."); }
    }

    // Web Speech API - Speech Recognition (STT) - Keep this section
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false; recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            if(chatInput) chatInput.value = transcript;
            if(speechStatus) speechStatus.textContent = 'Ready';
            if(speakModeButton) speakModeButton.classList.remove('active');
            isSpeakMode = false;
            // sendChatMessage(); // Optional: uncomment to send automatically
        };
        recognition.onspeechend = () => { recognition.stop(); if(speechStatus) speechStatus.textContent = 'Processing...'; };
        recognition.onnomatch = (event) => { if(speechStatus) speechStatus.textContent = 'No match'; if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; };
        recognition.onerror = (event) => {
             console.error('Speech recognition error:', event.error, event.message);
             if(speechStatus) speechStatus.textContent = `Error: ${event.error}`;
             if(speakModeButton) speakModeButton.classList.remove('active');
             isSpeakMode = false;
             if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { alert("Microphone access denied."); }
             else { alert(`Speech recognition error: ${event.error}`); }
        };
        recognition.onstart = () => { if(speechStatus) speechStatus.textContent = 'Listening...'; };
        recognition.onend = () => { if(isSpeakMode) { /* Only reset if stopped unexpectedly */ }; if(speakModeButton) speakModeButton.classList.remove('active'); isSpeakMode = false; };
    } else { console.warn("Speech Recognition not supported."); if(speakModeButton) speakModeButton.disabled = true; if(speechStatus) speechStatus.textContent = 'STT N/A'; }

    if(speakModeButton) {
        speakModeButton.addEventListener('click', () => {
            if (!recognition) return;
            if (isSpeakMode) { recognition.stop(); }
            else { try { recognition.start(); speakModeButton.classList.add('active'); isSpeakMode = true; } catch (e) { console.error("Error starting STT:", e); alert(`Could not start listening: ${e.message}`); } }
        });
    }

    function addChatMessage(sender, text) {
        if (!chatBox) return;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        messageDiv.textContent = text; // Use textContent for security
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight; // Scroll to bottom
        chatHistory.push({ sender, text }); // Update history
    }

    async function sendChatMessage() {
    if (!chatInput || !sendChatButton) return;
    const messageText = chatInput.value.trim();
    if (!messageText) return;

    addChatMessage('user', messageText);
    const currentMessage = messageText;
    chatInput.value = '';
    chatInput.disabled = true; // Disable input
    sendChatButton.disabled = true;

    const typingIndicator = document.createElement('div');
    typingIndicator.classList.add('message', 'bot', 'typing');
    typingIndicator.textContent = 'Ada is typing...';
    if(chatBox) { chatBox.appendChild(typingIndicator); chatBox.scrollTop = chatBox.scrollHeight; }

    // Prepare history for API call
    const historyForApi = chatHistory.slice(0, -1).slice(-6);

    let botReplyText = null; // Variable to store the reply text

    try {
        // --- Get Bot Reply ---
        const response = await callApi('/api/chat', {
            message: currentMessage,
            history: historyForApi
        });

        if (response && response.reply) {
            botReplyText = response.reply; // Store the reply
            addChatMessage('bot', botReplyText);
        } else {
            addChatMessage('bot', 'Sorry, I couldn\'t get a response. Please try again.');
        }

    } catch (error) {
         // Error likely handled within callApi, but catch here just in case
         console.error("Error during /api/chat call in sendChatMessage:", error);
         addChatMessage('bot', 'An error occurred while getting my reply.');
    } finally {
         // --- Remove Typing Indicator ---
         if(chatBox && chatBox.contains(typingIndicator)) {
             chatBox.removeChild(typingIndicator);
         }
         // --- Re-enable Input REGARDLESS of TTS success ---
         chatInput.disabled = false;
         sendChatButton.disabled = false;
         chatInput.focus();
         console.log("Chat input re-enabled."); // Add log for confirmation
    }

    // --- Speak the Reply (if successful) ---
    // This now happens *after* the input is re-enabled
    if (botReplyText) {
        try {
             console.log("Attempting to speak bot reply...");
             speakText(botReplyText, true); // Speak reply (use ElevenLabs if available)
        } catch (ttsError) {
             // Catch potential synchronous errors in speakText initiation
             console.error("Error initiating TTS:", ttsError);
        }
    }
}

    // --- Text Generator ---
    const textGenLevel = document.getElementById('text-gen-level');
    const textGenTopic = document.getElementById('text-gen-topic');
    const generateTextButton = document.getElementById('generate-text-button');
    const textGenOutput = document.getElementById('text-gen-output');
    if(generateTextButton) {
        generateTextButton.addEventListener('click', async () => {
            const level = textGenLevel ? textGenLevel.value : 'encounter';
            const topic = textGenTopic ? textGenTopic.value.trim() : '';
            if (!topic) { alert('Please enter a topic.'); return; }
            if(textGenOutput) textGenOutput.textContent = '';
            showOutputLoading('text-gen-output', true);
            const response = await callApi('/api/generate_text', { level, topic });
            showOutputLoading('text-gen-output', false);
            if(textGenOutput) textGenOutput.textContent = (response && response.generated_text) ? response.generated_text : 'Error generating text.';
        });
    }


    // --- Dictionary ---
    const dictWordInput = document.getElementById('dict-word');
    const lookupWordButton = document.getElementById('lookup-word-button');
    const dictOutput = document.getElementById('dict-output');
    function renderDictionaryResult(details, word) {
         if (!dictOutput) return;
         dictOutput.innerHTML = ''; // Clear previous
         if (details.toLowerCase().includes("not found") || details.toLowerCase().includes("nonsensical")) {
             dictOutput.textContent = `Could not find dictionary information for "${word}".`; return;
         }
         const header = document.createElement('h4');
         header.textContent = word.charAt(0).toUpperCase() + word.slice(1) + ' ';
         const speakButton = document.createElement('button');
         speakButton.innerHTML = '<i class="fas fa-volume-up"></i>'; speakButton.classList.add('speak-word-button'); speakButton.title = `Speak "${word}"`;
         speakButton.onclick = () => { speakText(word, false); }; // Use Web Speech for single word
         header.appendChild(speakButton); dictOutput.appendChild(header);
         const detailsDiv = document.createElement('div');
         // Basic sanitation + formatting
         detailsDiv.innerHTML = details
             .replace(/</g, "<").replace(/>/g, ">") // Prevent HTML injection
             .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Basic Markdown bold
             .replace(/(\n\d+\.\s)/g, '<br>$1') // Add breaks before numbered lists
             .replace(/\n/g, '<br>'); // Keep other line breaks
         dictOutput.appendChild(detailsDiv);
    }
    if(lookupWordButton) {
        lookupWordButton.addEventListener('click', async () => {
            const word = dictWordInput ? dictWordInput.value.trim() : '';
            if (!word) { alert('Please enter a word.'); return; }
            if(dictOutput) dictOutput.innerHTML = '';
            showOutputLoading('dict-output', true);
            const response = await callApi('/api/dictionary', { word });
            showOutputLoading('dict-output', false);
            if (response && response.details) { renderDictionaryResult(response.details, word); }
            else if(dictOutput) { dictOutput.textContent = 'Error looking up word.'; }
        });
    }
    if(dictWordInput) dictWordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { lookupWordButton.click(); } });


    // --- Text Corrector ---
    const correctorInput = document.getElementById('corrector-input');
    const correctTextButton = document.getElementById('correct-text-button');
    const correctedTextDisplay = document.getElementById('corrected-text-display');
    const feedbackDisplay = document.getElementById('feedback-display');
    if(correctTextButton) {
        correctTextButton.addEventListener('click', async () => {
            const text = correctorInput ? correctorInput.value.trim() : '';
            if (!text) { alert('Please enter text to correct.'); return; }
            if(correctedTextDisplay) correctedTextDisplay.textContent = '';
            if(feedbackDisplay) feedbackDisplay.textContent = '';
            showOutputLoading('corrector-output', true); // Add loading to the parent container
            const response = await callApi('/api/correct_text', { text });
            showOutputLoading('corrector-output', false);
            if (response) {
                if(correctedTextDisplay) correctedTextDisplay.textContent = response.corrected_text || "No correction provided.";
                if(feedbackDisplay) feedbackDisplay.innerHTML = response.feedback ? response.feedback.replace(/\n/g, '<br>') : "No feedback provided.";
            } else {
                if(correctedTextDisplay) correctedTextDisplay.textContent = 'Error correcting text.';
            }
        });
    }


    // --- Grammar Aid ---
    const grammarTopicInput = document.getElementById('grammar-topic');
    const explainGrammarButton = document.getElementById('explain-grammar-button');
    const grammarOutput = document.getElementById('grammar-output');
    if(explainGrammarButton) {
        explainGrammarButton.addEventListener('click', async () => {
            const topic = grammarTopicInput ? grammarTopicInput.value.trim() : '';
            if (!topic) { alert('Please enter a grammar topic.'); return; }
            if(grammarOutput) grammarOutput.textContent = '';
            showOutputLoading('grammar-output', true);
            const response = await callApi('/api/grammar_aid', { topic });
            showOutputLoading('grammar-output', false);
            if(grammarOutput) grammarOutput.innerHTML = (response && response.explanation) ? response.explanation.replace(/\n/g, '<br>') : 'Error explaining grammar topic.';
        });
    }
    if(grammarTopicInput) grammarTopicInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { explainGrammarButton.click(); } });


    // --- Essay Helper ---
    const essayTopicInput = document.getElementById('essay-topic');
    const essayTypeSelect = document.getElementById('essay-type');
    const generateOutlineButton = document.getElementById('generate-outline-button');
    const generateEssayButton = document.getElementById('generate-essay-button');
    const essayOutput = document.getElementById('essay-output');
    async function generateEssayContent(outlineOnly) {
        const topic = essayTopicInput ? essayTopicInput.value.trim() : '';
        const essayType = essayTypeSelect ? essayTypeSelect.value : 'argumentative';
        if (!topic) { alert('Please enter an essay topic.'); return; }
        if(essayOutput) essayOutput.textContent = '';
        showOutputLoading('essay-output', true);
        const response = await callApi('/api/essay', { topic, essay_type: essayType, outline_only: outlineOnly });
        showOutputLoading('essay-output', false);
        if(essayOutput) essayOutput.innerHTML = (response && response.essay_content) ? response.essay_content.replace(/\n/g, '<br>') : `Error generating ${outlineOnly ? 'outline' : 'essay'}.`;
    }
    if(generateOutlineButton) generateOutlineButton.addEventListener('click', () => generateEssayContent(true));
    if(generateEssayButton) generateEssayButton.addEventListener('click', () => generateEssayContent(false));


    // Initial loading state hide (handled by onAuthStateChanged now)
    // showLoading(false);

}); // End DOMContentLoaded
