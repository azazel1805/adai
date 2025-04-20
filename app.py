import os
import google.generativeai as genai
import requests
from flask import Flask, render_template, request, jsonify, Response # Added Response
from dotenv import load_dotenv

# --- Initialization ---
# Load environment variables from .env file for local development
load_dotenv()

app = Flask(__name__) # Standard Flask app initialization

# --- Configuration & API Keys (Loaded from Environment Variables) ---
try:
    GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY")
    ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
    ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "XrExE9yKIg1WjnnlVkGX") # Use default if not set

    if not GEMINI_API_KEY:
        print("CRITICAL ERROR: GOOGLE_API_KEY environment variable not set.")
        # Handle missing key appropriately in a real app (e.g., disable AI features)
    else:
        try:
            genai.configure(api_key=GEMINI_API_KEY)
            text_model = genai.GenerativeModel('gemini-1.5-flash') # Or your preferred model
            print("Gemini AI Model configured.")
        except Exception as gemini_config_error:
            print(f"ERROR configuring Gemini AI: {gemini_config_error}")
            text_model = None

    if not ELEVENLABS_API_KEY:
         print("WARNING: ELEVENLABS_API_KEY environment variable not set. TTS via ElevenLabs will fail.")

    ELEVENLABS_API_URL = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"

except Exception as startup_error:
     print(f"CRITICAL STARTUP ERROR during configuration: {startup_error}")
     GEMINI_API_KEY = None
     ELEVENLABS_API_KEY = None
     ELEVENLABS_API_URL = None
     text_model = None


# --- Firebase Admin SDK Initialization (Placeholder for Backend Auth - Requires setup) ---
# import firebase_admin
# from firebase_admin import credentials, auth
# # Load credentials (from file path in env var or directly from multi-line env var on Render)
# try:
#     # Option 1: Path to service account file
#     cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
#     # Option 2: JSON content in environment variable (useful for Render)
#     cred_json_str = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
#
#     if cred_path:
#          print(f"Initializing Firebase Admin with credentials file: {cred_path}")
#          cred = credentials.Certificate(cred_path)
#          firebase_admin.initialize_app(cred)
#     elif cred_json_str:
#          import json
#          print("Initializing Firebase Admin with JSON environment variable.")
#          cred_dict = json.loads(cred_json_str)
#          cred = credentials.Certificate(cred_dict)
#          firebase_admin.initialize_app(cred)
#     else:
#          print("WARNING: No Firebase Admin credentials found (GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON). Backend Auth verification disabled.")
#          # Optionally initialize without credentials for limited use cases, but auth will fail
#          # firebase_admin.initialize_app()
#
# except Exception as admin_init_error:
#      print(f"ERROR initializing Firebase Admin SDK: {admin_init_error}")


# --- Helper Function: Verify Firebase ID Token (Placeholder) ---
def verify_firebase_token(request):
    """
    Placeholder function to verify Firebase ID token.
    Returns the decoded token (user info) if valid, None otherwise.
    Requires Firebase Admin SDK to be initialized correctly.
    """
    # --- UNCOMMENT AND COMPLETE THIS LATER ---
    # id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    # if not id_token:
    #     print("Auth: No token provided in Authorization header.")
    #     return None
    # try:
    #     # Requires firebase_admin and auth to be imported and initialized
    #     decoded_token = auth.verify_id_token(id_token)
    #     print(f"Auth: Successfully verified token for UID: {decoded_token.get('uid')}")
    #     return decoded_token # Contains user info like UID, email etc.
    # except firebase_admin.auth.InvalidIdTokenError as e:
    #     print(f"Auth Error: Invalid ID token - {e}")
    # except firebase_admin.auth.ExpiredIdTokenError as e:
    #     print(f"Auth Error: Expired ID token - {e}")
    # except Exception as e:
    #     # Catch other potential errors (network, SDK not initialized, etc.)
    #     print(f"Auth Error: Failed to verify token - {type(e).__name__}: {e}")
    # return None # Verification failed
    # --- --- --- --- --- --- --- --- --- ---
    print("Auth: Backend token verification is currently disabled.")
    return {"placeholder_uid": "backend-auth-disabled"} # Return placeholder if disabled

# --- Helper Function: Call Gemini API ---
def generate_gemini_response(prompt, is_chat=False, chat_history=None):
    """Generates content using the Gemini API."""
    if not GEMINI_API_KEY or text_model is None:
         print("Error: Gemini API Key or Model is not configured correctly.")
         return "Error: AI service (Gemini) is not configured on the server."
    try:
        print(f"--- Sending Prompt to Gemini (len: {len(prompt)}) ---")
        if is_chat and chat_history is not None:
            full_prompt = "Conversation History:\n"
            for entry in chat_history:
                role = entry.get('role', 'unknown').capitalize()
                part = entry.get('parts', [''])[0] if entry.get('parts') else ''
                full_prompt += f"{role}: {part}\n"
            full_prompt += f"\nUser: {prompt}\nAda:"
            final_prompt_for_api = full_prompt
        else:
            final_prompt_for_api = prompt

        response = text_model.generate_content(final_prompt_for_api)

        if not response.candidates or not response.candidates[0].content.parts:
             block_reason = getattr(response.prompt_feedback, 'block_reason', None)
             if block_reason:
                 block_reason_name = block_reason.name
                 print(f"Gemini request/response blocked: {block_reason_name}")
                 return f"My safety filters blocked the request or response ({block_reason_name}). Please rephrase or try a different topic."
             else:
                 print("Gemini response was empty or malformed, no block reason given.")
                 return "Sorry, I couldn't generate a response. The AI might have returned an empty result."

        generated_text = response.text
        return generated_text
    except google.api_core.exceptions.ResourceExhausted as e:
         print(f"Error calling Gemini API: Quota Exceeded - {e}")
         return "Error: The AI service quota has been exceeded. Please try again later."
    except google.api_core.exceptions.InvalidArgument as e:
         print(f"Error calling Gemini API: Invalid Argument - {e}")
         return "Error: There was an issue with the format of the request to the AI. Please check your input."
    except Exception as e:
        print(f"Generic Error calling Gemini API: {type(e).__name__} - {e}")
        return "An unexpected error occurred while contacting the AI service. Please try again."


# --- Frontend Routes ---

@app.route('/')
def index():
    """Serves the main application page (index.html)."""
    # Client-side JS handles auth state and redirects
    return render_template('index.html')

@app.route('/signin')
def signin_page():
    """Serves the sign-in page."""
    # Client-side JS handles auth state and redirects
    return render_template('signin.html')

# --- Backend API Routes ---

@app.route('/api/chat', methods=['POST'])
def api_chat():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None:
        return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400
    user_message = data.get('message')
    history = data.get('history', [])
    if not user_message: return jsonify({"error": "No message provided"}), 400
    if not isinstance(history, list): return jsonify({"error": "Invalid history format"}), 400
    gemini_history_context = []
    for msg in history[-6:]:
        if isinstance(msg, dict) and 'sender' in msg and 'text' in msg:
             role = "user" if msg.get('sender') == 'user' else 'model'
             text = msg.get('text', '')
             gemini_history_context.append({"role": role, "parts": [text]})
        else: print(f"Skipping invalid history item: {msg}")
    system_instruction = """You are Ada, a friendly, patient, helpful, and knowledgeable English teaching assistant AI...""" # Keep your prompt
    response_text = generate_gemini_response(
        prompt=user_message, is_chat=True, chat_history=gemini_history_context
    )
    return jsonify({"reply": response_text})


@app.route('/api/generate_text', methods=['POST'])
def api_generate_text():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400
    level = data.get('level')
    topic = data.get('topic')
    if not level or not topic: return jsonify({"error": "Level and topic are required"}), 400

    level_map = {
        "beginner": "very simple (CEFR A1-A2)",
        "encounter": "simple (CEFR A2-B1)",
        "investigation": "intermediate (CEFR B1-B2)",
        "awakening": "upper-intermediate (CEFR B2)",
        "summit": "advanced (CEFR C1)",
        "expert": "near-native/highly advanced (CEFR C2)"
    }
    level_description = level_map.get(level.lower(), "intermediate (CEFR B1-B2)")

    # --- MODIFIED PROMPT ---
    prompt = f"""
Instructions:
You are an assistant generating educational content.
Your task is to write a short text (approximately 150-250 words) on a specific topic, tailored for an English language learner.
The text should be engaging, grammatically correct, and use vocabulary/syntax suitable for the specified proficiency level.
Output *only* the generated text itself, with no extra explanations, titles, or commentary.

Parameters:
Topic: "{topic}"
Proficiency Level: {level_description}

Generated Text:
""" # Added a clear label for the output section

    print(f"--- Sending Text Gen Prompt ---\nLevel: {level_description}\nTopic: {topic}\nPrompt:\n{prompt[:300]}...") # Log the prompt start

    generated_text = generate_gemini_response(prompt)

    print(f"--- Received Text Gen Output ---\nOutput: {generated_text[:300]}...") # Log the response start

    # Basic check if response resembles the input level (indicates failure)
    if generated_text.strip().lower() == level.lower() or level_description in generated_text.strip()[:len(level_description)+20]:
         print(f"Warning: Text Gen output '{generated_text}' looks like an echo of the input level/description. Retrying or returning error.")
         # Optionally: You could try a slightly different prompt format and retry once
         # Or just return an error message to the user
         return jsonify({"generated_text": f"Error: The AI failed to generate text for this topic/level (received: '{generated_text}'). Please try a different topic or level."})

    return jsonify({"generated_text": generated_text})


@app.route('/api/dictionary', methods=['POST'])
def api_dictionary():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400
    word = data.get('word')
    if not word or not isinstance(word, str) or len(word.split()) > 1:
        return jsonify({"error": "A single valid word is required"}), 400
    prompt = f"""Provide a detailed dictionary entry for the English word: "{word}". Include sections for Definition(s), Synonyms, Antonyms, Etymology, Example Sentence(s), and Turkish Meaning. Format clearly. If not found, state that."""
    definition_details = generate_gemini_response(prompt)
    return jsonify({"details": definition_details})


@app.route('/api/correct_text', methods=['POST'])
def api_correct_text():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400
    text = data.get('text')
    if not text or not isinstance(text, str): return jsonify({"error": "Text to correct is required"}), 400
    prompt = f"""Act as an expert English proofreader and teacher. Review the following text written by an English language learner. Provide the corrected version under "Corrected Text:" and detailed feedback under "Feedback:". Original Text:\n---\n{text}\n---\nCorrected Text:\n[Your corrected version here]\n\nFeedback:\n* [Feedback point 1]\n..."""
    correction_and_feedback = generate_gemini_response(prompt)
    # --- Parsing logic (same as before) ---
    corrected_text = "Could not parse correction from AI response."
    feedback = "Could not parse feedback from AI response."
    try:
        corrected_text_marker = "Corrected Text:"
        feedback_marker = "Feedback:"
        corrected_start_index = correction_and_feedback.find(corrected_text_marker)
        feedback_start_index = correction_and_feedback.find(feedback_marker)
        if corrected_start_index != -1:
            corrected_text_content_start = corrected_start_index + len(corrected_text_marker)
            end_index = feedback_start_index if (feedback_start_index != -1 and feedback_start_index > corrected_start_index) else len(correction_and_feedback)
            corrected_text = correction_and_feedback[corrected_text_content_start:end_index].strip()
        if feedback_start_index != -1:
             feedback_content_start = feedback_start_index + len(feedback_marker)
             feedback = correction_and_feedback[feedback_content_start:].strip()
        elif corrected_start_index == -1 and len(correction_and_feedback) < 150: # Guess short response is feedback/error
             feedback = correction_and_feedback
    except Exception as parse_error:
        print(f"Error parsing correction response: {parse_error}")
        corrected_text = "Error processing AI response."
        feedback = correction_and_feedback
    return jsonify({"corrected_text": corrected_text, "feedback": feedback})


@app.route('/api/grammar_aid', methods=['POST'])
def api_grammar_aid():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400
    topic = data.get('topic')
    if not topic or not isinstance(topic, str): return jsonify({"error": "Grammar topic is required"}), 400
    prompt = f"Explain the English grammar topic '{topic}' clearly and comprehensively for an intermediate English learner (CEFR B1-B2 level). Cover rules, usage, examples, and exceptions. Output only the explanation."
    explanation = generate_gemini_response(prompt)
    return jsonify({"explanation": explanation})


@app.route('/api/essay', methods=['POST'])
def api_essay():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400
    topic = data.get('topic')
    essay_type = data.get('essay_type', 'argumentative')
    generate_outline = data.get('outline_only', False)
    if not topic or not isinstance(topic, str): return jsonify({"error": "Essay topic is required"}), 400
    allowed_essay_types = ['argumentative', 'persuasive', 'expository', 'narrative', 'descriptive', 'compare and contrast', 'cause and effect', 'critical analysis']
    if not isinstance(essay_type, str) or essay_type.lower() not in allowed_essay_types: essay_type = 'argumentative'
    if generate_outline:
        prompt = f"Create a detailed outline for a {essay_type} essay on the topic: '{topic}'. Include intro (hook, thesis), body points (topic sentences, supporting ideas), and conclusion (summary, restated thesis)."
    else:
        prompt = f"Write a complete {essay_type} essay (approx. 5 paragraphs) on the topic: '{topic}'. Include intro (hook, thesis), body paragraphs (topic sentences, support), transitions, and conclusion (summary, final thought)."
    essay_content = generate_gemini_response(prompt)
    return jsonify({"essay_content": essay_content})


@app.route('/api/elevenlabs_tts', methods=['POST'])
def elevenlabs_tts():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---
    if not ELEVENLABS_API_KEY:
        print("ERROR: ElevenLabs API Key not configured.")
        return jsonify({"error": "TTS service (ElevenLabs) is not configured."}), 503
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400
    text_to_speak = data.get('text')
    if not text_to_speak or not isinstance(text_to_speak, str): return jsonify({"error": "No valid text provided for TTS"}), 400
    headers = {"Accept": "audio/mpeg", "Content-Type": "application/json", "xi-api-key": ELEVENLABS_API_KEY}
    payload = {"text": text_to_speak, "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.55, "similarity_boost": 0.75, "style": 0.3, "use_speaker_boost": True}}
    try:
        response = requests.post(ELEVENLABS_API_URL, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        print("ElevenLabs TTS successful, returning audio stream.")
        return Response(response.content, mimetype='audio/mpeg')
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP Error calling ElevenLabs API: {http_err.response.status_code} - {http_err.response.text}")
        error_detail = f"ElevenLabs Error ({http_err.response.status_code})"
        try: err_json = http_err.response.json(); error_detail = err_json.get('detail', {}).get('message', str(err_json))
        except ValueError: error_detail = http_err.response.text
        return jsonify({"error": f"Failed to generate audio: {error_detail}"}), http_err.response.status_code if http_err.response.status_code >= 400 else 500
    except requests.exceptions.RequestException as req_err:
        print(f"Network Error calling ElevenLabs API: {req_err}")
        return jsonify({"error": f"Could not connect to TTS service: {req_err}"}), 504
    except Exception as e:
        print(f"Unexpected error during ElevenLabs TTS proxy: {type(e).__name__} - {e}")
        return jsonify({"error": "An unexpected server error occurred during TTS processing."}), 500


# --- Main Execution ---
if __name__ == '__main__':
    # Read PORT and DEBUG settings from environment variables
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    # Run the Flask app
    # host='0.0.0.0' makes it accessible externally (important for Render/Docker)
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
