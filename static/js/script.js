document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Auth ---
    const auth = firebase.auth(); // Get auth instance
    const userInfo = document.querySelector('.user-info');
    const userEmailDisplay = document.getElementById('user-email');
    const signOutButton = document.getElementById('sign-out-button');
    const mainContent = document.getElementById('main-content');
    const loadingOverlay = document.getElementById('loading-overlay');
    const bodyElement = document.body; // Get body for loading class

    // --- TTS Toggle State & Elements ---
    // Load preference, default to true (TTS ON) if not set or invalid
    let isTtsEnabled = localStorage.getItem('isTtsEnabled') !== 'false';
    const toggleTtsButton = document.getElementById('toggle-tts-button');
    const ttsIcon = toggleTtsButton ? toggleTtsButton.querySelector('i') : null;

    // --- Function to Update TTS Button Appearance ---
    function updateTtsButtonState() {
        if (!toggleTtsButton || !ttsIcon) return; // Element check

        if (isTtsEnabled) {
            ttsIcon.classList.remove('fa-volume-mute'); // Ensure mute icon is removed
            ttsIcon.classList.add('fa-volume-up');     // Ensure up icon is present
            toggleTtsButton.title = "Toggle Bot Speech Output (On)";
            toggleTtsButton.classList.remove('muted'); // Remove muted style class
            console.log("TTS Enabled");
        } else {
            ttsIcon.classList.remove('fa-volume-up');   // Ensure up icon is removed
            ttsIcon.classList.add('fa-volume-mute');  // Ensure mute icon is present
            toggleTtsButton.title = "Toggle Bot Speech Output (Off)";
            toggleTtsButton.classList.add('muted');   // Add muted style class
            console.log("TTS Disabled");
        }
    }

    // --- Set Initial TTS Button State on Load ---
    updateTtsButtonState();

    // --- Add Event Listener for TTS Toggle Button ---
    if (toggleTtsButton) {
        toggleTtsButton.addEventListener('click', () => {
            isTtsEnabled = !isTtsEnabled; // Toggle the state
            localStorage.setItem('isTtsEnabled', isTtsEnabled); // Save preference
            updateTtsButtonState(); // Update the button's look

            // If TTS is currently speaking and we just disabled it, stop it.
            if (!isTtsEnabled && synth.speaking) {
                console.log("Stopping current speech due to TTS toggle.");
                synth.cancel();
            }
        });
    } else {
         console.warn("Toggle TTS Button (#toggle-tts-button) not found.");
    }


    // --- Auth State Listener (Core Logic) ---
    let initialAuthCheckComplete = false;
    // Add loading class initially
    if (bodyElement) bodyElement.classList.add('auth-loading');
    showLoading(true); // Show overlay initially

    auth.onAuthStateChanged(user => {
        const currentPath = window.location.pathname; // Get current page path

        if (!initialAuthCheckComplete) {
             console.log("Initial auth state determined.");
             initialAuthCheckComplete = true;
             if (bodyElement) bodyElement.classList.remove('auth-loading'); // Remove hiding class
        }

        if (user) {
            // --- User is SIGNED IN ---
            console.log('Auth State: Signed In - User:', user.email);
            if(userEmailDisplay) userEmailDisplay.textContent = user.email;
            if(userInfo) userInfo.style.display = 'flex';
            if(mainContent) mainContent.style.display = 'flex'; // Show main content area

            if (currentPath === '/signin' || currentPath.startsWith('/signin?')) {
                 console.log("Redirecting signed-in user from /signin to /");
                 window.location.replace('/');
            } else {
                 showLoading(false); // Hide loader if not redirecting
            }
        } else {
            // --- User is SIGNED OUT ---
            console.log('Auth State: Signed Out');
            if(userInfo) userInfo.style.display = 'none';
            if(mainContent) mainContent.style.display = 'none'; // Hide main content area

            if (currentPath !== '/signin' && !currentPath.startsWith('/signin?')) {
                console.log("Redirecting signed-out user to /signin");
                window.location.replace('/signin');
            } else {
                showLoading(false); // Hide loader when on signin page
            }
        }
    });

    // --- Sign Out Button ---
    if (signOutButton) {
        signOutButton.addEventListener('click', () => {
            showLoading(true);
            auth.signOut().then(() => {
                console.log('Sign-out successful, onAuthStateChanged will handle redirect.');
            }).catch((error) => {
                console.error('Sign-out error:', error);
                alert('Error signing out: ' + error.message);
                showLoading(false); // Hide loading only if error prevents state change
            });
        });
    }

    // --- Loading Overlay ---
    function showLoading(show) {
        if (loadingOverlay) {
             loadingOverlay.style.display = show ? 'flex' : 'none';
        } else {
             // console.warn("Loading overlay element not found."); // Reduced verbosity
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
        showLoading(true);
        let idToken = null;

        if (!auth.currentUser) {
            console.warn("API call attempted without signed-in user for endpoint:", endpoint);
            alert("You need to be signed in to use this feature.");
            showLoading(false);
            return null;
        }
        try {
            idToken = await auth.currentUser.getIdToken(true); // Force refresh
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
                let errorMsg = `API Error (${response.status})`; let errorData = null;
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
            if (contentType?.includes("application/json")) { return await response.json(); }
            else if (contentType?.includes("audio/mpeg")) { return await response.blob(); }
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

    // --- Chatbot Elements & State ---
    const chatBox = document.getElementById('chat-box');
    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat-button');
    const speakModeButton = document.getElementById('speak-mode-button'); // Button triggers STT
    const speechStatus = document.getElementById('speech-status');
    let chatHistory = [];
    let recognition; // SpeechRecognition instance
    let isListening = false; // Track STT state

    // --- Initialize Chat ---
    function initializeChat() {
        if (!chatBox) return;
        const initialBotMessageDiv = chatBox.querySelector('.message.bot');
        if (initialBotMessageDiv) {
             chatHistory = [{ sender: 'bot', text: initialBotMessageDiv.textContent }];
        } else {
             // Add initial message if missing (e.g., after history clear)
             addChatMessage('bot', "Hi! I'm Ada. How can I help you practice English today?");
        }
    }
    initializeChat();

    // --- Web Speech API - TTS ---
    const synth = window.speechSynthesis;
    let britVoice = null;
    function loadVoices() {
        const voices = synth.getVoices();
        britVoice = voices.find(voice => voice.lang === 'en-GB' && voice.name.includes('Google')) ||
                   voices.find(voice => voice.lang === 'en-GB');
        // console.log("Selected British voice:", britVoice);
    }
    if (synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = loadVoices; } loadVoices();

    // --- MODIFIED speakText Function (Remove direct key check) ---
    function speakText(text, useElevenLabs = true) {
        if (!isTtsEnabled) { /* console.log("TTS disabled."); */ return; }
        if (!text || typeof text !== 'string') { console.warn("speakText invalid input:", text); return; }

        let textToSpeak = text.trim();
        if (textToSpeak.toLowerCase().startsWith("ada:")) {
            textToSpeak = textToSpeak.substring(4).trim();
        }
        if (!textToSpeak) { return; }

        // console.log(`Speaking (11L: ${useElevenLabs}): ${textToSpeak.substring(0,50)}...`);
        synth.cancel();

        // --- REMOVE THE KEY CHECK HERE ---
        // if (useElevenLabs && ELEVENLABS_API_KEY) { // <-- OLD LINE
        if (useElevenLabs) {                        // <-- NEW LINE (Just check the flag)
             // --- END REMOVAL ---
             console.log("Attempting backend ElevenLabs TTS..."); // Log intent
             callApi('/api/elevenlabs_tts', { text: textToSpeak }).then(audioBlob => {
                 if (audioBlob instanceof Blob) {
                     if (!isTtsEnabled) return;
                     const audioUrl = URL.createObjectURL(audioBlob);
                     const audio = new Audio(audioUrl);
                     audio.play().catch(e => { console.error("Error playing 11L audio:", e); speakText(textToSpeak, false); }); // Fallback
                     audio.onended = () => URL.revokeObjectURL(audioUrl);
                 } else {
                      // API call likely failed (returned error JSON or null), fallback
                      console.warn("ElevenLabs call did not return Blob, falling back to Web Speech.");
                      speakText(textToSpeak, false);
                 }
             }).catch(e => {
                 // Network error or other issue with callApi itself
                 console.error("Error in ElevenLabs API call promise:", e);
                 speakText(textToSpeak, false); // Fallback
             });
        } else {
             // Use Web Speech API (Fallback)
             console.log("Using Web Speech API TTS...");
             speakUtterance(textToSpeak);
        }
    }

    function speakUtterance(text){
        if (!isTtsEnabled) { return; }
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onerror = (event) => console.error('TTS Utterance Error:', event.error);
            if (britVoice) { utterance.voice = britVoice; utterance.lang = 'en-GB'; }
            else { utterance.lang = 'en-GB'; }
            synth.speak(utterance);
        } catch (e) { console.error("Error initiating synth:", e); }
    }

    // --- Web Speech API - STT ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false; recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;

        // --- MODIFIED STT onresult Handler (Auto-sends message) ---
        recognition.onresult = (event) => {
            isListening = false; // No longer actively listening
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            console.log('Speech recognized:', transcript);
            if (chatInput) chatInput.value = transcript;
            if(speechStatus) speechStatus.textContent = 'Recognized!';
            if(speakModeButton) speakModeButton.classList.remove('active', 'listening');

            if (transcript) {
                 console.log("Auto-sending recognized speech.");
                 // Short delay to allow UI update before potential alert from callApi
                 setTimeout(sendChatMessage, 50);
            } else {
                 console.log("Empty transcript.");
                 if(speechStatus) speechStatus.textContent = 'Empty result';
            }
        };

        recognition.onspeechend = () => {
            // Might fire before onresult, so stop recognition but wait for result
            recognition.stop();
            isListening = false;
            if(speechStatus && speechStatus.textContent === 'Listening...') speechStatus.textContent = 'Processing...';
            if(speakModeButton) speakModeButton.classList.remove('listening'); // Remove listening style
            console.log("Speech ended.");
        };
        recognition.onnomatch = (event) => {
             isListening = false;
             if(speechStatus) speechStatus.textContent = 'No match';
             if(speakModeButton) speakModeButton.classList.remove('active', 'listening');
             console.log("No speech recognized.");
        };
        recognition.onerror = (event) => {
             isListening = false;
             console.error('STT error:', event.error, event.message);
             if(speechStatus) speechStatus.textContent = `Error: ${event.error}`;
             if(speakModeButton) speakModeButton.classList.remove('active', 'listening');
             if (event.error === 'not-allowed'||event.error === 'service-not-allowed') { alert("Microphone access denied."); }
             else if (event.error !== 'no-speech') { // Don't alert for no speech
                  alert(`Speech recognition error: ${event.error}`);
             }
        };
        recognition.onstart = () => {
             isListening = true;
             if(speechStatus) speechStatus.textContent = 'Listening...';
             if(speakModeButton) speakModeButton.classList.add('active', 'listening');
             console.log("Speech recognition started.");
        };
        recognition.onend = () => {
             // Fired after onresult, onnomatch, onerror, or stop()
             isListening = false;
             if(speakModeButton) speakModeButton.classList.remove('active', 'listening');
             if(speechStatus && (speechStatus.textContent === 'Listening...' || speechStatus.textContent === 'Processing...')) {
                  // Clear status if recognition ended without a final result status
                  speechStatus.textContent = '';
             }
             console.log("Speech recognition ended.");
        };
    } else { /* STT not supported handling */ }

    // --- MODIFIED Speak Button Listener (Triggers STT) ---
    if(speakModeButton && recognition) {
        speakModeButton.addEventListener('click', () => {
            if (isListening) {
                 console.log("Stop button clicked while listening.");
                 recognition.stop(); // Manually stop listening
                 // onend handler will update UI
                 return;
            }
            if (chatInput && chatInput.disabled) {
                 console.log("Cannot start STT while bot is replying.");
                 return; // Don't allow if bot is processing
            }
            try {
                console.log("Speak button clicked, starting recognition.");
                recognition.start(); // onstart handler updates UI
            } catch (e) {
                console.error("Error starting STT:", e);
                alert(`Could not start listening: ${e.message}`);
                isListening = false; // Ensure state is correct on error
                if(speechStatus) speechStatus.textContent = 'Start Error';
                if(speakModeButton) speakModeButton.classList.remove('active', 'listening');
            }
        });
    } else if (speakModeButton) { speakModeButton.disabled = true; }


    // --- Add Chat Message Function ---
    function addChatMessage(sender, text) {
        if (!chatBox) return;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        messageDiv.textContent = text;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        // Update history *after* adding to UI if using this for context
         chatHistory.push({ sender, text });
         // console.log("History updated:", chatHistory); // Debug log
    }

    // --- sendChatMessage Function (Handles disabling/enabling inputs) ---
    async function sendChatMessage() {
        console.log("sendChatMessage: Started.");
        if (!chatInput || !sendChatButton || !speakModeButton) { console.error("Chat elements missing."); return; }
        if (!auth.currentUser) { alert("Error: Not signed in."); return; }

        const messageText = chatInput.value.trim();
        if (!messageText) { console.log("sendChatMessage: Empty message."); return; }

        console.log("sendChatMessage: Sending:", messageText);

        // --- IMPORTANT: Add user message to history BEFORE clearing input ---
         addChatMessage('user', messageText);
         const currentMessage = messageText; // Keep track of message being sent
         chatInput.value = ''; // Clear input *after* adding to history/storing

        // --- Disable Inputs ---
        chatInput.disabled = true;
        sendChatButton.disabled = true;
        speakModeButton.disabled = true; // Disable speak button too
        console.log("sendChatMessage: Inputs disabled.");

        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('message', 'bot', 'typing');
        typingIndicator.textContent = 'Ada is typing...';
        if(chatBox) { chatBox.appendChild(typingIndicator); chatBox.scrollTop = chatBox.scrollHeight; }

        // --- Prepare history for API (Exclude the message just sent) ---
        const historyForApi = chatHistory.slice(0, -1).slice(-6); // History *before* currentMessage
        let botReplyText = null;

        try {
            console.log("sendChatMessage: Calling /api/chat...");
            const response = await callApi('/api/chat', {
                message: currentMessage, // Pass the user's actual message
                history: historyForApi
            });
            console.log("sendChatMessage: Finished /api/chat call.");

            if (response && response.reply) {
                botReplyText = response.reply;
                addChatMessage('bot', botReplyText); // Add bot reply to UI and history
            } else {
                console.log("sendChatMessage: No valid reply from API.");
                addChatMessage('bot', 'Sorry, I couldn\'t get a response.'); // Add error message to UI and history
            }
        } catch (error) {
             console.error("sendChatMessage: Error during API call:", error);
             addChatMessage('bot', 'An error occurred while getting my reply.'); // Add error message
        } finally {
             console.log("sendChatMessage: Entering finally block.");
             if(chatBox && chatBox.contains(typingIndicator)) {
                 chatBox.removeChild(typingIndicator);
             }
             // --- Re-enable Inputs ---
             chatInput.disabled = false;
             sendChatButton.disabled = false;
             if (recognition) speakModeButton.disabled = false; // Only enable if STT supported
             console.log("sendChatMessage: Inputs re-enabled.");
             // chatInput.focus(); // Re-focus might interfere with STT flow, make optional
        }

        // --- Speak the Reply (if successful) ---
        if (botReplyText) {
            speakText(botReplyText, true); // Speak reply
        }
    } // End sendChatMessage


    // --- Event listeners for Chat Send/Enter ---
    if(sendChatButton) {
         sendChatButton.addEventListener('click', () => {
              console.log("Send button clicked handler.");
              sendChatMessage();
         });
    }
    if(chatInput) {
         chatInput.addEventListener('keypress', (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                   console.log("Enter key pressed handler.");
                   e.preventDefault();
                   sendChatMessage();
              }
         });
    }

    // --- Other Feature Handlers (Keep existing) ---
    // ... Text Generator, Dictionary, Corrector, Grammar, Essay event listeners and functions ...
    const textGenLevel = document.getElementById('text-gen-level');
    const textGenTopic = document.getElementById('text-gen-topic');
    const generateTextButton = document.getElementById('generate-text-button');
    const textGenOutput = document.getElementById('text-gen-output');
    if(generateTextButton){ /* ... keep listener ... */ }

    const dictWordInput = document.getElementById('dict-word');
    const lookupWordButton = document.getElementById('lookup-word-button');
    const dictOutput = document.getElementById('dict-output');
    function renderDictionaryResult(details, word) { /* ... keep function ... */ }
    if(lookupWordButton){ /* ... keep listener ... */ }
    if(dictWordInput){ /* ... keep listener ... */ }

    const correctorInput = document.getElementById('corrector-input');
    const correctTextButton = document.getElementById('correct-text-button');
    const correctedTextDisplay = document.getElementById('corrected-text-display');
    const feedbackDisplay = document.getElementById('feedback-display');
    if(correctTextButton){ /* ... keep listener ... */ }

    const grammarTopicInput = document.getElementById('grammar-topic');
    const explainGrammarButton = document.getElementById('explain-grammar-button');
    const grammarOutput = document.getElementById('grammar-output');
    if(explainGrammarButton){ /* ... keep listener ... */ }
    if(grammarTopicInput){ /* ... keep listener ... */ }

    const essayTopicInput = document.getElementById('essay-topic');
    const essayTypeSelect = document.getElementById('essay-type');
    const generateOutlineButton = document.getElementById('generate-outline-button');
    const generateEssayButton = document.getElementById('generate-essay-button');
    const essayOutput = document.getElementById('essay-output');
    async function generateEssayContent(outlineOnly) { /* ... keep function ... */ }
    if(generateOutlineButton) generateOutlineButton.addEventListener('click', () => generateEssayContent(true));
    if(generateEssayButton) generateEssayButton.addEventListener('click', () => generateEssayContent(false));

}); // End DOMContentLoaded
