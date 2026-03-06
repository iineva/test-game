import { FormEvent, useEffect, useRef, useState } from "react";
import { AvatarScene } from "./components/AvatarScene";

type Role = "user" | "assistant" | "system";

type ChatMessage = {
  role: Role;
  content: string;
};

type Config = {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type VoiceCaptureMode = "idle" | "hold" | "continuous";

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const STORAGE_KEY = "avatar-demo-config";

const defaultConfig: Config = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  systemPrompt: "你是一个亲和、自然、简洁的 3D 数字人助手，请用中文与用户对话。",
};

const welcomeMessage: ChatMessage = {
  role: "assistant",
  content: "你好，我是你的 3D 数字人助手。默认已切到语音输入，点一下麦克风就可以开始。",
};

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function App() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("待连接");
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsPageOpen, setSettingsPageOpen] = useState(false);
  const [historyPageOpen, setHistoryPageOpen] = useState(false);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [isListening, setIsListening] = useState(false);
  const [voiceCaptureMode, setVoiceCaptureMode] = useState<VoiceCaptureMode>("idle");
  const [voiceSupported] = useState(() => typeof window !== "undefined" && !!getSpeechRecognitionConstructor());
  const historyListRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stopRequestedRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const inputModeRef = useRef(inputMode);
  const voiceCaptureModeRef = useRef<VoiceCaptureMode>("idle");
  const loadingRef = useRef(false);
  const messagesRef = useRef(messages);
  const configRef = useRef(config);
  const recentMessages = messages.slice(-1);

  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  useEffect(() => {
    voiceCaptureModeRef.current = voiceCaptureMode;
  }, [voiceCaptureMode]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Partial<Config>;
      setConfig({
        baseUrl: parsed.baseUrl || defaultConfig.baseUrl,
        apiKey: parsed.apiKey || "",
        model: parsed.model || defaultConfig.model,
        systemPrompt: parsed.systemPrompt || defaultConfig.systemPrompt,
      });
    } catch {
      setMessages((current) => [
        ...current,
        { role: "system", content: "本地配置解析失败，已忽略旧配置。" },
      ]);
    }
  }, []);

  useEffect(() => {
    if (!voiceSupported) {
      setInputMode("text");
      setMessages((current) => [
        ...current,
        { role: "system", content: "当前浏览器不支持语音输入，已切换为文字输入。" },
      ]);
    }
  }, [voiceSupported]);

  useEffect(() => {
    const list = historyListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
      recognitionRef.current?.stop();
    };
  }, []);

  function updateConfig<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function pushMessage(message: ChatMessage) {
    setMessages((current) => [...current, message]);
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    pushMessage({ role: "system", content: "配置已保存到浏览器本地。" });
  }

  function clearMessages() {
    setMessages([welcomeMessage]);
  }

  async function submitContent(content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;

    const currentConfig = configRef.current;

    if (!currentConfig.baseUrl.trim() || !currentConfig.apiKey.trim() || !currentConfig.model.trim()) {
      pushMessage({
        role: "system",
        content: "请先在设置里填写 API Base URL、API Key 和 Model。",
      });
      setMenuOpen(false);
      setSettingsPageOpen(true);
      return;
    }

    const nextUserMessage: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messagesRef.current, nextUserMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setStatus("请求模型中");

    try {
      const reply = await requestChatCompletion(currentConfig, nextMessages);
      const assistantMessage: ChatMessage = { role: "assistant", content: reply };
      setMessages((current) => [...current, assistantMessage]);
      setLoading(false);
      setStatus("已连接");
      speak(reply, setIsSpeaking, setStatus, pushMessage);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "调用失败，请检查配置。";
      pushMessage({ role: "system", content: errorMessage });
      setLoading(false);
      setStatus("调用失败");
    }
  }

  function startVoiceInput(mode: Exclude<VoiceCaptureMode, "idle">) {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      pushMessage({
        role: "system",
        content: "当前浏览器不支持语音输入，请切换到文字输入。",
      });
      setInputMode("text");
      return;
    }

    if (isListening) return;

    if (!recognitionRef.current) {
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "zh-CN";

      recognition.onstart = () => {
        setIsListening(true);
        setStatus("语音输入中");
      };

      recognition.onresult = (event) => {
        let transcript = "";
        let finalText = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const nextChunk = event.results[index][0].transcript;
          transcript += nextChunk;

          if (event.results[index].isFinal) {
            finalText += nextChunk;
          }
        }

        setInput(transcript.trim());

        if (finalText.trim()) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalText}`.trim();
        }
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        setVoiceCaptureMode("idle");
        setStatus("语音输入失败");

        if (event.error && event.error !== "no-speech" && event.error !== "aborted") {
          pushMessage({
            role: "system",
            content: `语音输入失败: ${event.error}`,
          });
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        const nextTranscript = finalTranscriptRef.current.trim();
        const shouldRestart =
          voiceCaptureModeRef.current === "continuous" &&
          !stopRequestedRef.current &&
          inputModeRef.current === "voice" &&
          !loadingRef.current;

        if (nextTranscript) {
          finalTranscriptRef.current = "";
          void submitContent(nextTranscript);
        }

        if (shouldRestart) {
          setStatus("持续语音中");
          window.setTimeout(() => {
            if (
              recognitionRef.current &&
              voiceCaptureModeRef.current === "continuous" &&
              inputModeRef.current === "voice" &&
              !loadingRef.current
            ) {
              try {
                recognitionRef.current.start();
              } catch {
                setVoiceCaptureMode("idle");
                setStatus("待开始语音");
              }
            }
          }, 120);
          return;
        }

        setVoiceCaptureMode("idle");
        setStatus((current) => (current === "语音输入中" || current === "持续语音中" ? "待开始语音" : current));
        stopRequestedRef.current = false;
      };

      recognitionRef.current = recognition;
    }

    finalTranscriptRef.current = "";
    stopRequestedRef.current = false;
    setVoiceCaptureMode(mode);
    setStatus(mode === "continuous" ? "持续语音中" : "语音输入中");

    try {
      recognitionRef.current.start();
    } catch {
      setVoiceCaptureMode("idle");
      setStatus("语音输入失败");
    }
  }

  function stopVoiceInput(nextMode: VoiceCaptureMode = "idle") {
    stopRequestedRef.current = true;
    setVoiceCaptureMode(nextMode);
    recognitionRef.current?.stop();
    setIsListening(false);
    setStatus(nextMode === "continuous" ? "持续语音中" : "待开始语音");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isListening) {
      stopVoiceInput();
    }

    await submitContent(input);
  }

  function handleModeChange(nextMode: "voice" | "text") {
    setInputMode(nextMode);

    if (nextMode === "text") {
      stopVoiceInput();
      setStatus("文字输入");
      return;
    }

    setStatus(voiceSupported ? "待开始语音" : "当前浏览器不支持语音");
  }

  function handleVoicePressStart() {
    if (!voiceSupported || loading) return;

    holdTriggeredRef.current = false;

    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true;
      startVoiceInput("hold");
    }, 350);
  }

  function handleVoicePressEnd() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (holdTriggeredRef.current) {
      holdTriggeredRef.current = false;
      stopVoiceInput();
      return;
    }

    if (!voiceSupported || loading) return;

    if (voiceCaptureMode === "continuous") {
      stopVoiceInput();
      return;
    }

    startVoiceInput("continuous");
  }

  function voiceTriggerLabel() {
    if (!voiceSupported) return "当前浏览器不支持语音输入";
    if (loading) return "正在生成回复...";
    if (isListening && voiceCaptureMode === "hold") return "松开发送语音";
    if (isListening && voiceCaptureMode === "continuous") return "持续语音中，轻点结束";
    if (input.trim()) return input;
    return "按住说话，轻点进入持续语音";
  }

  return (
    <div className="app-shell">
      <section className="stage-panel">
        <div className="top-bar">
          <div className="top-actions">
            <div className="status-pill">{status}</div>
            <button
              type="button"
              className="icon-btn round-btn"
              onClick={() => setMenuOpen((current) => !current)}
              aria-expanded={menuOpen}
              aria-controls="floating-menu"
              aria-label="打开菜单"
            >
              ☰
            </button>
          </div>
        </div>

        <AvatarScene isSpeaking={isSpeaking} isThinking={loading} />

        <div className="stage-vignette" />

        {menuOpen ? (
          <button
            type="button"
            className="menu-backdrop"
            aria-label="关闭菜单"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        <aside
          id="floating-menu"
          className={`menu-drawer ${menuOpen ? "open" : ""}`}
          aria-hidden={!menuOpen}
        >
          <div className="menu-card">
            <div className="menu-header">
              <div>
                <p className="menu-kicker">Menu</p>
                <h3>快捷操作</h3>
              </div>
            </div>

            <div className="menu-actions vertical">
              <button
                type="button"
                className="ghost-btn menu-item"
                onClick={() => {
                  setSettingsPageOpen(true);
                  setMenuOpen(false);
                  setHistoryPageOpen(false);
                }}
                aria-label="进入设置"
              >
                <span className="menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path
                      d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8 4.3-1.7-.5a6.7 6.7 0 0 0-.4-1l.9-1.5a.9.9 0 0 0-.1-1.1l-1.1-1.1a.9.9 0 0 0-1.1-.1l-1.5.9a6.7 6.7 0 0 0-1-.4L13.5 4a.9.9 0 0 0-.9-.7H11.4a.9.9 0 0 0-.9.7l-.5 1.7a6.7 6.7 0 0 0-1 .4l-1.5-.9a.9.9 0 0 0-1.1.1L5.3 6.4a.9.9 0 0 0-.1 1.1l.9 1.5c-.2.3-.3.7-.4 1L4 11.5a.9.9 0 0 0-.7.9v1.2a.9.9 0 0 0 .7.9l1.7.5c.1.3.2.7.4 1l-.9 1.5a.9.9 0 0 0 .1 1.1l1.1 1.1a.9.9 0 0 0 1.1.1l1.5-.9c.3.2.7.3 1 .4l.5 1.7a.9.9 0 0 0 .9.7h1.2a.9.9 0 0 0 .9-.7l.5-1.7c.3-.1.7-.2 1-.4l1.5.9a.9.9 0 0 0 1.1-.1l1.1-1.1a.9.9 0 0 0 .1-1.1l-.9-1.5c.2-.3.3-.7.4-1l1.7-.5a.9.9 0 0 0 .7-.9v-1.2a.9.9 0 0 0-.7-.9Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span>设置</span>
              </button>
              <button
                type="button"
                className="ghost-btn menu-item"
                onClick={() => {
                  setHistoryPageOpen(true);
                  setMenuOpen(false);
                }}
                aria-label="进入记录"
              >
                <span className="menu-icon" aria-hidden="true">
                  ☰
                </span>
                <span>记录</span>
              </button>
              <button
                type="button"
                className="ghost-btn menu-item"
                onClick={clearMessages}
              >
                <span className="menu-icon" aria-hidden="true">
                  ⌫
                </span>
                <span>清空</span>
              </button>
            </div>
          </div>
        </aside>

        <section className="message-preview">
          <div className="message-list floating">
            {recentMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                {message.content}
              </div>
            ))}
          </div>
        </section>

        <section className="conversation-sheet">
          <form
            className={inputMode === "voice" ? "chat-form voice-mode" : "chat-form text-mode"}
            onSubmit={handleSubmit}
          >
            {inputMode === "voice" ? (
              <div className="input-shell voice-input-shell">
                <button
                  type="button"
                  className={`voice-trigger ${isListening ? "live" : ""}`}
                  onPointerDown={handleVoicePressStart}
                  onPointerUp={handleVoicePressEnd}
                  onPointerLeave={handleVoicePressEnd}
                  onPointerCancel={handleVoicePressEnd}
                  disabled={loading || !voiceSupported}
                  aria-label="按住说话，轻点持续语音"
                >
                  <span className="voice-trigger-icon" aria-hidden="true">
                    {isListening ? "◉" : "⌁"}
                  </span>
                  <span className="voice-trigger-text">{voiceTriggerLabel()}</span>
                </button>
                <div className="input-shell-actions">
                  <button
                    type="button"
                    className="ghost-btn circular-btn toggle-input-btn"
                    onClick={() => handleModeChange("text")}
                    aria-label="切换键盘输入"
                  >
                    <span className="toggle-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" role="presentation">
                        <rect
                          x="3.5"
                          y="6.5"
                          width="17"
                          height="11"
                          rx="2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 13h.01M10 13h.01M13 13h4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="input-shell text-input-shell">
                  <textarea
                    rows={3}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask Anything"
                    disabled={loading}
                  />
                  <div className="input-shell-actions">
                    <button
                      type="button"
                      className="ghost-btn circular-btn toggle-input-btn"
                      onClick={() => handleModeChange("voice")}
                      aria-label="切换语音输入"
                    >
                      ◉
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className="send-btn text-send-btn"
                  disabled={loading || !input.trim()}
                  aria-label={loading ? "发送中" : "发送消息"}
                >
                  {loading ? (
                    <span className="send-icon" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <span className="send-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" role="presentation">
                        <path
                          d="M21.6 3.2 3.9 10.6c-.8.3-.8 1.5 0 1.8l6.5 2.6 2.6 6.5c.3.8 1.5.8 1.8 0l7.4-17.7c.3-.8-.5-1.6-1.3-1.3Z"
                          fill="currentColor"
                        />
                        <path
                          d="M10.3 14.9 21.5 3.7"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              </>
            )}
          </form>
        </section>

        {settingsPageOpen ? (
          <section className="settings-page">
            <div className="settings-page-card">
              <div className="settings-page-header">
                <div>
                  <p className="settings-kicker">Settings</p>
                  <h2>模型设置</h2>
                </div>
                <button
                  type="button"
                  className="ghost-btn compact-btn"
                  onClick={() => setSettingsPageOpen(false)}
                >
                  返回
                </button>
              </div>

              <div className="settings-form">
                <label>
                  API Base URL
                  <input
                    value={config.baseUrl}
                    onChange={(event) => updateConfig("baseUrl", event.target.value)}
                    type="text"
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label>
                  API Key
                  <input
                    value={config.apiKey}
                    onChange={(event) => updateConfig("apiKey", event.target.value)}
                    type="password"
                    placeholder="sk-..."
                    autoComplete="off"
                  />
                </label>
                <label>
                  Model
                  <input
                    value={config.model}
                    onChange={(event) => updateConfig("model", event.target.value)}
                    type="text"
                    placeholder="gpt-4o-mini"
                  />
                </label>
                <label>
                  系统提示词
                  <textarea
                    rows={6}
                    value={config.systemPrompt}
                    onChange={(event) => updateConfig("systemPrompt", event.target.value)}
                  />
                </label>
              </div>

              <div className="settings-page-actions">
                <button type="button" className="ghost-btn" onClick={() => setSettingsPageOpen(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    saveConfig();
                    setSettingsPageOpen(false);
                  }}
                >
                  保存设置
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {historyPageOpen ? (
          <section className="settings-page">
            <div className="settings-page-card history-page-card">
              <div className="settings-page-header">
                <div>
                  <p className="settings-kicker">History</p>
                  <h2>完整聊天记录</h2>
                  <p className="history-page-summary">
                    共 {messages.length} 条消息，包含用户提问、助手回复和系统提示。
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost-btn compact-btn"
                  onClick={() => setHistoryPageOpen(false)}
                >
                  返回
                </button>
              </div>

              <div ref={historyListRef} className="history-page-list">
                {messages.map((message, index) => (
                  <div key={`${message.role}-page-${index}`} className={`history-row ${message.role}`}>
                    {message.role === "system" ? (
                      <div className={`message ${message.role}`}>{message.content}</div>
                    ) : (
                      <div className="history-bubble-row">
                        <div className="history-avatar">
                          {message.role === "user" ? "你" : "AI"}
                        </div>
                        <div className="history-bubble-stack">
                          <div className="history-role">
                            {message.role === "user" ? "你" : "数字人助手"}
                          </div>
                          <div className={`message ${message.role}`}>{message.content}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="settings-page-actions">
                <button type="button" className="ghost-btn" onClick={() => setHistoryPageOpen(false)}>
                  关闭
                </button>
                <button type="button" className="secondary-btn" onClick={clearMessages}>
                  清空记录
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}

async function requestChatCompletion(config: Config, messages: ChatMessage[]) {
  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: config.systemPrompt,
        },
        ...messages
          .filter((item) => item.role === "user" || item.role === "assistant")
          .map((item) => ({ role: item.role, content: item.content })),
      ],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const details = await safeReadText(response);
    throw new Error(`模型调用失败: ${response.status} ${details || response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | unknown } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型返回为空，未拿到 message.content。");
  }

  return typeof content === "string" ? content : JSON.stringify(content);
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function speak(
  text: string,
  setIsSpeaking: (value: boolean) => void,
  setStatus: (value: string | ((current: string) => string)) => void,
  pushMessage: (message: ChatMessage) => void,
) {
  if (!("speechSynthesis" in window)) {
    pushMessage({
      role: "system",
      content: "当前浏览器不支持语音播报，已仅显示文本回复。",
    });
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.pitch = 1;

  utterance.onstart = () => {
    setIsSpeaking(true);
    setStatus("语音播报中");
  };

  utterance.onend = () => {
    setIsSpeaking(false);
    setStatus("已连接");
  };

  utterance.onerror = () => {
    setIsSpeaking(false);
    setStatus("语音失败");
  };

  window.speechSynthesis.speak(utterance);
}
