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
        text_model = None # Ensure model is None if key is missing
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
# try:
#     cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
#     cred_json_str = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
#     if cred_path:
#          cred = credentials.Certificate(cred_path); firebase_admin.initialize_app(cred)
#     elif cred_json_str:
#          import json; cred_dict = json.loads(cred_json_str); cred = credentials.Certificate(cred_dict); firebase_admin.initialize_app(cred)
#     else: print("WARNING: No Firebase Admin credentials found.")
# except Exception as admin_init_error: print(f"ERROR initializing Firebase Admin SDK: {admin_init_error}")


# --- Helper Function: Verify Firebase ID Token (Placeholder) ---
def verify_firebase_token(request):
    """Placeholder function to verify Firebase ID token."""
    # --- UNCOMMENT AND COMPLETE THIS LATER with firebase_admin setup ---
    # if not firebase_admin._apps: return None # Check if SDK initialized
    # id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    # if not id_token: return None
    # try:
    #     decoded_token = auth.verify_id_token(id_token)
    #     return decoded_token
    # except Exception as e: print(f"Auth Error: {e}"); return None
    # --- --- --- --- --- --- --- --- --- ---
    # print("Auth: Backend token verification is currently disabled.") # Remove when uncommenting
    return {"placeholder_uid": "backend-auth-disabled"} # Return placeholder if disabled

# --- Helper Function: Call Gemini API ---
def generate_gemini_response(prompt, is_chat=False, chat_history=None):
    """Generates content using the Gemini API."""
    if not GEMINI_API_KEY or text_model is None:
         print("Error: Gemini API Key or Model is not configured correctly.")
         # Return a structured error message that the frontend might understand
         return {"error": "AI service not configured"}

    try:
        print(f"--- Sending Prompt to Gemini (Type: {'Chat' if is_chat else 'Generate'}, Len: {len(prompt)}) ---")
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

        # Check for blocked content or empty response
        if not response.candidates or not response.candidates[0].content.parts:
             block_reason = getattr(response.prompt_feedback, 'block_reason', None)
             if block_reason:
                 block_reason_name = block_reason.name
                 print(f"Gemini request/response blocked: {block_reason_name}")
                 # Return structured error
                 return {"error": f"Blocked by safety filters ({block_reason_name})"}
             else:
                 print("Gemini response was empty or malformed.")
                 return {"error": "AI returned empty result"}

        generated_text = response.text
        # Return the text directly for easier handling in calling functions
        return generated_text
    except google.api_core.exceptions.ResourceExhausted as e:
         print(f"Error calling Gemini API: Quota Exceeded - {e}")
         return {"error": "AI service quota exceeded"}
    except google.api_core.exceptions.InvalidArgument as e:
         print(f"Error calling Gemini API: Invalid Argument - {e}")
         return {"error": "Invalid request to AI"}
    except Exception as e:
        print(f"Generic Error calling Gemini API: {type(e).__name__} - {e}")
        return {"error": "Unexpected AI service error"}


# --- Frontend Routes ---
@app.route('/')
def index(): return render_template('index.html')
@app.route('/signin')
def signin_page(): return render_template('signin.html')

# --- Backend API Routes ---

@app.route('/api/chat', methods=['POST'])
def api_chat():
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    user_message = data.get('message')
    history = data.get('history', [])
    if not user_message: return jsonify({"error": "No message"}), 400
    if not isinstance(history, list): return jsonify({"error": "Invalid history"}), 400
    gemini_history_context = []
    for msg in history[-6:]:
        if isinstance(msg, dict) and 'sender' in msg and 'text' in msg:
             role = "user" if msg.get('sender') == 'user' else 'model'
             text = msg.get('text', '')
             gemini_history_context.append({"role": role, "parts": [text]})
    system_instruction = """You are Ada, a friendly, patient, helpful English teaching assistant AI..."""
    response_content = generate_gemini_response(
        prompt=user_message, is_chat=True, chat_history=gemini_history_context
    )
    # Check if helper returned an error object
    if isinstance(response_content, dict) and 'error' in response_content:
         return jsonify(response_content), 500 # Return AI service error
    return jsonify({"reply": response_content}) # Return successful reply


@app.route('/api/generate_text', methods=['POST'])
def api_generate_text():
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    level = data.get('level')
    topic = data.get('topic')
    if not level or not topic: return jsonify({"error": "Level and topic required"}), 400
    level_map = { "beginner": "very simple (CEFR A1-A2)", "encounter": "simple (CEFR A2-B1)", "investigation": "intermediate (CEFR B1-B2)", "awakening": "upper-intermediate (CEFR B2)", "summit": "advanced (CEFR C1)", "expert": "near-native/highly advanced (CEFR C2)" }
    level_description = level_map.get(level.lower(), "intermediate (CEFR B1-B2)")
    prompt = f"""Instructions:\nGenerate educational content. Write a short text (150-250 words) on a topic for an English learner.\nText should be engaging, correct, and use vocabulary/syntax for the specified level.\nOutput *only* the generated text itself.\n\nParameters:\nTopic: "{topic}"\nProficiency Level: {level_description}\n\nGenerated Text:\n"""
    generated_text = generate_gemini_response(prompt)
    # Check for error from helper
    if isinstance(generated_text, dict) and 'error' in generated_text:
         return jsonify({"generated_text": f"Error: {generated_text['error']}"}), 500
    # Check if output looks like echo
    if generated_text.strip().lower() == level.lower() or level_description in generated_text.strip()[:len(level_description)+20]:
        print(f"Warning: Text Gen output '{generated_text}' looks like an echo.")
        return jsonify({"generated_text": f"Error: AI failed to generate text (received '{generated_text[:50]}...'). Try again."}), 500
    return jsonify({"generated_text": generated_text})


@app.route('/api/dictionary', methods=['POST'])
def api_dictionary():
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    word = data.get('word')
    if not word or not isinstance(word, str) or len(word.split()) > 1: return jsonify({"error": "Single valid word required"}), 400
    prompt = f"""Provide a detailed dictionary entry for "{word}". Include Definition(s), Synonyms, Antonyms, Etymology, Example Sentence(s), Turkish Meaning. Format clearly. If not found, state that."""
    definition_details = generate_gemini_response(prompt)
    if isinstance(definition_details, dict) and 'error' in definition_details:
        return jsonify({"details": f"Error: {definition_details['error']}"}), 500
    return jsonify({"details": definition_details})


@app.route('/api/correct_text', methods=['POST'])
def api_correct_text():
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    text = data.get('text')
    if not text or not isinstance(text, str): return jsonify({"error": "Text required"}), 400
    prompt = f"""Act as expert proofreader/teacher. Review text by learner. Provide corrected version under "Corrected Text:" and detailed feedback under "Feedback:".\nOriginal Text:\n---\n{text}\n---\nCorrected Text:\n[Your corrected version]\n\nFeedback:\n* [Feedback point 1]\n..."""
    correction_and_feedback = generate_gemini_response(prompt)
    if isinstance(correction_and_feedback, dict) and 'error' in correction_and_feedback:
        return jsonify({"corrected_text": f"Error: {correction_and_feedback['error']}", "feedback": ""}), 500
    # --- Parsing logic ---
    corrected_text = "Could not parse correction."
    feedback = "Could not parse feedback."
    try:
        # Use markers robustly
        corr_marker, feed_marker = "Corrected Text:", "Feedback:"
        corr_idx, feed_idx = correction_and_feedback.find(corr_marker), correction_and_feedback.find(feed_marker)
        if corr_idx != -1:
            corr_start = corr_idx + len(corr_marker)
            end_idx = feed_idx if (feed_idx != -1 and feed_idx > corr_idx) else len(correction_and_feedback)
            corrected_text = correction_and_feedback[corr_start:end_idx].strip()
        if feed_idx != -1:
             feed_start = feed_idx + len(feed_marker)
             feedback = correction_and_feedback[feed_start:].strip()
        elif corr_idx == -1 and len(correction_and_feedback) < 150: feedback = correction_and_feedback # Short resp likely feedback/error
    except Exception as parse_error: print(f"Error parsing correction: {parse_error}"); feedback = correction_and_feedback # Return raw on parse fail
    return jsonify({"corrected_text": corrected_text, "feedback": feedback})


@app.route('/api/grammar_aid', methods=['POST'])
def api_grammar_aid():
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    topic = data.get('topic')
    if not topic or not isinstance(topic, str): return jsonify({"error": "Topic required"}), 400
    prompt = f"Explain English grammar topic '{topic}' clearly for intermediate learner (B1-B2). Cover rules, usage, examples, exceptions. Output only the explanation."
    explanation = generate_gemini_response(prompt)
    if isinstance(explanation, dict) and 'error' in explanation:
        return jsonify({"explanation": f"Error: {explanation['error']}"}), 500
    return jsonify({"explanation": explanation})


@app.route('/api/essay', methods=['POST'])
def api_essay():
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    topic = data.get('topic')
    essay_type = data.get('essay_type', 'argumentative')
    generate_outline = data.get('outline_only', False)
    if not topic or not isinstance(topic, str): return jsonify({"error": "Topic required"}), 400
    allowed_essay_types = ['argumentative', 'persuasive', 'expository', 'narrative', 'descriptive', 'compare and contrast', 'cause and effect', 'critical analysis', 'definition', 'process analysis', 'reflective', 'literary analysis', 'review', 'research proposal'] # Expanded list
    if not isinstance(essay_type, str) or essay_type.lower() not in allowed_essay_types: essay_type = 'argumentative'
    if generate_outline:
        prompt = f"Create detailed outline for a {essay_type} essay on: '{topic}'. Include intro (hook, thesis), body points (topic sentences, support), conclusion (summary, restated thesis)."
    else:
        prompt = f"Write complete {essay_type} essay (approx 5 paras) on: '{topic}'. Include intro (hook, thesis), body (topic sentences, support), transitions, conclusion (summary, final thought)."
    essay_content = generate_gemini_response(prompt)
    if isinstance(essay_content, dict) and 'error' in essay_content:
        return jsonify({"essay_content": f"Error: {essay_content['error']}"}), 500
    return jsonify({"essay_content": essay_content})


@app.route('/api/elevenlabs_tts', methods=['POST'])
def elevenlabs_tts():
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized"}), 401
    if not ELEVENLABS_API_KEY: return jsonify({"error": "TTS service not configured."}), 503
    data = request.json
    if not data: return jsonify({"error": "Invalid JSON"}), 400
    text_to_speak = data.get('text')
    if not text_to_speak or not isinstance(text_to_speak, str): return jsonify({"error": "No valid text for TTS"}), 400
    headers = {"Accept": "audio/mpeg", "Content-Type": "application/json", "xi-api-key": ELEVENLABS_API_KEY}
    payload = {"text": text_to_speak, "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.55, "similarity_boost": 0.75, "style": 0.3, "use_speaker_boost": True}}
    try:
        response = requests.post(ELEVENLABS_API_URL, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        print("ElevenLabs TTS successful.")
        return Response(response.content, mimetype='audio/mpeg')
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP Error ElevenLabs API: {http_err.response.status_code} - {http_err.response.text}")
        error_detail = f"ElevenLabs Error ({http_err.response.status_code})"
        try: err_json = http_err.response.json(); error_detail = err_json.get('detail', {}).get('message', str(err_json))
        except ValueError: error_detail = http_err.response.text
        return jsonify({"error": f"Failed audio gen: {error_detail}"}), http_err.response.status_code if http_err.response.status_code >= 400 else 500
    except requests.exceptions.RequestException as req_err:
        print(f"Network Error ElevenLabs API: {req_err}")
        return jsonify({"error": f"Could not connect to TTS: {req_err}"}), 504
    except Exception as e:
        print(f"Unexpected TTS error: {type(e).__name__} - {e}")
        return jsonify({"error": "Unexpected TTS server error."}), 500


# --- START NEW PARAPHRASER ROUTE ---
@app.route('/api/paraphrase', methods=['POST'])
def api_paraphrase():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None:
        return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---

    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400

    original_text = data.get('text')
    style = data.get('style', 'simpler') # Default to 'simpler' if not provided

    if not original_text or not isinstance(original_text, str):
        return jsonify({"error": "Text to rephrase is required"}), 400

    # Validate style (optional but good practice)
    allowed_styles = ["simpler", "formal", "informal", "creative", "complex"]
    if style not in allowed_styles:
         print(f"Warning: Invalid paraphrase style '{style}' received. Defaulting to 'simpler'.")
         style = 'simpler'

    print(f"Paraphrase request received. Style: {style}. Text: {original_text[:100]}...")

    # Craft the prompt for Gemini
    prompt = f"""
Instructions:
Rephrase the following text according to the specified style.
Capture the core meaning but use unique phrasing.
Output *only* the rephrased text.

Style: {style}

Original Text:
---
{original_text}
---

Rephrased Text:
"""

    rephrased_text_result = generate_gemini_response(prompt)

    # Check if the helper returned an error object
    if isinstance(rephrased_text_result, dict) and 'error' in rephrased_text_result:
        print(f"Error during paraphrasing: {rephrased_text_result['error']}")
        return jsonify({"rephrased_text": f"Error: {rephrased_text_result['error']}"}), 500

    print(f"Paraphrasing successful. Result: {rephrased_text_result[:100]}...")
    return jsonify({"rephrased_text": rephrased_text_result})
# --- END NEW PARAPHRASER ROUTE ---


# --- Main Execution ---
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # Set debug based on environment variable, default to False
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    print(f"Running Flask app on 0.0.0.0:{port} with debug={debug_mode}")
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
