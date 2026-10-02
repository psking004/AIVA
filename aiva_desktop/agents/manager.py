import os
import webbrowser
import platform
import subprocess

class AgentsManager:
    """Manages available tools/plugins."""

    def __init__(self):
        pass

    def evaluate(self, command: str) -> str:
        """
        Naive intent router. Checks for keywords and executes agents.
        Returns the result string or None if no agent matched.
        """
        cmd_lower = command.lower()

        # Search Agent
        if "search for" in cmd_lower or "google" in cmd_lower or "look up" in cmd_lower:
            query = cmd_lower.replace("search for", "").replace("google", "").replace("look up", "").strip()
            return self._search_duckduckgo(query)
            
        # System Control Agent
        if "open" in cmd_lower or "launch" in cmd_lower:
            app_name = cmd_lower.replace("open", "").replace("launch", "").strip()
            return self._open_app(app_name)

        return None

    def _search_duckduckgo(self, query: str) -> str:
        """Search DuckDuckGo using web browser."""
        print(f"[Agent] Searching for: {query}")
        url = f"https://duckduckgo.com/?q={query}"
        webbrowser.open(url)
        return f"I have opened a search for {query} in your browser."

    def _open_app(self, app_name: str) -> str:
        """Attempt to open an application based on OS."""
        print(f"[Agent] Opening app: {app_name}")
        system = platform.system()
        try:
            if system == "Windows":
                os.system(f"start {app_name}")
            elif system == "Darwin":  # macOS
                subprocess.Popen(["open", "-a", app_name])
            else:  # Linux
                subprocess.Popen([app_name])
            return f"I am opening {app_name} now."
        except Exception as e:
            return f"I couldn't open {app_name}. Error: {e}"
