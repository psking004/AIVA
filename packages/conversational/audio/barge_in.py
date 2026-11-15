"""AIVA Conversational Intelligence - Barge-in & Interruption Controller.

Provides immediate speech cancellation and audio focus management when user interrupts
active audio playback.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable, Optional

logger = logging.getLogger("AivaBargeIn")


class BargeInController:
    """Manages active speech playback cancellation on user interruption."""

    def __init__(self):
        self._lock = threading.Lock()
        self._is_speaking = False
        self._active_stream_id: Optional[str] = None
        self._cancel_callbacks: list[Callable[[], None]] = []

    def start_speaking(self, stream_id: str) -> None:
        """Flags that TTS playback has commenced."""
        with self._lock:
            self._is_speaking = True
            self._active_stream_id = stream_id

    def stop_speaking(self) -> None:
        """Flags that TTS playback completed normally."""
        with self._lock:
            self._is_speaking = False
            self._active_stream_id = None

    def trigger_interruption(self) -> bool:
        """Called when microphone detects user speech while AIVA is talking.

        Immediately terminates audio playback streams.
        """
        with self._lock:
            if not self._is_speaking:
                return False

            logger.info(f"Barge-in detected! Canceling speech stream {self._active_stream_id}")
            self._is_speaking = False
            self._active_stream_id = None

            for cb in self._cancel_callbacks:
                try:
                    cb()
                except Exception as ex:
                    logger.error(f"Error in cancel callback: {ex}")

            return True

    def register_cancel_callback(self, cb: Callable[[], None]) -> None:
        with self._lock:
            self._cancel_callbacks.append(cb)
