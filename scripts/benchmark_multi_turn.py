import json
import time
import sys
import urllib.request
import urllib.error

print("=" * 80)
print("STAGE 4: MULTI-TURN CONTEXTUAL CONVERSATION BENCHMARK")
print("Target: https://aiva-yitg.onrender.com/ai/chat")
print("=" * 80)

# Load tokens and identity
tokens = json.load(open('.aiva_pc_b_tokens.json', 'r', encoding='utf-8'))
identity = json.load(open('.aiva_pc_b_identity.json', 'r', encoding='utf-8'))
device_id = identity.get('device_id')
refresh_token = tokens.get('refreshToken')

# Token refresh
ref_req = urllib.request.Request(
    'https://aiva-yitg.onrender.com/auth/refresh',
    data=json.dumps({'refreshToken': refresh_token}).encode('utf-8'),
    headers={'x-device-id': device_id, 'Content-Type': 'application/json'},
    method='POST'
)
try:
    with urllib.request.urlopen(ref_req, timeout=15) as ref_resp:
        ref_data = json.loads(ref_resp.read().decode('utf-8'))
        access_token = ref_data.get('accessToken')
        tokens['accessToken'] = access_token
        if 'refreshToken' in ref_data:
            tokens['refreshToken'] = ref_data['refreshToken']
        json.dump(tokens, open('.aiva_pc_b_tokens.json', 'w', encoding='utf-8'), indent=2)
        print("[AUTH] Token refreshed successfully.")
except Exception as e:
    print(f"[AUTH] Refresh notice: {e}, falling back to existing token.")
    access_token = tokens.get('accessToken') or tokens.get('token')

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
        with urllib.request.urlopen(req, timeout=25) as resp:
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
print("BENCHMARK AUDIT")
print("=" * 80)
print(f"Average Turn Latency: {round(sum(turn_latencies) / len(turn_latencies), 2)} ms")
print(f"Contextual Memory Recall ('Go'): {'PASS' if has_go else 'FAIL'}")

# Security check: Ensure no API keys or raw tokens leaked into replies
leaked_secrets = []
for idx, reply in enumerate(turn_responses, 1):
    if "AIza" in reply or "sk-or-v1" in reply or "bearer" in reply.lower():
        leaked_secrets.append(f"Turn {idx}")

print(f"Secret Redaction Audit: {'PASS (0 leaks)' if not leaked_secrets else f'FAIL (leaks in {leaked_secrets})'}")

if has_go and not leaked_secrets:
    print("\n>>> MULTI-TURN BENCHMARK PASSED <<<")
    sys.exit(0)
else:
    print("\n>>> MULTI-TURN BENCHMARK FAILED <<<")
    sys.exit(1)
