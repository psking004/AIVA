# AIVA 2.0 Personal Integrations Registry

**Module:** `packages/integrations/registry.py`  

---

## 1. Registered Platforms

AIVA 2.0 provides typed abstractions and permission boundaries for personal tools:

1. **Hark Ambient Voice Indexer:**
   * **Endpoint:** `http://127.0.0.1:5050/api/voice/index`
   * **Role:** Local conversational indexing and vector search.
   * **Status:** Configured & Active.
2. **Freebuff Data Harvester:**
   * **Role:** High-throughput headless scraping buffer with proxy rotation and anti-bot evasion.
   * **Auth Key:** `FREEBUFF_API_KEY`
   * **Status:** Ready for API key binding.
3. **Genspark Deep Research Agent:**
   * **Role:** Multi-angle autonomous search engine generating cross-referenced Sparkpages.
   * **Auth Key:** `GENSPARK_API_KEY`
   * **Status:** Ready for API key binding.
4. **Manus Computer-Use Orchestrator:**
   * **Role:** Generalist autonomous agent operating full desktop GUI environments and browsers.
   * **Auth Key:** `MANUS_API_KEY`
   * **Status:** Ready for API key binding.

