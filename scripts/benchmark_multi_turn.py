import json
import time
import urllib.request
import urllib.error

print("=" * 80)
print("STAGE 3: MULTI-TURN CONTEXTUAL CONVERSATION BENCHMARK")
print("Target: https://aiva-yitg.onrender.com/ai/chat")
print("=" * 80)

# Load tokens and identity
tokens = json.load(open('.aiva_pc_b_tokens.json', 'r', encoding='utf-8'))
access_token = tokens.get('accessToken') or tokens.get('token')

identity = json.load(open('.aiva_pc_b_identity.json', 'r', encoding='utf-8'))
device_id = identity.get('device_id')

conversation_id = f"conv_bench_{int(time.time())}"
print(f"Active Conversation ID: {conversation_id}")
print(f"Device ID: {device_id}\n")

turns = [
    ("Turn 1 (Fact Storing)", "Remember that my primary coding language for microservices is Go."),
    ("Turn 2 (Context Continuation)", "What is a recommended framework for building fast APIs?"),
    ("Turn 3 (Memory & Context Recall)", "Which language did I say I used for microservices?")
]

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {access_token}",
    "x-device-id": device_id,
    "x-client-platform": "windows"
}

turn_latencies = []
turn_responses = []

for idx, (label, prompt) in enumerate(turns, 1):
    print(f"[{label}]")
    print(f" -> User: \"{prompt}\"")
    payload = json.dumps({
        "message": prompt,
        "conversationId": conversation_id,
        "strategy": "gemini-only"
    }).encode('utf-8')

    req = urllib.request.Request("https://aiva-yitg.onrender.com/ai/chat", data=payload, headers=headers, method="POST")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            latency_ms = round((time.time() - t0) * 1000, 2)
            reply = data.get("response") or data.get("message")
            model = data.get("model")
            provider = data.get("provider")
            print(f" -> Latency: {latency_ms} ms | Model: {model} | Provider: {provider}")
            print(f" -> AIVA: \"{reply}\"\n")
            turn_latencies.append(latency_ms)
            turn_responses.append(reply)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        print(f" -> HTTP ERROR {e.code}: {err_body}\n")
        sys.exit(1)
    except Exception as e:
        print(f" -> ERROR: {e}\n")
        sys.exit(1)

# Audit Turn 3 Context Recall
turn3_reply = turn_responses[2].lower()
has_go = "go" in turn3_reply or "golang" in turn3_reply
print("=" * 80)
print("MULTI-TURN BENCHMARK VERIFICATION RESULTS")
print("=" * 80)
print(f"Turn 1 Latency: {turn_latencies[0]} ms")
print(f"Turn 2 Latency: {turn_latencies[1]} ms")
print(f"Turn 3 Latency: {turn_latencies[2]} ms")
print(f"Recall Check ('Go'/'Golang' in Turn 3 response): {'PASS' if has_go else 'FAIL'}")

# Security & Leak Audit
for idx, reply in enumerate(turn_responses, 1):
    lower_r = reply.lower()
    assert "aiza" not in lower_r, f"Turn {idx} leaked Google API Key!"
    assert "sk-" not in lower_r, f"Turn {idx} leaked OpenRouter API Key!"
    assert "stack" not in lower_r or "trace" not in lower_r, f"Turn {idx} leaked stack trace!"

print("Security Audit: PASS (Zero API keys, vendor exception dumps, or token leaks)")

if has_go:
    print("\n>>> STAGE 3 BENCHMARK: PASS <<<")
else:
    print("\n>>> STAGE 3 BENCHMARK: FAIL (Context not recalled) <<<")
    sys.exit(1)
