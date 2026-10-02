"""
AIVA - Local Desktop AI Assistant
Entry point: python aiva.py
"""
from ui.window import AIVAWindow
from core.assistant import AIVA

if __name__ == "__main__":
    assistant = AIVA()
    app = AIVAWindow(assistant)
    app.run()
