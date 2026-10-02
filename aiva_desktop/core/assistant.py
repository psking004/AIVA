import threading
from .llm import Brain
from voice.engine import VoiceEngine
from agents.manager import AgentsManager


class AIVA:
    """Core logic tying Voice, Brain, and Agents together."""

    def __init__(self):
        self.brain = Brain()
        self.voice = VoiceEngine()
        self.agents = AgentsManager()
        self._is_listening = False
        self._lock = threading.Lock()
        self.ui_callback = None

    def start_wake_word(self):
        """Begin background loop for wake word."""
        self.voice.wait_for_wake_word(self._on_wake_word)

    def _on_wake_word(self):
        """Called automatically when wake word is heard."""
        # Spawn a thread so the audio engine isn't blocked by the process turn
        threading.Thread(target=self.process_turn, daemon=True).start()

    def process_turn(self):
        """One cycle: Listen -> Think -> Speak/Act."""
        with self._lock:
            if self._is_listening:
                return
            self._is_listening = True
            
        try:
            if self.ui_callback:
                self.ui_callback("Status: Listening...", "active")

            # 1. Listen
            user_input = self.voice.listen(duration=4).strip()
            
            if not user_input:
                if self.ui_callback:
                    self.ui_callback("Status: Idle", "idle")
                return

            if self.ui_callback:
                self.ui_callback(f"You: {user_input}", "active")

            # 2. Check Agents first (Interception of command)
            agent_result = self.agents.evaluate(user_input)

            if agent_result:
                # Agent handled it
                if self.ui_callback:
                    self.ui_callback(f"AIVA: {agent_result}", "active")
                self.voice.speak(agent_result)
            else:
                # 3. Brain (Ollama)
                if self.ui_callback:
                    self.ui_callback("Status: Thinking...", "thinking")
                    
                reply = self.brain.think(user_input)

                if self.ui_callback:
                    self.ui_callback(f"AIVA: {reply}", "active")
                    
                # 4. Speak
                self.voice.speak(reply)

            if self.ui_callback:
                self.ui_callback("Status: Idle", "idle")
        finally:
            with self._lock:
                self._is_listening = False
