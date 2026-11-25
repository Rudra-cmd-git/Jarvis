// Local OpenAI-compatible mock used only for end-to-end verification.
import http from "node:http";

const PORT = 8899;
const requests = [];

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const url = new URL(req.url, "http://127.0.0.1");
    requests.push({ time: Date.now(), method: req.method, path: url.pathname });

    if (url.pathname === "/requests") {
      sendJson(res, 200, requests.slice(-50));
      return;
    }

    if (url.pathname === "/v1/models") {
      sendJson(res, 200, { data: [{ id: "mock-1" }, { id: "mock-tool" }] });
      return;
    }

    if (url.pathname === "/broken/v1/chat/completions") {
      sendJson(res, 500, { error: { message: "simulated outage" } });
      return;
    }

    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      let payload = {};
      try {
        payload = JSON.parse(raw || "{}");
      } catch {
        sendJson(res, 400, { error: { message: "bad json" } });
        return;
      }
      const messages = payload.messages ?? [];
      const last = messages[messages.length - 1] ?? {};
      const toolResult = messages.find((m) => typeof m.content === "string" && m.content.startsWith("TOOL RESULT"));
      let answer;
      if (typeof last.content === "string" && last.content.includes("APPROVALTEST") && !toolResult) {
        answer =
          "I need to open a page for that.\n```tool\n{\"tool\":\"open_url\",\"args\":{\"url\":\"https://example.com\"},\"reason\":\"open the test page\"}\n```";
      } else if (typeof last.content === "string" && last.content.includes("TOOLTEST") && !toolResult) {
        answer =
          "Requesting the clock.\n```tool\n{\"tool\":\"datetime\",\"args\":{},\"reason\":\"user asked for a tool test\"}\n```";
      } else if (toolResult) {
        answer = `Tool completed. Reported: ${String(toolResult.content).split("\n")[0]}`;
      } else {
        answer =
          "MOCK RESPONSE: This reply is streamed from the local OpenAI-compatible test server. " +
          "It verifies that JARVIS sends history, receives server-sent events and persists the final message.";
      }

      if (!payload.stream) {
        sendJson(res, 200, {
          id: "mock",
          model: payload.model ?? "mock-1",
          choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
        });
        return;
      }

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const words = answer.split(" ");
      let i = 0;
      const timer = setInterval(() => {
        if (i < words.length) {
          const delta = (i === 0 ? "" : " ") + words[i];
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
          i += 1;
        } else {
          res.write("data: [DONE]\n\n");
          clearInterval(timer);
          res.end();
        }
      }, 12);
      res.on("close", () => clearInterval(timer));
      return;
    }

    sendJson(res, 404, { error: { message: "not found" } });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock-openai listening on ${PORT}`));
