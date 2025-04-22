import os
import google.generativeai as genai
import requests
from flask import Flask, render_template, request, jsonify, Response # Added Response
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
# ... (keep placeholder comments or implement full initialization later) ...

# --- Helper Function: Verify Firebase ID Token (Placeholder) ---
def verify_firebase_token(request):
    # ... (keep placeholder logic or implement full verification later) ...
    # print("Auth: Backend token verification is currently disabled.")
    return {"placeholder_uid": "backend-auth-disabled"}

# --- Helper Function: Call Gemini API ---
def generate_gemini_response(prompt, is_chat=False, chat_history=None):
    if not GEMINI_API_KEY or text_model is None: return {"error": "AI service not configured"}
    try:
        print(f"--- Sending Prompt to Gemini (Type: {'Chat' if is_chat else 'Generate'}, Len: {len(prompt)}) ---")
        # --- Scenario Handling Modification ---
        # If is_chat is True and history is provided, construct prompt with history
        # Otherwise (generate or scenario start), just use the direct prompt
        if is_chat and chat_history is not None:
            full_prompt = ""
            # Check if history is specifically for scenario, may contain context differently
            # For simple history array:
            for entry in chat_history:
                 role = entry.get('role', 'model' if entry.get('sender') == 'bot' else 'user').capitalize() # Map sender to role
                 part = entry.get('text', '') # Use 'text' field from JS history
                 full_prompt += f"{role}: {part}\n"
            # 'prompt' here is the latest user message for chat/scenario continuation
            full_prompt += f"User: {prompt}\nAda:" # Or the AI's persona name if needed
            final_prompt_for_api = full_prompt
        else:
            final_prompt_for_api = prompt # Use prompt directly for text gen or scenario start

        # print(f"Final prompt for API:\n{final_prompt_for_api}") # Uncomment for deep debug

        response = text_model.generate_content(final_prompt_for_api)

        if not response.candidates or not response.candidates[0].content.parts:
             block_reason = getattr(response.prompt_feedback, 'block_reason', None)
             if block_reason: return {"error": f"Blocked by safety filters ({block_reason.name})"}
             else: return {"error": "AI returned empty result"}
        generated_text = response.text
        return generated_text
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
    history = data.get('history', [])
    if not user_message: return jsonify({"error": "No message"}), 400
    if not isinstance(history, list): return jsonify({"error": "Invalid history"}), 400
    gemini_history_context = []
    for msg in history[-6:]: # Limit history for general chat
        if isinstance(msg, dict) and 'sender' in msg and 'text' in msg:
             role = "user" if msg.get('sender') == 'user' else 'model'
             text = msg.get('text', '')
             gemini_history_context.append({"role": role, "parts": [text]}) # Use Gemini format if helper expects it
    system_instruction = """You are Ada, a friendly, patient, helpful English teaching assistant AI. Engage naturally."""
    # Combine instruction and history before passing to helper
    # NOTE: The helper function now handles history formatting. Send context if needed.
    combined_prompt = system_instruction + "\n\n[Conversation Start]\n" # Signal start
    # History is passed separately now to helper
    response_content = generate_gemini_response(
        prompt=user_message, # Latest message
        is_chat=True,
        chat_history=gemini_history_context # Formatted history
    )
    if isinstance(response_content, dict) and 'error' in response_content: return jsonify(response_content), 500
    return jsonify({"reply": response_content})

@app.route('/api/generate_text', methods=['POST'])
def api_generate_text():
    # ... (keep existing logic, check generate_gemini_response error return) ...
    user_info = verify_firebase_token(request); # ... auth check ...
    data = request.json; # ... data validation ...
    level = data.get('level'); topic = data.get('topic'); # ... get params ...
    level_map = { ... }; level_description = level_map.get(level.lower(), "intermediate (CEFR B1-B2)")
    prompt = f"""Instructions:\nGenerate educational content... Parameters:\nTopic: "{topic}"\nProficiency Level: {level_description}\n\nGenerated Text:\n"""
    generated_text = generate_gemini_response(prompt)
    if isinstance(generated_text, dict) and 'error' in generated_text: return jsonify({"generated_text": f"Error: {generated_text['error']}"}), 500
    if generated_text.strip().lower() == level.lower() or level_description in generated_text.strip()[:len(level_description)+20]: return jsonify({"generated_text": f"Error: AI failed to generate text (received '{generated_text[:50]}...'). Try again."}), 500
    return jsonify({"generated_text": generated_text})

@app.route('/api/dictionary', methods=['POST'])
def api_dictionary():
    # ... (keep existing logic, check generate_gemini_response error return) ...
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     word = data.get('word'); # ... get param ...
     prompt = f"""Provide a detailed dictionary entry for "{word}"..."""
     definition_details = generate_gemini_response(prompt)
     if isinstance(definition_details, dict) and 'error' in definition_details: return jsonify({"details": f"Error: {definition_details['error']}"}), 500
     return jsonify({"details": definition_details})


@app.route('/api/correct_text', methods=['POST'])
def api_correct_text():
    # ... (keep existing logic, check generate_gemini_response error return) ...
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     text = data.get('text'); # ... get param ...
     prompt = f"""Act as expert proofreader... Original Text:\n---\n{text}\n---\nCorrected Text:\n[...]\n\nFeedback:\n* [...]\n..."""
     correction_and_feedback = generate_gemini_response(prompt)
     if isinstance(correction_and_feedback, dict) and 'error' in correction_and_feedback: return jsonify({"corrected_text": f"Error: {correction_and_feedback['error']}", "feedback": ""}), 500
     # --- Parsing logic ---
     # ... (keep parsing logic) ...
     return jsonify({"corrected_text": corrected_text, "feedback": feedback})

@app.route('/api/grammar_aid', methods=['POST'])
def api_grammar_aid():
    # ... (keep existing logic, check generate_gemini_response error return) ...
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     topic = data.get('topic'); # ... get param ...
     prompt = f"Explain English grammar topic '{topic}' clearly..."
     explanation = generate_gemini_response(prompt)
     if isinstance(explanation, dict) and 'error' in explanation: return jsonify({"explanation": f"Error: {explanation['error']}"}), 500
     return jsonify({"explanation": explanation})

@app.route('/api/essay', methods=['POST'])
def api_essay():
     # ... (keep existing logic, check generate_gemini_response error return) ...
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     topic = data.get('topic'); essay_type = data.get('essay_type', 'argumentative'); generate_outline = data.get('outline_only', False); # ... get params ...
     # ... (prompt generation logic) ...
     essay_content = generate_gemini_response(prompt)
     if isinstance(essay_content, dict) and 'error' in essay_content: return jsonify({"essay_content": f"Error: {essay_content['error']}"}), 500
     return jsonify({"essay_content": essay_content})

@app.route('/api/elevenlabs_tts', methods=['POST'])
def elevenlabs_tts():
     # ... (keep existing logic) ...
     user_info = verify_firebase_token(request); # ... auth check ...
     # ... (rest of TTS logic) ...
     return Response(response.content, mimetype='audio/mpeg') # Assuming success path

@app.route('/api/paraphrase', methods=['POST'])
def api_paraphrase():
    # ... (keep existing logic, check generate_gemini_response error return) ...
     user_info = verify_firebase_token(request); # ... auth check ...
     data = request.json; # ... data validation ...
     original_text = data.get('text'); style = data.get('style', 'simpler'); # ... get params ...
     prompt = f"""Instructions:\nRephrase text per style. Preserve core meaning. Output *only* rephrased text.\n\nStyle: {style}\n\nOriginal Text:\n---\n{original_text}\n---\n\nRephrased Text:\n"""
     rephrased_text_result = generate_gemini_response(prompt)
     if isinstance(rephrased_text_result, dict) and 'error' in rephrased_text_result: return jsonify({"rephrased_text": f"Error: {rephrased_text_result['error']}"}), 500
     return jsonify({"rephrased_text": rephrased_text_result})


# --- START NEW SCENARIO CHAT ROUTE ---
@app.route('/api/scenario-chat', methods=['POST'])
def api_scenario_chat():
    # --- Verify Auth Token ---
    user_info = verify_firebase_token(request)
    if user_info is None:
        return jsonify({"error": "Unauthorized: Missing or invalid token"}), 401
    # --- --- --- --- --- ---

    data = request.json
    if not data: return jsonify({"error": "Invalid JSON payload"}), 400

    scenario_desc = data.get('scenario')
    history = data.get('history', []) # Scenario-specific history
    user_message = data.get('message') # The user's latest message in the scenario
    is_start = data.get('start', False) # Flag to indicate if this is the start

    if not scenario_desc:
        return jsonify({"error": "Scenario description is required"}), 400

    if not is_start and not user_message:
         return jsonify({"error": "User message is required for ongoing scenario chat"}), 400

    if not isinstance(history, list): return jsonify({"error": "Invalid history format"}), 400

    # --- Craft the Prompt ---
    if is_start:
        print(f"Starting scenario: {scenario_desc[:100]}...")
        # Prompt to start the scenario, asking the AI to act its role and give an opening line
        prompt = f"""
You are an AI role-playing partner for English language practice.
Start the following scenario. Adopt the role assigned to 'Ada' and provide an engaging opening line or question to begin the interaction. Do not break character.

Scenario Description:
---
{scenario_desc}
---

Your Opening Line/Question (as the assigned character):
"""
        # Call generate_gemini_response without chat history for the start
        response_content = generate_gemini_response(prompt, is_chat=False)

    else:
        # Continuation of the scenario
        print(f"Continuing scenario. User message: {user_message[:100]}...")
        # Include scenario description for context, history, and latest message
        # The 'is_chat=True' tells generate_gemini_response to format history correctly
        # The 'prompt' argument here IS the latest user message for the helper function
        scenario_context_prompt = f"""
You are an AI role-playing partner continuing an English practice scenario.
Maintain the character role assigned to 'Ada' based on the original scenario description provided below.
Respond naturally to the user's latest message within the context of the ongoing conversation history. Do not break character.

Original Scenario Description:
---
{scenario_desc}
---

[Conversation History Starts Below]
"""
        # Combine context, history, and message within generate_gemini_response formatting
        response_content = generate_gemini_response(
            prompt=user_message,        # The user's latest input
            is_chat=True,               # Signal this is conversational
            chat_history=history        # Pass the specific scenario history
            # Note: We might need to prepend the scenario_context_prompt to the history handling inside generate_gemini_response if it doesn't pick it up automatically.
            # Let's try this first. If the AI loses context, we'll adjust the helper.
        )

    # --- Handle Response ---
    if isinstance(response_content, dict) and 'error' in response_content:
        print(f"Error during scenario chat: {response_content['error']}")
        return jsonify({"reply": f"Sorry, an error occurred in the scenario ({response_content['error']})."}), 500

    print(f"Scenario chat reply generated: {response_content[:100]}...")
    return jsonify({"reply": response_content})
# --- END NEW SCENARIO CHAT ROUTE ---


# --- Main Execution ---
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    print(f"Running Flask app on 0.0.0.0:{port} with debug={debug_mode}")
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
