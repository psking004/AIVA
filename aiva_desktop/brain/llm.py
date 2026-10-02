"""Brain module – talks to Ollama (llama3) with in-memory conversation history."""
import json
import requests

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "llama3"

SYSTEM_PROMPT = """You are AIVA, a friendly and intelligent female AI desktop assistant (like Jarvis).
You are concise, helpful, and conversational. 
When asked to search or open apps, say what you're doing then the agent handles it.
Keep answers short – 2-4 sentences max unless detail is explicitly requested."""


class Brain:
    def __init__(self):
        self.history: list[dict] = []

    def think(self, user_input: str) -> str:
        """Send message to Ollama and return response."""
        self.history.append({"role": "user", "content": user_input})

        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                *self.history[-20:],   # keep last 20 turns
            ],
            "stream": False,
        }

        try:
            resp = requests.post(OLLAMA_URL, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            reply = data["message"]["content"].strip()
        except requests.exceptions.ConnectionError:
            reply = "I can't reach my brain right now. Make sure Ollama is running with llama3."
        except Exception as e:
            reply = f"An error occurred: {e}"

        self.history.append({"role": "assistant", "content": reply})
        return reply

    def clear_memory(self):
        self.history.clear()
