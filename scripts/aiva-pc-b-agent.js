const fs = require("fs");
const os = require("os");
const readline = require("readline");

const BACKEND =
  process.env.AIVA_BACKEND_URL || "https://aiva-yitg.onrender.com";

const IDENTITY_FILE =
  process.env.AIVA_IDENTITY_FILE ||
  (fs.existsSync(".aiva_pc_b_identity.json")
    ? ".aiva_pc_b_identity.json"
    : ".aiva_node_identity.json");

const TOKEN_FILE = ".aiva_pc_b_tokens.json";

function loadIdentity() {
  if (!fs.existsSync(IDENTITY_FILE)) {
    throw new Error(`${IDENTITY_FILE} not found`);
  }

  return JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf8"));
}

const identity = loadIdentity();

if (identity.node_id !== "PC-B") {
  throw new Error(`Expected node_id PC-B, found ${identity.node_id}`);
}

const DEVICE_ID = identity.device_id;
const DEVICE_NAME = identity.hostname || os.hostname();

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (!hidden) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    process.stdout.write(question);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();

    let value = "";

    const onData = (ch) => {
      ch = ch.toString();

      if (ch === "\r" || ch === "\n") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(value);
        return;
      }

      if (ch === "\u0003") {
        process.stdin.setRawMode?.(false);
        process.exit(1);
      }

      if (ch === "\u007f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
        }
        return;
      }

      value += ch;
    };

    process.stdin.on("data", onData);
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${BACKEND}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      body?.raw ||
      `HTTP ${response.status}`;

    const error = new Error(`${response.status}: ${message}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

function saveTokens(tokens) {
  fs.writeFileSync(
    TOKEN_FILE,
    JSON.stringify(
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_FILE)) return null;

  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function login() {
  console.log("\n=== PC-B OWNER AUTHENTICATION ===");

  const email = await ask("Owner email: ");
  const password = await ask("Owner password: ", true);

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      device: {
        deviceId: DEVICE_ID,
        deviceName: DEVICE_NAME,
        platform: "windows",
      },
    }),
  });

  if (!result.accessToken || !result.refreshToken) {
    throw new Error("Login succeeded but no tokens were returned.");
  }

  saveTokens(result);

  console.log("✓ Owner authentication successful");

  return result;
}

async function registerDevice(accessToken) {
  try {
    await request("/auth/devices/register", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        deviceName: DEVICE_NAME,
        platform: "windows",
      }),
    });

    console.log("✓ PC-B device authorization confirmed");
  } catch (error) {
    if (error.status === 409 || error.status === 400) {
      console.log("✓ PC-B device already registered");
      return;
    }

    throw error;
  }
}

async function refresh(tokens) {
  const result = await request("/auth/refresh", {
    method: "POST",
    headers: {
      "x-device-id": DEVICE_ID,
    },
    body: JSON.stringify({
      refreshToken: tokens.refreshToken,
    }),
  });

  saveTokens(result);

  return result;
}

async function authenticated(path, options = {}, tokens) {
  try {
    return await request(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${tokens.accessToken}`,
        "x-device-id": DEVICE_ID,
      },
    });
  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }

    console.log("Access token expired; refreshing...");

    tokens = await refresh(tokens);

    return await request(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${tokens.accessToken}`,
        "x-device-id": DEVICE_ID,
      },
    });
  }
}

function registrationPayload() {
  const totalMemoryGb = os.totalmem() / 1024 / 1024 / 1024;
  const availableMemoryGb = os.freemem() / 1024 / 1024 / 1024;

  return {
    deviceId: DEVICE_ID,
    deviceName: DEVICE_NAME,
    nodeId: "PC-B",
    nodeRole: "CPU_LOCAL_NODE",

    cpu: {
      model: os.cpus()[0]?.model || "Intel Core i5-1335U",
      cores: os.cpus().length,
      utilizationPercent: 0,
    },

    memory: {
      totalGb: Number(totalMemoryGb.toFixed(2)),
      availableGb: Number(availableMemoryGb.toFixed(2)),
      ramUsedGb: Number((totalMemoryGb - availableMemoryGb).toFixed(2)),
    },

    gpu: {
      available: false,
      hasCuda: false,
      vendor: "Intel",
      model: "Intel Iris Xe Graphics",
      deviceName: "Intel Iris Xe Graphics",
      vramGb: 0,
      vramMb: 0,
      utilizationPercent: 0,
    },

    models: ["qwen3:4b"],
    ttsEngines: [],

    capabilities: [
      "LOCAL_LLM",
      "CPU_INFERENCE",
      "REMOTE_CODING",
      "GENERAL_COMPUTE",
    ],

    status: "ONLINE",
    activeWorkloadCount: 0,
    pluggedIn: true,
  };
}

async function registerFabric(tokens) {
  await authenticated(
    "/ai/fabric/register",
    {
      method: "POST",
      body: JSON.stringify(registrationPayload()),
    },
    tokens
  );

  console.log("✓ PC-B registered with AIVA fabric");
}

async function heartbeat(tokens) {
  try {
    await authenticated(
      "/ai/fabric/heartbeat",
      {
        method: "POST",
        body: JSON.stringify({
          deviceId: DEVICE_ID,
        }),
      },
      tokens
    );

    console.log(`[${new Date().toLocaleTimeString()}] ✓ heartbeat`);
    return true;
  } catch (error) {
    console.error(
      `[${new Date().toLocaleTimeString()}] heartbeat failed:`,
      error.message
    );

    try {
      console.log(
        `[${new Date().toLocaleTimeString()}] ↻ re-registering PC-B...`
      );

      await registerFabric(tokens);

      console.log(
        `[${new Date().toLocaleTimeString()}] ✓ PC-B re-registered with AIVA fabric`
      );

      return true;
    } catch (registrationError) {
      console.error(
        `[${new Date().toLocaleTimeString()}] re-registration failed:`,
        registrationError.message
      );

      return false;
    }
  }
}

async function executeFabricWork(work) {
  const startedAt = Date.now();

  if (!work || !work.requestId) {
    throw new Error("Invalid fabric work item");
  }

  if (work.type !== "AI_INFERENCE") {
    throw new Error(`Unsupported fabric work type: ${work.type}`);
  }

  if (work.capability !== "LOCAL_LLM") {
    throw new Error(`Unsupported fabric capability: ${work.capability}`);
  }

  const model =
    work.payload?.model || process.env.OLLAMA_MODEL || "qwen3:4b";

  const messages = Array.isArray(work.payload?.messages)
    ? work.payload.messages
    : [];

  if (messages.length === 0) {
    throw new Error("AI_INFERENCE requires messages");
  }

  const temperature =
    typeof work.payload?.temperature === "number"
      ? work.payload.temperature
      : 0.2;

  const maxTokens =
    typeof work.payload?.maxTokens === "number"
      ? work.payload.maxTokens
      : 2048;

  const ollamaUrl =
    process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

  console.log(
    `[FABRIC] executing ${work.requestId} on PC-B Ollama (${model})...`
  );

  const response = await fetch(
    `${ollamaUrl.replace(/\/$/, "")}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Ollama HTTP ${response.status}: ${text.slice(0, 2000)}`
    );
  }

  const data = await response.json();

  const content =
    (data?.message?.content && data.message.content.trim().length > 0)
      ? data.message.content.trim()
      : (data?.message?.thinking?.trim() || data?.response?.trim() || "");

  if (!content) {
    throw new Error("Ollama returned an empty response");
  }

  const latencyMs = Date.now() - startedAt;

  return {
    content,
    model: data?.model || model,
    provider: "ollama",
    target: "PC-B",
    latencyMs,
  };
}

let fabricWorkerRunning = false;

async function pollFabricWork(tokens) {
  if (fabricWorkerRunning) {
    return;
  }

  fabricWorkerRunning = true;

  try {
    const result = await authenticated(
      "/ai/fabric/work/poll",
      {
        method: "POST",
        body: JSON.stringify({
          nodeId: "PC-B",
        }),
      },
      tokens
    );

    const work = result?.work;

    if (!work) {
      return;
    }

    console.log(
      `\n[FABRIC] [PC-B WORKER] 🎯 Received assigned work ${work.requestId} (${work.type})`
    );

    try {
      const execution = await executeFabricWork(work);

      await authenticated(
        "/ai/fabric/work/complete",
        {
          method: "POST",
          body: JSON.stringify({
            requestId: work.requestId,
            result: execution,
          }),
        },
        tokens
      );

      console.log(
        `[FABRIC] [PC-B WORKER] ✓ Completed work ${work.requestId} in ${execution.latencyMs}ms`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error(
        `[FABRIC] [PC-B WORKER] Execution failed ${work.requestId}: ${message}`
      );

      try {
        await authenticated(
          "/ai/fabric/work/fail",
          {
            method: "POST",
            body: JSON.stringify({
              requestId: work.requestId,
              error: message,
            }),
          },
          tokens
        );
      } catch (failError) {
        console.error(
          `[FABRIC] [PC-B WORKER] Failed to report failure: ${failError.message}`
        );
      }
    }
  } catch (err) {
    if (!err.message?.includes("fetch failed") && err.status !== 404) {
      console.error(
        `[${new Date().toLocaleTimeString()}] Worker poll error:`,
        err.message
      );
    }
  } finally {
    fabricWorkerRunning = false;
  }
}

async function main() {
  console.log("==============================================");
  console.log("       AIVA PC-B PRODUCTION NODE AGENT");
  console.log("==============================================");
  console.log(`Backend: ${BACKEND}`);
  console.log(`Device:  ${DEVICE_ID}`);
  console.log(`Host:    ${DEVICE_NAME}`);
  console.log(`Node:    PC-B / CPU_LOCAL_NODE`);
  console.log(`Model:   qwen3:4b (Ollama)`);
  console.log("");

  let tokens = loadTokens();

  if (!tokens?.refreshToken) {
    tokens = await login();
  } else {
    console.log("Existing PC-B authentication found.");

    try {
      await registerDevice(tokens.accessToken);
    } catch {
      try {
        tokens = await refresh(tokens);
        await registerDevice(tokens.accessToken);
      } catch {
        console.log("Stored authentication expired/revoked; logging in again.");
        tokens = await login();
      }
    }
  }

  await registerDevice(tokens.accessToken);
  await registerFabric(tokens);

  console.log("");
  console.log("==============================================");
  console.log("             PC-B IS ONLINE");
  console.log("==============================================");
  console.log("Independent local AI: READY");
  console.log("Fabric participation: READY");
  console.log("Heartbeat interval:   20 seconds");
  console.log("Worker poll interval: 1000 ms");
  console.log("Cloud dependency:     NONE for local inference");
  console.log("");

  await heartbeat(tokens);
  await pollFabricWork(tokens);

  setInterval(async () => {
    await heartbeat(tokens);
  }, 20000);

  setInterval(async () => {
    await pollFabricWork(tokens);
  }, 1000);
}

main().catch((error) => {
  console.error("\nPC-B agent failed:");
  console.error(error.message);

  if (error.status) {
    console.error(`HTTP status: ${error.status}`);
  }

  process.exit(1);
});
