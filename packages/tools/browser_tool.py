"""AIVA 2.0 - Real Browser & Web Automation Tool.

Interacts with web endpoints, parses DOM/HTML elements, extracts links,
simulates form posts, and validates web workflows.
"""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger("BrowserTool")


class BrowserTool:
    """Real HTTP and browser interaction tool."""

    def __init__(self, timeout: int = 15):
        self.timeout = timeout
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AIVA/2.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
        }

    def navigate(self, url: str) -> Dict[str, Any]:
        """Navigates to a web URL, fetches the document, and extracts structured content."""
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        start_t = time.time()
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                status = resp.status
                headers = dict(resp.headers)
                raw_body = resp.read()
                dur = round((time.time() - start_t) * 1000, 2)

                # Attempt text decode
                try:
                    text_content = raw_body.decode("utf-8")
                except UnicodeDecodeError:
                    text_content = raw_body.decode("latin1", errors="replace")

                # Extract title
                title_match = re.search(r"<title[^>]*>(.*?)</title>", text_content, re.IGNORECASE | re.DOTALL)
                title = title_match.group(1).strip() if title_match else ""

                # Extract plain text by stripping HTML tags
                clean_text = re.sub(r"<script[^>]*>.*?</script>", "", text_content, flags=re.DOTALL | re.IGNORECASE)
                clean_text = re.sub(r"<style[^>]*>.*?</style>", "", clean_text, flags=re.DOTALL | re.IGNORECASE)
                clean_text = re.sub(r"<[^>]+>", " ", clean_text)
                clean_text = re.sub(r"\s+", " ", clean_text).strip()

                # Extract links
                links = re.findall(r'href=[\'"](https?://[^\'">]+)[\'"]', text_content)

                return {
                    "success": True,
                    "url": url,
                    "status_code": status,
                    "title": title,
                    "text_sample": clean_text[:2000],
                    "total_text_length": len(clean_text),
                    "links_found": len(links),
                    "top_links": links[:10],
                    "latency_ms": dur,
                }
        except Exception as e:
            dur = round((time.time() - start_t) * 1000, 2)
            logger.warning(f"Browser navigation to {url} failed: {e}")
            return {
                "success": False,
                "url": url,
                "status_code": -1,
                "error": str(e),
                "latency_ms": dur,
            }

    def submit_form(self, url: str, form_data: Dict[str, Any], method: str = "POST") -> Dict[str, Any]:
        """Submits form data to an HTTP endpoint."""
        start_t = time.time()
        try:
            encoded_data = urllib.parse.urlencode(form_data).encode("utf-8")
            req = urllib.request.Request(url, data=encoded_data, headers=self.headers, method=method.upper())
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                dur = round((time.time() - start_t) * 1000, 2)
                return {
                    "success": resp.status in (200, 201, 204),
                    "status_code": resp.status,
                    "response_sample": body[:500],
                    "latency_ms": dur,
                }
        except Exception as e:
            dur = round((time.time() - start_t) * 1000, 2)
            return {"success": False, "status_code": -1, "error": str(e), "latency_ms": dur}

