"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { QRCodeCanvas } from "qrcode.react";

type ShortenResponse = {
  code: string;
  shortUrl: string;
  clicks: number;
  expiresAt?: string | null;
  duplicate?: boolean;
  originalUrl?: string;
};

const expiryOptions = [
  { value: "24h", label: "24 години" },
  { value: "7d", label: "7 днів" },
  { value: "30d", label: "30 днів" },
  { value: "never", label: "Безстроково" },
];

const highlightCards = [
  {
    title: "Розумна валідація",
    description: "Автоматично додаємо https://, підказуємо помилки та піклуємось про безпеку.",
    badge: "Smart",
    gradient: "from-cyan-500/20 via-blue-500/10",
  },
  {
    title: "Click Intelligence",
    description: "Лічильник кліків оновлюється миттєво після кожного переходу.",
    badge: "Realtime",
    gradient: "from-emerald-400/20 via-lime-400/10",
  },
  {
    title: "Контроль терміну",
    description: "Вибирайте, коли посилання втратить чинність — 24h, 7d, 30d чи назавжди.",
    badge: "Expiry",
    gradient: "from-amber-400/20 via-orange-400/10",
  },
];

const timelineSteps = [
  {
    title: "1. Вхідний URL",
    description: "Отримуємо довгу адресу, нормалізуємо, додаємо схему.",
  },
  {
    title: "2. Генерація коду",
    description: "Створюємо унікальний shortCode або використовуємо ваш кастомний.",
  },
  {
    title: "3. Збереження",
    description: "Записуємо в MongoDB з датою створення та терміном дії.",
  },
  {
    title: "4. Редирект",
    description: "Маршрут /go/[code] переадресовує та інкрементує лічильник кліків.",
  },
];

const expiryLabelByValue = expiryOptions.reduce<Record<string, string>>(
  (acc, option) => ({ ...acc, [option.value]: option.label }),
  {}
);

const themeModes = [
  {
    id: "aurora",
    label: "Aurora",
    accent: "Теплі хвилі",
  },
  {
    id: "cyber",
    label: "Cyber",
    accent: "Неонова осциляція",
  },
  {
    id: "midnight",
    label: "Midnight",
    accent: "Глибокий космос",
  },
] as const;

type ThemeMode = (typeof themeModes)[number]["id"];

interface HistoryItem {
  code: string;
  shortUrl: string;
  originalUrl: string;
  clicks: number;
  expiresAt?: string | null;
  timestamp: string;
}

const CUSTOM_CODE_REGEX = /^[A-Za-z0-9_-]{3,30}$/;
const HISTORY_STORAGE_KEY = "cutlink-history";

interface CustomCodeIndicatorProps {
  state: "idle" | "checking" | "available" | "taken" | "invalid";
  suggestion: string | null;
  onUseSuggestion: () => void;
}

function CustomCodeIndicator({ state, suggestion, onUseSuggestion }: CustomCodeIndicatorProps) {
  const stateMap: Record<CustomCodeIndicatorProps["state"], { label: string; color: string }> = {
    idle: { label: "Очікує", color: "text-slate-400" },
    checking: { label: "Перевіряємо...", color: "text-cyan-200" },
    available: { label: "Доступний", color: "text-emerald-300" },
    taken: { label: "Зайнятий", color: "text-amber-300" },
    invalid: { label: "Некоректний", color: "text-rose-300" },
  };

  const current = stateMap[state];

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-semibold ${current.color}`}>{current.label}</span>
      {state === "taken" && suggestion && (
        <button
          type="button"
          className="rounded-full border border-white/15 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-cyan-200"
          onClick={onUseSuggestion}
        >
          {suggestion}
        </button>
      )}
    </div>
  );
}

function HistoryCard({ item }: { item: HistoryItem }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{new Date(item.timestamp).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</span>
        <span>{item.clicks} кліків</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{item.shortUrl}</p>
      <p className="truncate text-xs text-slate-400">{item.originalUrl}</p>
      <a
        href={`/go/${item.code}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-2 text-xs text-cyan-200"
      >
        Перейти →
      </a>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const segments = data.length > 1 ? data.length - 1 : 1;

  return (
    <svg viewBox="0 0 100 40" className="h-full w-full">
      <polyline
        fill="none"
        stroke="url(#gradient)"
        strokeWidth="2"
        points={data
          .map((value, index) => {
            const x = (index / segments) * 100;
            const y = 40 - ((value - min) / range) * 40;
            return `${x},${y}`;
          })
          .join(" ")}
      />
      <defs>
        <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface ExpiryDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

function ExpiryDropdown({ value, onChange }: ExpiryDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current || open === false) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selectedLabel = expiryLabelByValue[value] ?? "Безстроково";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-base text-white outline-none transition hover:border-cyan-300 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selectedLabel}</span>
        <svg
          className={`h-4 w-4 transition ${open ? "rotate-180" : "rotate-0"}`}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 p-1 text-sm shadow-2xl">
          {expiryOptions.map((option) => {
            const isActive = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition hover:bg-white/10 ${
                    isActive ? "bg-white/10 text-cyan-200" : "text-white"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                  {isActive && (
                    <span className="text-xs uppercase tracking-[0.3em] text-cyan-200">
                      Active
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Home() {
  const [originalUrl, setOriginalUrl] = useState(
    "https://дуже-довга-адреса.com/з/багато/параметрів?page=1"
  );
  const [customCode, setCustomCode] = useState("");
  const [expiresIn, setExpiresIn] = useState("never");
  const [result, setResult] = useState<ShortenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [themeMode, setThemeMode] = useState<ThemeMode>("aurora");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [customCodeAvailability, setCustomCodeAvailability] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null);

  const expiresLabel = useMemo(() => {
    if (!result?.expiresAt) return "Безстроково";
    const formatted = new Intl.DateTimeFormat("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(result.expiresAt));
    return formatted;
  }, [result?.expiresAt]);

  const previewHost = useMemo(() => {
    if (!result?.originalUrl) return null;
    try {
      return new URL(result.originalUrl).host;
    } catch {
      return null;
    }
  }, [result?.originalUrl]);

  const activitySparkline = useMemo(() => {
    const clicks = history.map((item) => item.clicks);
    if (!clicks.length) {
      return [1, 3, 2, 4, 3, 5, 4];
    }
    return clicks.slice(0, 7).reverse();
  }, [history]);

  const activeBadge = useMemo(() => {
    if (history.length >= 7) return "Link Guru";
    if (history.length >= 4) return "Link Sprinter";
    if (history.length >= 1) return "First flight";
    return null;
  }, [history.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (storedHistory) {
      try {
        setHistory(JSON.parse(storedHistory));
      } catch (err) {
        console.error("Failed to parse history", err);
      }
    }
    const storedTheme = window.localStorage.getItem("cutlink-theme-mode") as
      | ThemeMode
      | null;
    if (storedTheme) {
      setThemeMode(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, 6))
    );
  }, [history]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cutlink-theme-mode", themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    if (!result?.shortUrl || !result.originalUrl) return;
    const newItem: HistoryItem = {
      code: result.code,
      shortUrl: result.shortUrl,
      originalUrl: result.originalUrl,
      clicks: result.clicks,
      expiresAt: result.expiresAt,
      timestamp: new Date().toISOString(),
    };
    setHistory((previous) => {
      const filtered = previous.filter((item) => item.code !== result.code);
      return [newItem, ...filtered].slice(0, 6);
    });
  }, [result]);

  useEffect(() => {
    if (!customCode.trim()) {
      setCustomCodeAvailability("idle");
      setSuggestedCode(null);
      return;
    }

    if (!CUSTOM_CODE_REGEX.test(customCode.trim())) {
      setCustomCodeAvailability("invalid");
      const slug = customCode.replace(/[^A-Za-z0-9_-]/g, "");
      if (slug.length >= 3) {
        setSuggestedCode(`${slug}-${Math.floor(Math.random() * 99) + 1}`);
      }
      return;
    }

    setCustomCodeAvailability("checking");
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/stats/${customCode.trim()}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          setCustomCodeAvailability("taken");
        } else if (response.status === 404) {
          setCustomCodeAvailability("available");
        } else {
          setCustomCodeAvailability("idle");
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setCustomCodeAvailability("idle");
        }
      }
    }, 400);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [customCode]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setCopied(false);

    const payload = {
      originalUrl,
      customCode: customCode.trim() || undefined,
      expiresIn,
    };

    startTransition(() => {
      void shortenLink(payload);
    });
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const text = event.dataTransfer.getData("text/plain");
    if (text) {
      setOriginalUrl(text.trim());
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const shortenLink = async (payload: {
    originalUrl: string;
    customCode?: string;
    expiresIn: string;
  }) => {
    try {
      const response = await fetch("/api/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Не вдалося створити посилання");
      }

      setResult(data as ShortenResponse);
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    }
  };

  const copyToClipboard = async () => {
    if (!result?.shortUrl) return;
    try {
      await navigator.clipboard.writeText(result.shortUrl);
      setCopied(true);
    } catch {
      setError("Не вдалося скопіювати. Спробуйте вручну.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white transition-colors">
      <div className="aurora-sheen" />
      <div className="glow-orb top-[-60px] left-[-40px]" />
      <div className="glow-orb glow-orb--cyan bottom-[-80px] right-[-20px]" />
      <div className="glow-orb glow-orb--sm top-[30%] right-[10%]" />
      <div className="grid-overlay" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-4 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-14 lg:px-10 lg:pb-24 lg:pt-16">
        <header className="reveal flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">
              CutLink
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Скорочуйте посилання за секунди
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-slate-200">
              Введіть довгу URL-адресу та отримайте компактне посилання з
              підрахунком кліків, кастомним кодом і терміном дії. Ніякої
              складності — лише швидкий результат.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.3em] text-slate-300">
              {themeModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setThemeMode(mode.id)}
                  className={`rounded-full border px-4 py-2 transition ${
                    themeMode === mode.id
                      ? "border-cyan-300 bg-cyan-500/10 text-white"
                      : "border-white/15 text-slate-300 hover:border-cyan-200"
                  }`}
                >
                  {mode.label}
                  <span className="ml-2 text-[0.55rem] text-cyan-200/80">{mode.accent}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="reveal rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-cyan-500/20 backdrop-blur">
            <p className="text-sm text-slate-300">Статистика сьогодні</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-4xl font-semibold text-white">∞</span>
              <span className="text-sm text-slate-300">Redirect-ready</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Редиректи виконуються одразу після генерації короткого коду.
            </p>
          </div>
        </header>

        <main className="reveal grid gap-6 md:gap-8 lg:gap-10 md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] md:items-start">
          <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-cyan-500/20 backdrop-blur sm:p-6 md:p-8 h-fit lg:self-start">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="originalUrl" className="text-sm font-medium text-slate-200">
                  Довге посилання
                </label>
                <textarea
                  id="originalUrl"
                  required
                  rows={3}
                  value={originalUrl}
                  onChange={(event) => setOriginalUrl(event.target.value)}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mt-2 w-full rounded-2xl border bg-white/10 p-4 text-base text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 ${
                    isDragging ? "border-cyan-300 bg-cyan-500/10" : "border-white/20"
                  }`}
                  placeholder="https://дуже-довга-адреса.com/з/багато/параметрів?page=1"
                />
                <p className="mt-2 text-xs text-slate-300">
                  Перетягніть URL сюди або вставте — ми перевіримо валідність і автоматично додамо https:// при потребі.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="customCode" className="text-sm font-medium text-slate-200">
                    Кастомний код (опційно)
                  </label>
                  <input
                    id="customCode"
                    type="text"
                    value={customCode}
                    onChange={(event) => setCustomCode(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/20 bg-white/10 p-3 text-base text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50"
                    placeholder="naprklad-cutlink2024"
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <p>3–30 символів: латиниця, цифри, _ , -</p>
                    <CustomCodeIndicator
                      state={customCodeAvailability}
                      suggestion={suggestedCode}
                      onUseSuggestion={() => suggestedCode && setCustomCode(suggestedCode)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-200">
                    Термін дії
                  </label>
                  <div className="mt-2">
                    <ExpiryDropdown value={expiresIn} onChange={setExpiresIn} />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Можна обмежити посилання часом або зробити його вічним.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="shine-button group flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 px-6 py-4 text-lg font-semibold text-slate-950 transition hover:shadow-[0_10px_40px_rgba(14,165,233,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Генеруємо..." : "Скоротити"}
                <span className="opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">
                  →
                </span>
              </button>
            </form>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
                {error}
              </div>
            )}

            {result && (
              <div className="mt-8 rounded-3xl border border-white/10 bg-slate-950/50 p-6">
                <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/70">
                  Готове посилання
                </p>
                <p className="mt-3 text-2xl font-semibold text-white break-all">
                  {result.shortUrl}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <span className="rounded-full border border-white/15 px-3 py-1">
                    Кліки: <strong className="text-white">{result.clicks}</strong>
                  </span>
                  <span className="rounded-full border border-white/15 px-3 py-1">
                    Діє до: <strong className="text-white">{expiresLabel}</strong>
                  </span>
                  {result.duplicate && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-100">
                      Використано існуюче посилання
                    </span>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300 hover:bg-cyan-500/10"
                  >
                    {copied ? "Скопійовано" : "Копіювати"}
                  </button>
                  <a
                    href={`/go/${result.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-2xl border border-transparent bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
                  >
                    Перейти
                  </a>
                  {result.shortUrl && (
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300 hover:bg-cyan-500/10"
                      onClick={() => window.open(result.shortUrl, "_blank")}
                    >
                      Попередній перегляд
                    </button>
                  )}
                </div>
                {result.shortUrl && result.originalUrl && (
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
                        Preview
                      </p>
                      <p className="mt-2 text-sm text-slate-300">{previewHost}</p>
                      <p className="truncate text-sm text-slate-400">{result.originalUrl}</p>
                    </div>
                    <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4">
                      <QRCodeCanvas value={result.shortUrl} size={120} bgColor="transparent" fgColor="#e0f2fe" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="w-full space-y-5 md:space-y-6 lg:space-y-8 md:pl-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">
                Особливості
              </p>
              <ul className="mt-4 space-y-4 text-sm text-slate-200">
                {highlightCards.map((feature) => (
                  <li key={feature.title} className="rounded-2xl border border-white/10 bg-gradient-to-br from-transparent via-white/5 to-white/0 p-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.3em] text-cyan-100/80">
                      {feature.badge}
                    </div>
                    <p className="mt-3 text-base font-semibold text-white">
                      {feature.title}
                    </p>
                    <p className="text-slate-300">{feature.description}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-900/50 p-6 text-sm text-slate-200">
              <div className="timeline-line" />
              <p className="text-base font-semibold text-white">
                Як працює CutLink?
              </p>
              <ol className="relative mt-6 space-y-6 pl-10 text-slate-300">
                {timelineSteps.map((step) => (
                  <li key={step.title} className="relative">
                    <span className="timeline-dot absolute -left-[46px] top-0" />
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p>{step.description}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-6 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">
                API доступне через `/api/shorten`, `/api/stats/:code` та маршрут `/go/:code`.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200 sm:p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">
                Ваша історія
              </p>
              <div className="mt-4 space-y-4">
                {history.length === 0 && (
                  <p className="text-slate-400">Ще немає скорочень. Створіть перше!</p>
                )}
                {history.map((item) => (
                  <HistoryCard key={item.code} item={item} />
                ))}
              </div>
            </div>
          </aside>
        </main>

        <section className="reveal grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {highlightCards.map((card) => (
            <div
              key={card.title}
              className={`card-glow rounded-3xl border border-white/10 bg-gradient-to-br ${card.gradient} p-6 backdrop-blur`}
            >
              <span className="text-xs uppercase tracking-[0.4em] text-cyan-100/80">
                {card.badge}
              </span>
              <h3 className="mt-3 text-2xl font-semibold text-white">{card.title}</h3>
              <p className="mt-2 text-sm text-slate-200">{card.description}</p>
            </div>
          ))}
        </section>

        <section className="reveal grid gap-4 lg:gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">
              Live activity
            </p>
            <div className="mt-4 h-24 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 p-3">
              <Sparkline data={activitySparkline} />
            </div>
            {activeBadge && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-100">
                <span>🏅 {activeBadge}</span>
                <span className="text-slate-300">+10 XP</span>
              </div>
            )}
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">
              Sandbox
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-white/5 to-transparent p-4 text-left text-sm text-white"
                onClick={() =>
                  setCustomCode(`cut-${Math.random().toString(36).slice(2, 7)}`)
                }
              >
                ⚡ Згенерувати кастомний код
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-transparent p-4 text-left text-sm text-white"
                onClick={() =>
                  setOriginalUrl("https://example.com/story?utm_source=cutlink")
                }
              >
                🧪 Заповнити приклад URL
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Тут можна експериментувати з кодами та URL без втрати даних.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
