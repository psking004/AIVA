import tkinter as tk
from threading import Thread

class AIVAWindow:
    """Minimal Desktop UI for AIVA."""

    def __init__(self, assistant):
        self.assistant = assistant
        self.assistant.ui_callback = self.update_status

        self.root = tk.Tk()
        self.root.title("AIVA Desktop")
        self.root.geometry("400x500")
        self.root.attributes("-topmost", True)
        self.root.config(bg="#1e1e2e")

        self.lbl_status = tk.Label(
            self.root, 
            text="Initializing AIVA...", 
            bg="#1e1e2e", 
            fg="#a6e3a1", 
            font=("Consolas", 14, "bold")
        )
        self.lbl_status.pack(pady=10)

        self.text_area = tk.Text(
            self.root, 
            bg="#11111b", 
            fg="#cdd6f4", 
            state=tk.DISABLED, 
            wrap=tk.WORD, 
            font=("Arial", 11)
        )
        self.text_area.pack(expand=True, fill=tk.BOTH, padx=10, pady=10)

        self.btn_listen = tk.Button(
            self.root, 
            text="Force Listen", 
            command=self.force_listen, 
            bg="#89b4fa", 
            fg="#11111b", 
            font=("Arial", 12, "bold")
        )
        self.btn_listen.pack(pady=10)

    def update_status(self, msg: str, state: str):
        """Thread-safe UI update."""
        def _update():
            if state == "active":
                self.text_area.config(state=tk.NORMAL)
                self.text_area.insert(tk.END, f"{msg}\n\n")
                self.text_area.see(tk.END)
                self.text_area.config(state=tk.DISABLED)
            else:
                self.lbl_status.config(text=msg)
                
            if state in ("active", "thinking"):
                self.btn_listen.config(state=tk.DISABLED)
            elif state == "idle":
                self.btn_listen.config(state=tk.NORMAL)

        self.root.after(0, _update)

    def force_listen(self):
        """Manual listen override."""
        Thread(target=self.assistant.process_turn, daemon=True).start()

    def run(self):
        """Start Wake Word background loop and launch GUI."""
        Thread(target=self.assistant.start_wake_word, daemon=True).start()
        self.update_status("Status: Listening for 'AIVA'...", "idle")
        self.root.mainloop()

