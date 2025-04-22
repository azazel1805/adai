import os
import google.generativeai as genai
import requests
from flask import Flask, render_template, request, jsonify, Response
from dotenv import load_dotenv

# --- Initialization ---
load_dotenv()
app = Flask(__name__)

# --- Configuration & API Keys ---
try:
    GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY")
    ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
    ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "XrExE9yKIg1WjnnlVkGX")
    if not GEMINI_API_KEY: print("CRITICAL ERROR: GOOGLE_API_KEY not set."); text_model = None
    else:
        try:
            genai.configure(api_key=GEMINI_API_KEY); text_model = genai.GenerativeModel('gemini-1.5-flash'); print("Gemini AI Model configured.")
        except Exception as gemini_config_error: print(f"ERROR configuring Gemini AI: {gemini_config_error}"); text_model = None
    if not ELEVENLABS_API_KEY: print("WARNING: ELEVENLABS_API_KEY not set.")
    ELEVENLABS_API_URL = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
except Exception as startup_error: print(f"CRITICAL STARTUP ERROR: {startup_error}"); GEMINI_API_KEY=None; ELEVENLABS_API_KEY=None; ELEVENLABS_API_URL=None; text_model = None

# --- Firebase Admin SDK Placeholder ---
# import firebase_admin
# from firebase_admin import credentials, auth
# try: # Add full initialization logic here later if needed
# except Exception as admin_init_error: print(f"ERROR initializing Firebase Admin SDK: {admin_init_error}")

# --- Helper Function: Verify Firebase ID Token (Placeholder) ---
def verify_firebase_token(request):
    # Replace with actual firebase_admin verification later
    print("Auth: Backend token verification is currently disabled.")
    return {"placeholder_uid": "backend-auth-disabled"}

# --- Helper Function: Call Gemini API ---
def generate_gemini_response(prompt, is_chat=False, chat_history=None):
    if not GEMINI_API_KEY or text_model is None: return {"error": "AI service not configured"}
    try:
        print(f"--- Sending Prompt to Gemini (Type: {'Chat' if is_chat else 'Generate/Scenario'}, Len: {len(prompt)}) ---")

        # --- History Formatting ---
        gemini_formatted_history = []
        if is_chat and chat_history:
             # Map frontend history ({sender: 'user'/'bot', text: '...'})
             # to Gemini format ({role: 'user'/'model', parts: ['...']})
             for entry in chat_history:
                 role = "user" if entry.get('sender') == 'user' else "model"
                 text = entry.get('text', '')
                 gemini_formatted_history.append({"role": role, "parts": [text]})
            # In chat mode, 'prompt' is the latest user message
             latest_user_message = prompt
             # Start a chat session with history for context
             # Note: For stateless API calls like Render, managing chat state requires
             # sending the full history each time. `start_chat` is stateful.
             # We will construct the full prompt string here instead.
             full_prompt_string = ""
             for entry in gemini_formatted_history: # Use the formatted history
                  full_prompt_string += f"{entry['role'].capitalize()}: {entry['parts'][0]}\n"
             full_prompt_string += f"User: {latest_user_message}\nAda:" # Use persona name
             final_prompt_for_api = full_prompt_string

        else:
             # For generation or scenario start, use the prompt directly
             final_prompt_for_api = prompt

        # --- API Call ---
        # Using generate_content which is suitable for stateless calls
        response = text_model.generate_content(final_prompt_for_api)

        # --- Response Handling ---
        if not response.candidates or not response.candidates[0].content.parts:
             block_reason = getattr(response.prompt_feedback, 'block_reason', None)
             if block_reason: return {"error": f"Blocked by safety filters ({block_reason.name})"}
             else: return {"error": "AI returned empty result"}
        generated_text = response.text
        return generated_text # Return text directly

    # --- Error Handling ---
    except google.api_core.exceptions.ResourceExhausted as e: print(f"Quota Exceeded: {e}"); return {"error": "AI service quota exceeded"}
    except google.api_core.exceptions.InvalidArgument as e: print(f"Invalid Argument: {e}"); return {"error": "Invalid request to AI"}
    except Exception as e: print(f"Generic Gemini Error: {type(e).__name__} - {e}"); return {"error": "Unexpected AI service error"}

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
    history = data.get('history', []) # History from frontend {sender, text}
    if not user_message or not isinstance(history, list): return jsonify({"error": "Invalid input"}), 400

    # Add system instruction for general chat context if needed
    # system_instruction = "You are Ada, a helpful AI assistant.\n"
    # Pass message and history to helper. History formatting happens in helper.
    response_content = generate_gemini_response(prompt=user_message, is_chat=True, chat_history=history[-6:]) # Limit history
    if isinstance(response_content, dict) and 'error' in response_content: return jsonify(response_content), 500
    return jsonify({"reply": response_content})

@app.route('/api/generate_text', methods=['POST'])
def api_generate_text():
    user_info = verify_firebase_token(request); # ... auth check ...
    data = request.json; # ... data validation ...
    level = data.get('level'); topic = data.get('topic'); # ... get params ...
    level_map = { ... }; level_description = level_map.get(level.lower(), "intermediate (CEFR B1-B2)")
    prompt = f"""Instructions:\nGenerate educational content... Parameters:\nTopic: "{topic}"\nProficiency Level: {level_description}\n\nGenerated Text:\n"""
    generated_text = generate_gemini_response(prompt)
    if isinstance(generated_text, dict) and 'error' in generated_text: return jsonify({"generated_text": f"Error: {generated_text['error']}"}), 500
    if isinstance(generated_text, str) and (generated_text.strip().lower() == level.lower() or level_description in generated_text.strip()[:len(level_description)+20]): return jsonify({"generated_text": f"Error: AI failed (echo received '{generated_text[:50]}...'). Try again."}), 500
    return jsonify({"generated_text": generated_text})

@app.route('/api/dictionary', methods=['POST'])
def api_dictionary():
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     word = data.get('word'); # ... get param ...
     prompt = f"""Provide detailed dictionary entry for "{word}"..."""
     definition_details = generate_gemini_response(prompt)
     if isinstance(definition_details, dict) and 'error' in definition_details: return jsonify({"details": f"Error: {definition_details['error']}"}), 500
     return jsonify({"details": definition_details})

@app.route('/api/correct_text', methods=['POST'])
def api_correct_text():
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     text = data.get('text'); # ... get param ...
     prompt = f"""Act as expert proofreader... Original Text:\n---\n{text}\n---\nCorrected Text:\n[...]\n\nFeedback:\n* [...]\n..."""
     correction_and_feedback = generate_gemini_response(prompt)
     if isinstance(correction_and_feedback, dict) and 'error' in correction_and_feedback: return jsonify({"corrected_text": f"Error: {correction_and_feedback['error']}", "feedback": ""}), 500
     # --- Parsing logic ---
     corrected_text = "Could not parse correction." ; feedback = "Could not parse feedback."
     try: # ... keep parsing logic ...
        corr_marker, feed_marker = "Corrected Text:", "Feedback:"
        corr_idx, feed_idx = correction_and_feedback.find(corr_marker), correction_and_feedback.find(feed_marker)
        if corr_idx != -1:
            corr_start = corr_idx + len(corr_marker); end_idx = feed_idx if (feed_idx != -1 and feed_idx > corr_idx) else len(correction_and_feedback)
            corrected_text = correction_and_feedback[corr_start:end_idx].strip()
        if feed_idx != -1: feed_start = feed_idx + len(feed_marker); feedback = correction_and_feedback[feed_start:].strip()
        elif corr_idx == -1 and len(correction_and_feedback) < 150: feedback = correction_and_feedback
     except Exception as parse_error: print(f"Error parsing correction: {parse_error}"); feedback = correction_and_feedback
     return jsonify({"corrected_text": corrected_text, "feedback": feedback})

@app.route('/api/grammar_aid', methods=['POST'])
def api_grammar_aid():
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     topic = data.get('topic'); # ... get param ...
     prompt = f"Explain English grammar topic '{topic}' clearly..."
     explanation = generate_gemini_response(prompt)
     if isinstance(explanation, dict) and 'error' in explanation: return jsonify({"explanation": f"Error: {explanation['error']}"}), 500
     return jsonify({"explanation": explanation})

@app.route('/api/essay', methods=['POST'])
def api_essay():
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     topic = data.get('topic'); essay_type = data.get('essay_type', 'argumentative'); generate_outline = data.get('outline_only', False); # ... get params ...
     # ... (prompt generation logic) ...
     essay_content = generate_gemini_response(prompt)
     if isinstance(essay_content, dict) and 'error' in essay_content: return jsonify({"essay_content": f"Error: {essay_content['error']}"}), 500
     return jsonify({"essay_content": essay_content})

@app.route('/api/elevenlabs_tts', methods=['POST'])
def elevenlabs_tts():
     user_info = verify_firebase_token(request); # ... auth check ...
     # ... (rest of TTS logic) ...
     return Response(response.content, mimetype='audio/mpeg') # Assuming success path

@app.route('/api/paraphrase', methods=['POST'])
def api_paraphrase():
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     original_text = data.get('text'); style = data.get('style', 'simpler'); # ... get params ...
     prompt = f"""Instructions:\nRephrase text per style... Original Text:\n---\n{original_text}\n---\n\nRephrased Text:\n"""
     rephrased_text_result = generate_gemini_response(prompt)
     if isinstance(rephrased_text_result, dict) and 'error' in rephrased_text_result: return jsonify({"rephrased_text": f"Error: {rephrased_text_result['error']}"}), 500
     return jsonify({"rephrased_text": rephrased_text_result})


# --- START NEW SCENARIO CHAT ROUTE ---
@app.route('/api/scenario-chat', methods=['POST'])
def api_scenario_chat():
    user_info = verify_firebase_token(request)
    if user_info is None: return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    if not data: return jsonify({"error": "Invalid JSON"}), 400

    scenario_desc = data.get('scenario')
    history = data.get('history', [])      # Scenario history {sender, text}
    user_message = data.get('message')    # Latest user message (None if start)
    is_start = data.get('start', False)   # Flag for initial message

    if not scenario_desc: return jsonify({"error": "Scenario description required"}), 400
    if not is_start and not user_message: return jsonify({"error": "User message required"}), 400
    if not isinstance(history, list): return jsonify({"error": "Invalid history"}), 400

    # --- Craft Prompt ---
    if is_start:
        print(f"Starting scenario: {scenario_desc[:100]}...")
        prompt = f"""You are an AI role-playing partner for English language practice. Start the following scenario. Adopt the role assigned to 'Ada' and provide an engaging opening line or question. Be concise and stay in character.

Scenario Description:
---
{scenario_desc}
---

Your Opening Line/Question (as the assigned character):"""
        # Call helper without history for the start
        response_content = generate_gemini_response(prompt, is_chat=False)
    else:
        # Continuation
        print(f"Continuing scenario. User message: {user_message[:100]}...")
        # System instruction prepended by the helper function structure now
        system_instruction = f"""You are an AI role-playing partner continuing an English practice scenario. Maintain the character role assigned to 'Ada' based on the original scenario description provided below. Respond naturally to the user's latest message within the context of the ongoing conversation history. Stay in character and keep responses concise.

Original Scenario Description:
---
{scenario_desc}
---

[Conversation History Starts Below]
"""
        # Prepend system instruction to the prompt that generate_gemini_response will build
        # The user_message is passed as 'prompt', history as 'chat_history'
        # The helper will combine history + user_message
        # We need a way to include the system instruction within the helper's logic or prepend it here.
        # Let's modify the helper to accept system_instruction for chat.

        # **** MODIFICATION NEEDED IN generate_gemini_response ****
        # For now, we'll manually build the start of the prompt here
        # This duplicates some logic from the helper, ideally refactor later

        full_prompt_string = system_instruction # Start with the system instruction/context
        for entry in history: # Use history directly from frontend
            role = "user" if entry.get('sender') == 'user' else "model"
            text = entry.get('text', '')
            full_prompt_string += f"{role.capitalize()}: {text}\n"
        full_prompt_string += f"User: {user_message}\nAda:" # Use persona name

        # Call helper with the fully constructed prompt string directly
        response_content = generate_gemini_response(full_prompt_string, is_chat=False) # Use is_chat=False because we built the full prompt

    # --- Handle Response ---
    if isinstance(response_content, dict) and 'error' in response_content:
        return jsonify({"reply": f"Sorry, an error occurred ({response_content['error']})."}), 500
    return jsonify({"reply": response_content})
# --- END NEW SCENARIO CHAT ROUTE ---


# --- Main Execution ---
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    print(f"Running Flask app on 0.0.0.0:{port} with debug={debug_mode}")
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
