"""AIVA 2.0 - Research & Knowledge Intelligence Engine.

Performs multi-source factual research, extracts source content, tracks citations,
and synthesizes findings with factual verification and provenance tracking.
"""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger("ResearchEngine")


class ResearchEngine:
    """Multi-source research and citation tracking engine."""

    def __init__(self, timeout: int = 12):
        self.timeout = timeout
        self.headers = {
            "User-Agent": "AIVA-ResearchEngine/2.0 (Research Bot; Windows)",
            "Accept": "text/html,application/json,*/*",
        }

    def fetch_wikipedia_summary(self, topic: str) -> Dict[str, Any]:
        """Fetches verified encyclopedic summary from Wikipedia REST API."""
        encoded_topic = urllib.parse.quote(topic.replace(" ", "_"))
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded_topic}"
        start_t = time.time()
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                dur = round((time.time() - start_t) * 1000, 2)
                return {
                    "source": "Wikipedia",
                    "url": data.get("content_urls", {}).get("desktop", {}).get("page", url),
                    "title": data.get("title", topic),
                    "extract": data.get("extract", ""),
                    "timestamp": time.time(),
                    "latency_ms": dur,
                    "verified": True,
                }
        except Exception as e:
            dur = round((time.time() - start_t) * 1000, 2)
            return {
                "source": "Wikipedia",
                "url": url,
                "title": topic,
                "extract": f"Could not retrieve Wikipedia summary: {e}",
                "timestamp": time.time(),
                "latency_ms": dur,
                "verified": False,
            }

    def fetch_web_page(self, url: str) -> Dict[str, Any]:
        """Fetches and cleans text from a reference web URL."""
        start_t = time.time()
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                dur = round((time.time() - start_t) * 1000, 2)

                title_m = re.search(r"<title[^>]*>(.*?)</title>", raw, re.IGNORECASE)
                title = title_m.group(1).strip() if title_m else url

                clean = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw, flags=re.DOTALL | re.IGNORECASE)
                clean = re.sub(r"<[^>]+>", " ", clean)
                clean = re.sub(r"\s+", " ", clean).strip()

                return {
                    "source": "Web",
                    "url": url,
                    "title": title,
                    "content_sample": clean[:1500],
                    "timestamp": time.time(),
                    "latency_ms": dur,
                    "verified": True,
                }
        except Exception as e:
            dur = round((time.time() - start_t) * 1000, 2)
            return {
                "source": "Web",
                "url": url,
                "title": url,
                "content_sample": str(e),
                "timestamp": time.time(),
                "latency_ms": dur,
                "verified": False,
            }

    def research_topic(self, topic: str, fallback_urls: Optional[List[str]] = None) -> Dict[str, Any]:
        """Conducts structured research across multiple sources with citation tracking."""
        start_t = time.time()
        sources_collected = []

        # Source 1: Wikipedia API
        wiki_res = self.fetch_wikipedia_summary(topic)
        if wiki_res.get("verified"):
            sources_collected.append(wiki_res)

        # Source 2: Additional web references
        if fallback_urls:
            for u in fallback_urls[:3]:
                page_res = self.fetch_web_page(u)
                if page_res.get("verified"):
                    sources_collected.append(page_res)

        # Synthesis
        total_time = round((time.time() - start_t) * 1000, 2)
        citations = [{"title": s["title"], "url": s["url"], "source": s["source"]} for s in sources_collected]

        summary_points = []
        for s in sources_collected:
            if s.get("extract"):
                summary_points.append(s["extract"])
            elif s.get("content_sample"):
                summary_points.append(s["content_sample"][:300] + "...")

        return {
            "topic": topic,
            "sources_count": len(sources_collected),
            "citations": citations,
            "synthesized_findings": "\n\n".join(summary_points),
            "total_latency_ms": total_time,
            "verified": len(sources_collected) > 0,
        }

