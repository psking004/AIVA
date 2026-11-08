import urllib.request
import urllib.error
import json
import time

tokens = json.load(open('.aiva_pc_b_tokens.json', 'r', encoding='utf-8'))
ident = json.load(open('.aiva_pc_b_identity.json', 'r', encoding='utf-8'))

access_token = tokens['accessToken']
device_id = ident['device_id']

# 1. Refresh if needed
ref_req = urllib.request.Request(
    'https://aiva-yitg.onrender.com/auth/refresh',
    data=json.dumps({'refreshToken': tokens['refreshToken']}).encode('utf-8'),
    headers={'x-device-id': device_id, 'Content-Type': 'application/json'},
    method='POST'
)

try:
    with urllib.request.urlopen(ref_req, timeout=15) as ref_resp:
        ref_data = json.loads(ref_resp.read().decode('utf-8'))
        access_token = ref_data['accessToken']
        tokens['accessToken'] = access_token
        if 'refreshToken' in ref_data:
            tokens['refreshToken'] = ref_data['refreshToken']
        json.dump(tokens, open('.aiva_pc_b_tokens.json', 'w', encoding='utf-8'), indent=2)
        print("[AUTH] Token refreshed successfully.")
except Exception as e:
    print(f"[AUTH] Refresh warning: {e}, using existing access token.")

headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {access_token}',
    'x-device-id': device_id,
    'x-client-platform': 'windows'
}

conv_id = f"conv_phase6_mem_{int(time.time())}"
print(f"Conversation ID: {conv_id}")

# Turn 1: Store memory
print("\n[Turn 1: Store Production Port]")
t0 = time.time()
p1 = json.dumps({
    'message': 'Remember my production deployment port is 6543.',
    'conversationId': conv_id,
    'strategy': 'gemini-only'
}).encode('utf-8')

req1 = urllib.request.Request('https://aiva-yitg.onrender.com/ai/chat', data=p1, headers=headers, method='POST')
with urllib.request.urlopen(req1, timeout=20) as resp1:
    d1 = json.loads(resp1.read().decode('utf-8'))
    lat1 = round((time.time() - t0) * 1000, 2)
    print(f"Response ({lat1} ms): {d1.get('response')}")

# Turn 2: Query memory
print("\n[Turn 2: Query Port via Semantic Recall]")
t0 = time.time()
p2 = json.dumps({
    'message': 'What port does my database pooler use?',
    'conversationId': conv_id,
    'strategy': 'gemini-only'
}).encode('utf-8')

req2 = urllib.request.Request('https://aiva-yitg.onrender.com/ai/chat', data=p2, headers=headers, method='POST')
with urllib.request.urlopen(req2, timeout=20) as resp2:
    d2 = json.loads(resp2.read().decode('utf-8'))
    lat2 = round((time.time() - t0) * 1000, 2)
    reply2 = d2.get('response', '')
    print(f"Response ({lat2} ms): {reply2}")
    assert '6543' in reply2, f"Expected port 6543 in response, got: {reply2}"
    print("\n>>> CLOUD MEMORY VERIFICATION: PASS (Recalled port 6543 with high accuracy)")
