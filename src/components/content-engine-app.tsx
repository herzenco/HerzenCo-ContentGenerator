"use client";

import {
  Activity,
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  FileText,
  Gauge,
  Globe2,
  ImageIcon,
  KeyRound,
  ListChecks,
  LogOut,
  PanelLeft,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type View =
  | "quick"
  | "overview"
  | "properties"
  | "review"
  | "performance"
  | "calendar"
  | "topics"
  | "settings";

type PropertySlug = string;
type ContentStatus =
  | "drafting"
  | "qa"
  | "needs_review"
  | "scheduled"
  | "published"
  | "rejected"
  | "failed";
type TopicStatus = "backlog" | "briefed" | "drafted" | "published" | "rejected";
type ContentSource = "quick_generate" | "api" | "schedule" | "repurpose";
type ModelProvider = "anthropic" | "openai" | "google" | "replicate";
type ModelCapability = "text" | "image_gen" | "vision";
type QualityTier = "fast" | "standard" | "premium";
type RoutingTask =
  | "brief"
  | "draft"
  | "qa"
  | "faq"
  | "meta"
  | "image_brief"
  | "image_gen"
  | "image_check";

interface PropertyConfig {
  slug: PropertySlug;
  name: string;
  domain: string;
  language: "English" | "Spanish";
  threshold: number;
  active: boolean;
  revalidateUrl?: string;
  revalidateSecret?: string;
  imagesEnabled?: boolean;
}

interface ContentItem {
  id: string;
  title: string;
  property: PropertySlug;
  prompt: string;
  contentType: "article" | "newsletter" | "social_post";
  status: ContentStatus;
  source: ContentSource;
  keywords: string[];
  toneOverride: string;
  qualityScore: number | null;
  publishAt: string;
  publishedAt: string;
  createdAt: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  evals: EvalResult[];
  body: string;
  contextHash?: string;
  socialMeta?: {
    ogTitle: string;
    ogDescription: string;
    ogType: "article";
    ogImage?: string;
  };
  heroImageUrl?: string;
  heroImageAlt?: string;
  imageStatus?: "off" | "skipped" | "queued" | "generated" | "failed";
  imageCheck?: string;
  servedModels?: ModelCallLog[];
}

interface EvalResult {
  name: string;
  score: number;
  passed: boolean;
  detail: string;
  hard?: boolean;
  category?: "brand" | "seo" | "aeo" | "quality";
}

interface Topic {
  id: string;
  property: PropertySlug;
  title: string;
  angle: string;
  keywords: string[];
  priority: number;
  status: TopicStatus;
  source: "manual" | "ai_suggested" | "lupe";
}

interface BrandProfile {
  property: PropertySlug;
  voice: string;
  audience: string;
  pillars: string;
  banned: string;
  cta: string;
  styleExamples?: string[];
  defaultCtas?: { name: string; url: string }[];
  visualStyleDescription?: string;
  visualPalette?: string;
  visualRules?: string;
}

interface ModelRegistryEntry {
  id: string;
  provider: ModelProvider;
  modelId: string;
  displayName: string;
  capabilities: ModelCapability[];
  costInputPerMtok?: number;
  costOutputPerMtok?: number;
  costPerImage?: number;
  qualityTier: QualityTier;
  active: boolean;
}

interface RoutingRule {
  id: string;
  task: RoutingTask;
  property: PropertySlug | "all";
  contentType: ContentItem["contentType"] | "all";
  language: PropertyConfig["language"] | "all";
  modelChain: string[];
  priority: number;
  active: boolean;
  notes: string;
}

interface ModelCallLog {
  task: RoutingTask;
  modelId: string;
  provider: ModelProvider;
  displayName: string;
  fallbackUsed: boolean;
  status: "served" | "fallback" | "config_error" | "failed";
  detail: string;
}

interface BrandContextDoc {
  id: string;
  property: PropertySlug;
  title: string;
  contentMd: string;
  source: "upload" | "written";
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

interface ContentMetricDaily {
  contentItemId: string;
  date: string;
  pageviews: number;
  gscImpressions?: number;
  gscClicks?: number;
  gscAvgPosition?: number;
}

interface EngineState {
  properties: PropertyConfig[];
  content: ContentItem[];
  topics: Topic[];
  brands: BrandProfile[];
  contextDocs: BrandContextDoc[];
  metrics: ContentMetricDaily[];
  models: ModelRegistryEntry[];
  routingRules: RoutingRule[];
  gscConnected: boolean;
  cron: string;
  apiKeys: { id: string; name: string; scopes: string[]; createdAt: string }[];
}

interface QuickGenerateForm {
  property: PropertySlug;
  prompt: string;
  contentType: "article" | "newsletter" | "social_post";
  publishAt: string;
  title: string;
  keywords: string;
  toneOverride: string;
  skipAutoPublish: boolean;
  generateHeroImage: boolean;
}

const storageKey = "herzen-content-engine-state-v1";

const navItems: {
  view: View;
  label: string;
  icon: ReactNode;
}[] = [
  { view: "quick", label: "Quick Generate", icon: <Zap size={17} /> },
  { view: "overview", label: "Overview", icon: <Gauge size={17} /> },
  { view: "properties", label: "Properties", icon: <Globe2 size={17} /> },
  { view: "review", label: "Review Queue", icon: <ShieldCheck size={17} /> },
  { view: "performance", label: "Performance", icon: <BarChart3 size={17} /> },
  { view: "calendar", label: "Calendar", icon: <CalendarDays size={17} /> },
  { view: "topics", label: "Topics", icon: <ListChecks size={17} /> },
  { view: "settings", label: "Settings", icon: <Settings size={17} /> },
];

const initialState: EngineState = {
  properties: [
    {
      slug: "herzenco",
      name: "Herzen Co.",
      domain: "herzenco.co",
      language: "English",
      threshold: 75,
      active: true,
      imagesEnabled: false,
    },
    {
      slug: "humanismo-evolutivo",
      name: "Humanismo Evolutivo",
      domain: "humanismoevolutivo.com",
      language: "Spanish",
      threshold: 75,
      active: true,
      imagesEnabled: false,
    },
  ],
  content: [
    {
      id: "ci_seed_review",
      title: "How operator-led AI systems make small teams faster",
      property: "herzenco",
      prompt: "Write about using AI systems to remove bottlenecks in small teams.",
      contentType: "article",
      status: "needs_review",
      source: "quick_generate",
      keywords: ["AI operations", "small teams"],
      toneOverride: "",
      qualityScore: 69,
      publishAt: "",
      publishedAt: "",
      createdAt: "2026-07-14T14:28:00.000Z",
      excerpt:
        "Small teams move faster when AI handles repeatable knowledge work and humans stay close to judgment calls.",
      metaTitle: "AI Systems for Small Teams",
      metaDescription:
        "A practical look at using AI systems to reduce bottlenecks inside lean operator-led teams.",
      evals: [
        {
          name: "Brand voice",
          score: 84,
          passed: true,
          detail: "Clear and practical.",
        },
        {
          name: "Factual risk",
          score: 44,
          passed: false,
          detail: "One unsupported productivity claim needs review.",
        },
        {
          name: "Structure",
          score: 78,
          passed: true,
          detail: "AEO sections are present.",
        },
      ],
      body: "## The operating layer\n\nAI works best when it removes repeated decisions from the team while keeping humans in control of judgment, taste, and accountability.",
    },
    {
      id: "ci_seed_scheduled",
      title: "La tecnologia consciente empieza con una pregunta humana",
      property: "humanismo-evolutivo",
      prompt: "Una reflexion sobre tecnologia consciente y crecimiento humano.",
      contentType: "article",
      status: "scheduled",
      source: "quick_generate",
      keywords: ["tecnologia consciente", "humanismo"],
      toneOverride: "mas reflexivo",
      qualityScore: 88,
      publishAt: "2026-07-17T09:00",
      publishedAt: "",
      createdAt: "2026-07-13T20:00:00.000Z",
      excerpt:
        "La tecnologia puede ampliar lo humano cuando empieza con una intencion clara.",
      metaTitle: "Tecnologia consciente y humanidad",
      metaDescription:
        "Una reflexion sobre tecnologia consciente, cultura y crecimiento humano.",
      evals: [
        {
          name: "Voz de marca",
          score: 90,
          passed: true,
          detail: "Humana y clara.",
        },
        {
          name: "Riesgo factual",
          score: 92,
          passed: true,
          detail: "Sin afirmaciones riesgosas.",
        },
      ],
      body: "## Una pregunta antes de la herramienta\n\nLa tecnologia consciente no empieza con el software, sino con la pregunta que queremos cuidar.",
    },
  ],
  topics: [
    {
      id: "topic_1",
      property: "herzenco",
      title: "AI content operations for founders",
      angle: "How to run content as an operating system, not a campaign.",
      keywords: ["AI content", "founder systems"],
      priority: 8,
      status: "backlog",
      source: "manual",
    },
    {
      id: "topic_2",
      property: "humanismo-evolutivo",
      title: "Humanismo en tiempos de automatizacion",
      angle: "La automatizacion como invitacion a pensar mejor lo humano.",
      keywords: ["humanismo", "automatizacion"],
      priority: 7,
      status: "briefed",
      source: "ai_suggested",
    },
  ],
  brands: [
    {
      property: "herzenco",
      voice:
        "Clear, strategic, practical, founder-led. Confident without hype.",
      audience:
        "Business owners, founders, and leaders looking for systems and AI-enabled growth.",
      pillars: "AI operations, business systems, content strategy, founder leverage",
      banned:
        "Unverifiable revenue claims, fabricated customer stories, guaranteed outcomes",
      cta: "Work with Herzen Co.",
      styleExamples: [
        "Useful beats flashy. Explain the operating principle, then show how to apply it.",
      ],
      defaultCtas: [{ name: "Work with Herzen Co.", url: "https://herzenco.co" }],
      visualStyleDescription: "",
      visualPalette: "",
      visualRules: "no text in images, no faces unless explicitly requested",
    },
    {
      property: "humanismo-evolutivo",
      voice:
        "Humanista, reflexivo, claro y esperanzador. Profundo sin solemnidad innecesaria.",
      audience:
        "Lectores hispanohablantes interesados en crecimiento humano, tecnologia y cultura.",
      pillars: "humanismo, evolucion personal, tecnologia consciente, cultura",
      banned:
        "Promesas terapeuticas, afirmaciones medicas no verificadas, citas inventadas",
      cta: "Explora mas ideas.",
      styleExamples: [
        "La claridad tambien puede ser profunda cuando evita la solemnidad innecesaria.",
      ],
      defaultCtas: [
        {
          name: "Explora mas ideas",
          url: "https://humanismoevolutivo.com",
        },
      ],
      visualStyleDescription: "",
      visualPalette: "",
      visualRules: "sin texto en imagenes, sin rostros, estilo fotografico sobrio",
    },
  ],
  contextDocs: [
    {
      id: "doc_herzenco_positioning",
      property: "herzenco",
      title: "Herzen Co. positioning",
      contentMd:
        "Herzen Co. helps operators turn content into a practical operating system. Distinctive positioning phrase: operator-grade content infrastructure.",
      source: "written",
      active: true,
      sortOrder: 0,
      createdAt: "2026-07-14T16:00:00.000Z",
    },
    {
      id: "doc_humanismo_context",
      property: "humanismo-evolutivo",
      title: "Humanismo Evolutivo context",
      contentMd:
        "Humanismo Evolutivo writes about technology through a human lens. Distinctive positioning phrase: tecnologia al servicio de la conciencia.",
      source: "written",
      active: true,
      sortOrder: 0,
      createdAt: "2026-07-14T16:05:00.000Z",
    },
  ],
  metrics: [
    { contentItemId: "ci_seed_review", date: "2026-07-12", pageviews: 18 },
    { contentItemId: "ci_seed_review", date: "2026-07-13", pageviews: 31 },
    {
      contentItemId: "ci_seed_review",
      date: "2026-07-14",
      pageviews: 27,
      gscImpressions: 210,
      gscClicks: 12,
      gscAvgPosition: 9.4,
    },
    { contentItemId: "ci_seed_scheduled", date: "2026-07-14", pageviews: 0 },
  ],
  models: [
    {
      id: "model_claude_sonnet",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      capabilities: ["text"],
      qualityTier: "premium",
      active: true,
    },
    {
      id: "model_claude_haiku",
      provider: "anthropic",
      modelId: "claude-haiku-4-6",
      displayName: "Claude Haiku 4.6",
      capabilities: ["text"],
      qualityTier: "fast",
      active: true,
    },
    {
      id: "model_openai_text",
      provider: "openai",
      modelId: "gpt-4.1-mini",
      displayName: "OpenAI GPT-4.1 mini",
      capabilities: ["text"],
      qualityTier: "standard",
      active: true,
    },
    {
      id: "model_openai_image",
      provider: "openai",
      modelId: "gpt-image-1",
      displayName: "OpenAI Images",
      capabilities: ["image_gen", "vision"],
      costPerImage: 0,
      qualityTier: "premium",
      active: true,
    },
  ],
  routingRules: [],
  gscConnected: false,
  cron: "0 9 * * 1,3",
  apiKeys: [
    {
      id: "key_lupe",
      name: "Lupe local key",
      scopes: ["content:write", "review:write"],
      createdAt: "2026-07-13T16:00:00.000Z",
    },
  ],
};

const emptyForm: QuickGenerateForm = {
  property: "herzenco",
  prompt: "",
  contentType: "article",
  publishAt: "",
  title: "",
  keywords: "",
  toneOverride: "",
  skipAutoPublish: false,
  generateHeroImage: false,
};

interface ContentEngineAppProps {
  userEmail: string;
}

export function ContentEngineApp({ userEmail }: ContentEngineAppProps) {
  const [state, setState] = useState<EngineState>(initialState);
  const [activeView, setActiveView] = useState<View>("quick");
  const [form, setForm] = useState<QuickGenerateForm>(emptyForm);
  const [selectedContentId, setSelectedContentId] = useState<string>(
    initialState.content[0]?.id ?? "",
  );
  const [selectedPropertySlug, setSelectedPropertySlug] =
    useState<PropertySlug>("herzenco");
  const [propertyTab, setPropertyTab] =
    useState<"profile" | "content" | "settings">("profile");
  const [performanceProperty, setPerformanceProperty] = useState<PropertySlug | "all">(
    "all",
  );
  const [performanceDays, setPerformanceDays] = useState<7 | 30 | 90>(30);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("Local workspace ready");
  const storageReady = useRef(false);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const restored = normalizeState(JSON.parse(saved) as Partial<EngineState>);
      setState(restored);
      setSelectedContentId(restored.content[0]?.id ?? "");
      storageReady.current = true;
      return;
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!storageReady.current) {
      storageReady.current = true;
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const selectedContent = useMemo(
    () => state.content.find((item) => item.id === selectedContentId),
    [selectedContentId, state.content],
  );

  const filteredContent = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return state.content;
    return state.content.filter((item) =>
      [item.title, item.prompt, item.keywords.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, state.content]);

  const selectedPropertyCompleteness = useMemo(
    () => getProfileCompleteness(state, form.property),
    [form.property, state],
  );

  function setContentItem(id: string, patch: Partial<ContentItem>) {
    setState((current) => ({
      ...current,
      content: current.content.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }

  function finishPipeline(item: ContentItem, forceReview = false) {
    const property = state.properties.find((entry) => entry.slug === item.property);
    const brand = state.brands.find((entry) => entry.property === item.property);
    const brandContext = assembleBrandContext(state, item.property);
    const contextHash = hashString(brandContext);
    const score = forceReview ? 66 : Math.max(82, item.qualityScore ?? 86);
    const publishAt = item.publishAt;
    const isFuture = publishAt ? new Date(publishAt).getTime() > Date.now() : false;
    const evals = buildEvals({
      score,
      language: property?.language ?? "English",
      hardFail: forceReview,
      item,
      context: brandContext,
    });
    const servedModels = collectServedModels(
      state,
      item,
      property?.language ?? "English",
      item.imageStatus === "queued",
    );
    const hasHardFail = evals.some((evalResult) => evalResult.hard && !evalResult.passed);
    const nextStatus: ContentStatus = forceReview
      ? "needs_review"
      : hasHardFail
        ? "needs_review"
        : isFuture
          ? "scheduled"
          : "published";

    window.setTimeout(() => {
      setContentItem(item.id, { status: "qa" });
      setToast("QA gate running");
    }, 700);

    window.setTimeout(() => {
      setContentItem(item.id, {
        status: nextStatus,
        qualityScore: score,
        evals,
        contextHash,
        servedModels,
        publishedAt: nextStatus === "published" ? new Date().toISOString() : "",
      });
      setToast(statusLabel(nextStatus));
    }, 1700);

    if (item.imageStatus === "queued") {
      window.setTimeout(() => {
        const imagePatch = buildHeroImagePatch(item, brand);
        setContentItem(item.id, imagePatch);
        setToast(imagePatch.heroImageUrl ? "Hero image attached" : "Image skipped");
      }, 2300);
    }
  }

  function createContentFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.prompt.trim()) {
      setToast("Prompt required");
      return;
    }
    if (!selectedPropertyCompleteness.complete) {
      setToast(`brand_profile_incomplete: ${selectedPropertyCompleteness.missing.join(", ")}`);
      setActiveView("properties");
      setSelectedPropertySlug(form.property);
      setPropertyTab("profile");
      return;
    }
    const property = state.properties.find((entry) => entry.slug === form.property);
    const visualProfile = getVisualProfileCompleteness(state, form.property);
    const wantsHeroImage = Boolean(
      property?.imagesEnabled && form.generateHeroImage,
    );
    const brandContext = assembleBrandContext(state, form.property);
    const title = form.title.trim() || makeTitle(form.prompt, property?.language);
    const keywords = parseKeywords(form.keywords);
    const primaryKeyword = keywords[0] ?? title.split(" ").slice(0, 2).join(" ");
    const excerpt = makeExcerpt(form.prompt, property?.language);
    const metaDescription = makeMetaDescription(excerpt, primaryKeyword, property?.language);
    const id = makeId("ci");
    const item: ContentItem = {
      id,
      title,
      property: form.property,
      prompt: form.prompt.trim(),
      contentType: form.contentType,
      status: "drafting",
      source: "quick_generate",
      keywords,
      toneOverride: form.toneOverride.trim(),
      qualityScore: null,
      publishAt: form.publishAt,
      publishedAt: "",
      createdAt: new Date().toISOString(),
      excerpt: makeExcerpt(form.prompt, property?.language),
      metaTitle: title.slice(0, 60),
      metaDescription,
      evals: [],
      body: makeBody(title, form.prompt, property?.language, brandContext, primaryKeyword),
      contextHash: hashString(brandContext),
      socialMeta: {
        ogTitle: title.slice(0, 60),
        ogDescription: metaDescription,
        ogType: "article",
      },
      imageStatus: wantsHeroImage
        ? visualProfile.complete
          ? "queued"
          : "skipped"
        : "off",
      imageCheck: wantsHeroImage
        ? visualProfile.complete
          ? "Image brief queued after QA."
          : "visual_profile_incomplete: visual style description required."
        : "Hero image generation is off for this property.",
    };

    setState((current) => ({ ...current, content: [item, ...current.content] }));
    setSelectedContentId(id);
    setForm({
      ...emptyForm,
      property: form.property,
      generateHeroImage: Boolean(property?.imagesEnabled),
    });
    setToast("Draft job started");
    finishPipeline(item, form.skipAutoPublish);
  }

  function approveContent(id: string) {
    const item = state.content.find((entry) => entry.id === id);
    if (!item) return;
    const isFuture = item.publishAt
      ? new Date(item.publishAt).getTime() > Date.now()
      : false;
    setContentItem(id, {
      status: isFuture ? "scheduled" : "published",
      publishedAt: isFuture ? "" : new Date().toISOString(),
    });
    setToast(isFuture ? "Scheduled" : "Published");
  }

  function regenerateContent(id: string) {
    const item = state.content.find((entry) => entry.id === id);
    if (!item) return;
    const regenerated = {
      ...item,
      status: "drafting" as ContentStatus,
      qualityScore: null,
      evals: [],
      title: `${item.title.replace(/^Regenerated: /, "")}`,
      createdAt: new Date().toISOString(),
    };
    setContentItem(id, regenerated);
    setToast("Regeneration started");
    finishPipeline(regenerated, false);
  }

  function regenerateHeroImage(id: string) {
    const item = state.content.find((entry) => entry.id === id);
    if (!item) return;
    const brand = state.brands.find((entry) => entry.property === item.property);
    setContentItem(id, buildHeroImagePatch(item, brand));
    setToast("Hero image regenerated");
  }

  function rejectContent(id: string) {
    setContentItem(id, { status: "rejected" });
    setToast("Rejected");
  }

  function publishNow(id: string) {
    setContentItem(id, {
      status: "published",
      publishedAt: new Date().toISOString(),
    });
    setToast("Published");
  }

  function addTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    const topic: Topic = {
      id: makeId("topic"),
      property: String(data.get("property")) as PropertySlug,
      title,
      angle: String(data.get("angle") ?? "").trim(),
      keywords: parseKeywords(String(data.get("keywords") ?? "")),
      priority: Number(data.get("priority") ?? 5),
      status: "backlog",
      source: "manual",
    };
    setState((current) => ({ ...current, topics: [topic, ...current.topics] }));
    event.currentTarget.reset();
    setToast("Topic added");
  }

  function draftFromTopic(topic: Topic) {
    setForm({
      ...emptyForm,
      property: topic.property,
      prompt: `${topic.title}. ${topic.angle}`,
      title: topic.title,
      keywords: topic.keywords.join(", "),
    });
    setActiveView("quick");
    setState((current) => ({
      ...current,
      topics: current.topics.map((entry) =>
        entry.id === topic.id ? { ...entry, status: "drafted" } : entry,
      ),
    }));
    setToast("Topic loaded");
  }

  function updateBrand(property: PropertySlug, patch: Partial<BrandProfile>) {
    setState((current) => ({
      ...current,
      brands: current.brands.map((brand) =>
        brand.property === property ? { ...brand, ...patch } : brand,
      ),
    }));
  }

  function updateThreshold(property: PropertySlug, threshold: number) {
    setState((current) => ({
      ...current,
      properties: current.properties.map((entry) =>
        entry.slug === property ? { ...entry, threshold } : entry,
      ),
    }));
  }

  function generateApiKey() {
    setState((current) => ({
      ...current,
      apiKeys: [
        {
          id: makeId("key"),
          name: `Local key ${current.apiKeys.length + 1}`,
          scopes: ["content:write"],
          createdAt: new Date().toISOString(),
        },
        ...current.apiKeys,
      ],
    }));
    setToast("API key created");
  }

  function resetWorkspace() {
    setState(initialState);
    setSelectedContentId(initialState.content[0]?.id ?? "");
    setToast("Demo data restored");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-[#0d0f12] text-[#eef1f0]">
      <div className="grid min-h-screen lg:grid-cols-[256px_1fr]">
        <aside className="border-r border-white/10 bg-[#111418] px-4 py-5">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center border border-emerald-300/40 bg-emerald-300/10 text-emerald-200">
              <Sparkles size={19} />
            </div>
            <div>
              <p className="text-sm font-semibold">Herzen Engine</p>
              <p className="font-mono text-xs text-white/45">local operator</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1" aria-label="Primary">
            {navItems.map((item) => (
              <button
                className={`flex w-full items-center gap-3 border px-3 py-2.5 text-left text-sm transition ${
                  activeView === item.view
                    ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                    : "border-transparent text-white/65 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                }`}
                key={item.view}
                onClick={() => setActiveView(item.view)}
                type="button"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-8 border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Activity size={16} />
              {toast}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex flex-col gap-4 border-b border-white/10 bg-[#15191e] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-white/45">
                {activeViewLabel(activeView)}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-white">
                {viewTitle(activeView)}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/55 md:flex">
                <KeyRound size={15} />
                <span className="max-w-52 truncate">{userEmail}</span>
              </div>
              <label className="flex min-w-0 items-center gap-2 border border-white/10 bg-[#0d0f12] px-3 py-2 text-sm text-white/60">
                <Search size={16} />
                <input
                  className="w-48 bg-transparent text-white outline-none placeholder:text-white/35"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search content"
                  value={query}
                />
              </label>
              <button
                className="inline-flex items-center gap-2 border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-300/15"
                onClick={() => setActiveView("quick")}
                type="button"
              >
                <Zap size={16} />
                New
              </button>
              <button
                className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white"
                onClick={signOut}
                type="button"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </header>

          <div className="p-5">
            {activeView === "quick" && (
              <QuickGenerateView
                content={state.content}
                form={form}
                onChange={setForm}
                onSubmit={createContentFromForm}
                properties={state.properties}
                profileCompleteness={selectedPropertyCompleteness}
                onOpenProfile={() => {
                  setActiveView("properties");
                  setSelectedPropertySlug(form.property);
                  setPropertyTab("profile");
                }}
                selectedContent={selectedContent}
              />
            )}
            {activeView === "overview" && (
              <OverviewView
                content={filteredContent}
                onPublish={publishNow}
                onSelect={(id) => {
                  setSelectedContentId(id);
                  setActiveView("review");
                }}
                properties={state.properties}
              />
            )}
            {activeView === "properties" && (
              <PropertiesView
                brands={state.brands}
                content={filteredContent}
                contextDocs={state.contextDocs}
                onAddProperty={(property) =>
                  setState((current) => ({
                    ...current,
                    properties: [property, ...current.properties],
                    brands: [
                      {
                        property: property.slug,
                        voice: "",
                        audience: "",
                        pillars: "",
                        banned: "",
                        cta: "",
                        styleExamples: [],
                        defaultCtas: [],
                        visualStyleDescription: "",
                        visualPalette: "",
                        visualRules: "",
                      },
                      ...current.brands,
                    ],
                  }))
                }
                onDeleteDoc={(id) =>
                  setState((current) => ({
                    ...current,
                    contextDocs: current.contextDocs.filter((doc) => doc.id !== id),
                  }))
                }
                onSelectProperty={setSelectedPropertySlug}
                onSetTab={setPropertyTab}
                onPublish={publishNow}
                onSelectContent={(id) => {
                  setSelectedContentId(id);
                  setActiveView("review");
                }}
                onUpdateBrand={updateBrand}
                onUpdateDoc={(doc) =>
                  setState((current) => ({
                    ...current,
                    contextDocs: current.contextDocs.map((entry) =>
                      entry.id === doc.id ? doc : entry,
                    ),
                  }))
                }
                onUpsertDoc={(doc) =>
                  setState((current) => ({
                    ...current,
                    contextDocs: [doc, ...current.contextDocs],
                  }))
                }
                onUpdateProperty={(slug, patch) =>
                  setState((current) => ({
                    ...current,
                    properties: current.properties.map((property) =>
                      property.slug === slug ? { ...property, ...patch } : property,
                    ),
                  }))
                }
                propertyTab={propertyTab}
                properties={state.properties}
                selectedPropertySlug={selectedPropertySlug}
              />
            )}
            {activeView === "review" && (
              <ReviewView
                content={filteredContent}
                onApprove={approveContent}
                onRegenerateImage={regenerateHeroImage}
                onRegenerate={regenerateContent}
                onReject={rejectContent}
                onSelect={setSelectedContentId}
                selectedContentId={selectedContentId}
              />
            )}
            {activeView === "performance" && (
              <PerformanceView
                content={filteredContent}
                days={performanceDays}
                gscConnected={state.gscConnected}
                metrics={state.metrics}
                onDaysChange={setPerformanceDays}
                onPropertyChange={setPerformanceProperty}
                properties={state.properties}
                selectedProperty={performanceProperty}
              />
            )}
            {activeView === "calendar" && (
              <CalendarView content={filteredContent} onPublish={publishNow} />
            )}
            {activeView === "topics" && (
              <TopicsView
                onAddTopic={addTopic}
                onDraft={draftFromTopic}
                properties={state.properties}
                topics={state.topics}
              />
            )}
            {activeView === "settings" && (
              <SettingsView
                apiKeys={state.apiKeys}
                cron={state.cron}
                gscConnected={state.gscConnected}
                models={state.models}
                onCronChange={(cron) =>
                  setState((current) => ({ ...current, cron }))
                }
                onGenerateApiKey={generateApiKey}
                onModelsChange={(models) =>
                  setState((current) => ({ ...current, models }))
                }
                onReset={resetWorkspace}
                onRoutingRulesChange={(routingRules) =>
                  setState((current) => ({ ...current, routingRules }))
                }
                onThresholdChange={updateThreshold}
                properties={state.properties}
                routingRules={state.routingRules}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function QuickGenerateView({
  content,
  form,
  onChange,
  onOpenProfile,
  onSubmit,
  properties,
  profileCompleteness,
  selectedContent,
}: {
  content: ContentItem[];
  form: QuickGenerateForm;
  onChange: (form: QuickGenerateForm) => void;
  onOpenProfile: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  properties: PropertyConfig[];
  profileCompleteness: { complete: boolean; missing: string[] };
  selectedContent?: ContentItem;
}) {
  const selectedProperty = properties.find((property) => property.slug === form.property);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <form className="space-y-5" onSubmit={onSubmit}>
        <Panel title="Generate">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Property">
              <select
                className={fieldClass}
                onChange={(event) => {
                  const nextProperty = properties.find(
                    (property) => property.slug === event.target.value,
                  );
                  onChange({
                    ...form,
                    property: event.target.value as PropertySlug,
                    generateHeroImage: Boolean(nextProperty?.imagesEnabled),
                  });
                }}
                value={form.property}
              >
                {properties.map((property) => (
                  <option key={property.slug} value={property.slug}>
                    {property.domain}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Content type">
              <select
                className={fieldClass}
                onChange={(event) =>
                  onChange({
                    ...form,
                    contentType: event.target.value as QuickGenerateForm["contentType"],
                  })
                }
                value={form.contentType}
              >
                <option value="article">Article</option>
                <option value="newsletter">Newsletter</option>
                <option value="social_post">Social post</option>
              </select>
            </Field>
          </div>

          {selectedProperty?.imagesEnabled && (
            <label className="mt-4 flex items-center gap-2 border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm text-cyan-100">
              <input
                checked={form.generateHeroImage}
                className="h-4 w-4 accent-cyan-300"
                onChange={(event) =>
                  onChange({ ...form, generateHeroImage: event.target.checked })
                }
                type="checkbox"
              />
              Generate hero image after QA
            </label>
          )}

          <Field label="Prompt">
            <textarea
              className={`${fieldClass} min-h-36 resize-y`}
              onChange={(event) => onChange({ ...form, prompt: event.target.value })}
              value={form.prompt}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <input
                className={fieldClass}
                onChange={(event) => onChange({ ...form, title: event.target.value })}
                value={form.title}
              />
            </Field>
            <Field label="Publish date">
              <input
                className={fieldClass}
                onChange={(event) =>
                  onChange({ ...form, publishAt: event.target.value })
                }
                type="datetime-local"
                value={form.publishAt}
              />
            </Field>
            <Field label="Keywords">
              <input
                className={fieldClass}
                onChange={(event) =>
                  onChange({ ...form, keywords: event.target.value })
                }
                value={form.keywords}
              />
            </Field>
            <Field label="Tone override">
              <input
                className={fieldClass}
                onChange={(event) =>
                  onChange({ ...form, toneOverride: event.target.value })
                }
                value={form.toneOverride}
              />
            </Field>
          </div>

          {!profileCompleteness.complete && (
            <div className="border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  brand_profile_incomplete:{" "}
                  {profileCompleteness.missing.join(", ")}
                </p>
                <button
                  className="text-left font-medium underline underline-offset-4"
                  onClick={onOpenProfile}
                  type="button"
                >
                  Complete profile
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                checked={form.skipAutoPublish}
                className="h-4 w-4 accent-emerald-300"
                onChange={(event) =>
                  onChange({ ...form, skipAutoPublish: event.target.checked })
                }
                type="checkbox"
              />
              Force review
            </label>
            <button
              className="inline-flex items-center justify-center gap-2 border border-emerald-300/40 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-[#08100d] hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35"
              disabled={!profileCompleteness.complete}
              type="submit"
            >
              <Send size={17} />
              Generate
            </button>
          </div>
        </Panel>
      </form>

      <div className="space-y-5">
        <Panel title="Current Run">
          {selectedContent ? (
            <ContentDetail item={selectedContent} />
          ) : (
            <EmptyState icon={<FileText size={20} />} label="No content selected" />
          )}
        </Panel>
        <Panel title="Recent">
          <div className="space-y-2">
            {content.slice(0, 5).map((item) => (
              <CompactContentRow item={item} key={item.id} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function OverviewView({
  content,
  onPublish,
  onSelect,
  properties,
}: {
  content: ContentItem[];
  onPublish: (id: string) => void;
  onSelect: (id: string) => void;
  properties: PropertyConfig[];
}) {
  const metrics = [
    { label: "Published", value: countByStatus(content, "published") },
    { label: "Scheduled", value: countByStatus(content, "scheduled") },
    { label: "Needs review", value: countByStatus(content, "needs_review") },
    {
      label: "Avg score",
      value: averageScore(content),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        {metrics.map((metric) => (
          <Panel key={metric.label}>
            <p className="font-mono text-xs uppercase text-white/45">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Content">
          <ContentTable
            content={content}
            onPublish={onPublish}
            onSelect={onSelect}
          />
        </Panel>
        <Panel title="Properties">
          <div className="space-y-3">
            {properties.map((property) => (
              <div className="border border-white/10 bg-white/[0.025] p-3" key={property.slug}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{property.domain}</p>
                    <p className="text-sm text-white/55">{property.language}</p>
                  </div>
                  <Badge tone={property.active ? "green" : "gray"}>
                    {property.active ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="mt-3 h-1 bg-white/10">
                  <div
                    className="h-1 bg-emerald-300"
                    style={{ width: `${property.threshold}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ReviewView({
  content,
  onApprove,
  onRegenerate,
  onRegenerateImage,
  onReject,
  onSelect,
  selectedContentId,
}: {
  content: ContentItem[];
  onApprove: (id: string) => void;
  onRegenerate: (id: string) => void;
  onRegenerateImage: (id: string) => void;
  onReject: (id: string) => void;
  onSelect: (id: string) => void;
  selectedContentId: string;
}) {
  const queue = content.filter((item) => item.status === "needs_review");
  const selected = content.find((item) => item.id === selectedContentId) ?? queue[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Panel title="Queue">
        <div className="space-y-2">
          {queue.length === 0 && (
            <EmptyState icon={<ShieldCheck size={20} />} label="Queue clear" />
          )}
          {queue.map((item) => (
            <button
              className={`w-full border p-3 text-left ${
                selected?.id === item.id
                  ? "border-amber-300/40 bg-amber-300/10"
                  : "border-white/10 bg-white/[0.025] hover:bg-white/[0.045]"
              }`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="line-clamp-1 font-medium">{item.title}</p>
                <Score value={item.qualityScore} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-white/55">
                {item.excerpt}
              </p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Review">
        {selected ? (
          <div className="space-y-5">
            <ContentDetail item={selected} />
            <div className="grid gap-3 md:grid-cols-4">
              <ActionButton
                icon={<Check size={17} />}
                label="Approve"
                onClick={() => onApprove(selected.id)}
                tone="green"
              />
              <ActionButton
                icon={<ImageIcon size={17} />}
                label="Image"
                onClick={() => onRegenerateImage(selected.id)}
                tone="cyan"
              />
              <ActionButton
                icon={<RefreshCw size={17} />}
                label="Regenerate"
                onClick={() => onRegenerate(selected.id)}
                tone="cyan"
              />
              <ActionButton
                icon={<X size={17} />}
                label="Reject"
                onClick={() => onReject(selected.id)}
                tone="red"
              />
            </div>
            <div className="border border-white/10 bg-[#0d0f12] p-4">
              <p className="mb-3 font-mono text-xs uppercase text-white/45">
                Eval results
              </p>
              <div className="space-y-3">
                {selected.evals.map((evalResult) => (
                  <div
                    className="grid gap-3 border border-white/10 bg-white/[0.025] p-3 md:grid-cols-[180px_80px_1fr]"
                    key={evalResult.name}
                  >
                    <p className="font-medium">{evalResult.name}</p>
                    <Score value={evalResult.score} />
                    <p className="text-sm text-white/60">{evalResult.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={<Archive size={20} />} label="Nothing selected" />
        )}
      </Panel>
    </div>
  );
}

function CalendarView({
  content,
  onPublish,
}: {
  content: ContentItem[];
  onPublish: (id: string) => void;
}) {
  const calendarItems = content
    .filter((item) => item.status === "scheduled" || item.status === "published")
    .sort((a, b) => calendarTime(a) - calendarTime(b));

  return (
    <Panel title="Publishing Calendar">
      <div className="space-y-3">
        {calendarItems.map((item) => (
          <div
            className="grid gap-3 border border-white/10 bg-white/[0.025] p-4 lg:grid-cols-[180px_minmax(0,1fr)_140px]"
            key={item.id}
          >
            <div>
              <p className="font-mono text-xs uppercase text-white/45">
                {item.status === "scheduled" ? "Scheduled" : "Published"}
              </p>
              <p className="mt-2 text-sm text-white/70">
                {formatDateTime(item.publishAt || item.publishedAt)}
              </p>
            </div>
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-white/55">{item.excerpt}</p>
            </div>
            <div className="flex items-center justify-end">
              {item.status === "scheduled" ? (
                <ActionButton
                  icon={<Play size={16} />}
                  label="Publish"
                  onClick={() => onPublish(item.id)}
                  tone="green"
                />
              ) : (
                <Badge tone="green">Live</Badge>
              )}
            </div>
          </div>
        ))}
        {calendarItems.length === 0 && (
          <EmptyState icon={<CalendarDays size={20} />} label="No dates yet" />
        )}
      </div>
    </Panel>
  );
}

function TopicsView({
  onAddTopic,
  onDraft,
  properties,
  topics,
}: {
  onAddTopic: (event: FormEvent<HTMLFormElement>) => void;
  onDraft: (topic: Topic) => void;
  properties: PropertyConfig[];
  topics: Topic[];
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Panel title="Add Topic">
        <form className="space-y-4" onSubmit={onAddTopic}>
          <Field label="Property">
            <select className={fieldClass} name="property">
              {properties.map((property) => (
                <option key={property.slug} value={property.slug}>
                  {property.domain}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title">
            <input className={fieldClass} name="title" />
          </Field>
          <Field label="Angle">
            <textarea className={`${fieldClass} min-h-24`} name="angle" />
          </Field>
          <Field label="Keywords">
            <input className={fieldClass} name="keywords" />
          </Field>
          <Field label="Priority">
            <input
              className={fieldClass}
              defaultValue={5}
              max={10}
              min={1}
              name="priority"
              type="number"
            />
          </Field>
          <button
            className="inline-flex w-full items-center justify-center gap-2 border border-emerald-300/40 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-[#08100d] hover:bg-emerald-200"
            type="submit"
          >
            <Pencil size={17} />
            Add
          </button>
        </form>
      </Panel>
      <Panel title="Backlog">
        <div className="space-y-3">
          {topics.map((topic) => (
            <div className="border border-white/10 bg-white/[0.025] p-4" key={topic.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{topic.title}</p>
                    <Badge tone="gray">{topic.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-white/55">{topic.angle}</p>
                  <p className="mt-2 font-mono text-xs text-white/40">
                    {topic.keywords.join(", ")}
                  </p>
                </div>
                <ActionButton
                  icon={<Zap size={16} />}
                  label="Draft"
                  onClick={() => onDraft(topic)}
                  tone="cyan"
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function PropertiesView({
  brands,
  content,
  contextDocs,
  onAddProperty,
  onDeleteDoc,
  onSelectProperty,
  onPublish,
  onSetTab,
  onSelectContent,
  onUpdateBrand,
  onUpdateDoc,
  onUpdateProperty,
  onUpsertDoc,
  properties,
  propertyTab,
  selectedPropertySlug,
}: {
  brands: BrandProfile[];
  content: ContentItem[];
  contextDocs: BrandContextDoc[];
  onAddProperty: (property: PropertyConfig) => void;
  onDeleteDoc: (id: string) => void;
  onPublish: (id: string) => void;
  onSelectProperty: (slug: PropertySlug) => void;
  onSelectContent: (id: string) => void;
  onSetTab: (tab: "profile" | "content" | "settings") => void;
  onUpdateBrand: (property: PropertySlug, patch: Partial<BrandProfile>) => void;
  onUpdateDoc: (doc: BrandContextDoc) => void;
  onUpdateProperty: (slug: PropertySlug, patch: Partial<PropertyConfig>) => void;
  onUpsertDoc: (doc: BrandContextDoc) => void;
  properties: PropertyConfig[];
  propertyTab: "profile" | "content" | "settings";
  selectedPropertySlug: PropertySlug;
}) {
  const [showAddProperty, setShowAddProperty] = useState(false);
  const selectedProperty =
    properties.find((property) => property.slug === selectedPropertySlug) ??
    properties[0];
  const brand = brands.find((entry) => entry.property === selectedProperty.slug);
  const docs = contextDocs
    .filter((doc) => doc.property === selectedProperty.slug)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const completeness = getProfileCompleteness(
    {
      ...initialState,
      properties,
      brands,
      contextDocs,
    },
    selectedProperty.slug,
  );
  const propertySections: {
    icon: ReactNode;
    label: string;
    tab: "profile" | "content" | "settings";
  }[] = [
    { icon: <FileText size={16} />, label: "Brand context", tab: "profile" },
    { icon: <ListChecks size={16} />, label: "Content", tab: "content" },
    { icon: <Settings size={16} />, label: "Publishing", tab: "settings" },
  ];

  function handleAddProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const domain = String(data.get("baseUrl") ?? "").trim();
    const slugBase = derivePropertySlug(domain || name);
    const existingSlugs = new Set(properties.map((property) => property.slug));
    let slug = slugBase;
    let suffix = 2;
    while (existingSlugs.has(slug)) {
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }
    if (!slug) return;
    onAddProperty({
      slug,
      name: name || domain || slug,
      domain,
      language: String(data.get("language")) === "Spanish" ? "Spanish" : "English",
      threshold: 75,
      active: true,
      imagesEnabled: false,
      revalidateUrl: "",
      revalidateSecret: "",
    });
    event.currentTarget.reset();
    onSelectProperty(slug);
    onSetTab("profile");
    setShowAddProperty(false);
  }

  async function handleUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    for (const file of files) {
      if (!file.name.endsWith(".md") && !file.name.endsWith(".txt")) {
        window.alert("Only .md and .txt files are accepted.");
        continue;
      }
      const text = await file.text();
      if (text.length > 50000) {
        window.alert(`${file.name} is over the 50k character limit.`);
        continue;
      }
      if (text.length > 40000) {
        window.alert(`${file.name} is close to the 50k character limit.`);
      }
      onUpsertDoc({
        id: makeId("doc"),
        property: selectedProperty.slug,
        title: file.name.replace(/\.(md|txt)$/i, ""),
        contentMd: text,
        source: "upload",
        active: true,
        sortOrder: docs.length,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Panel title="Properties">
          <div className="space-y-3">
            {properties.map((property) => {
              const propertyCompleteness = getProfileCompleteness(
                { ...initialState, properties, brands, contextDocs },
                property.slug,
              );
              const counts = getPropertyCounts(content, property.slug);
              return (
                <button
                  className={`w-full border p-3 text-left ${
                    property.slug === selectedProperty.slug
                      ? "border-emerald-300/35 bg-emerald-300/10"
                      : "border-white/10 bg-white/[0.025] hover:bg-white/[0.045]"
                  }`}
                  key={property.slug}
                  onClick={() => onSelectProperty(property.slug)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{property.name}</p>
                      <p className="text-sm text-white/55">{property.domain}</p>
                    </div>
                    <Badge tone={property.active ? "green" : "gray"}>
                      {property.active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-xs text-white/55">
                    <span>{counts.published} live</span>
                    <span>{counts.scheduled} sched</span>
                    <span>{counts.review} review</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                    <Badge tone={propertyCompleteness.complete ? "green" : "amber"}>
                      {propertyCompleteness.complete ? "Complete" : "Incomplete"}
                    </Badge>
                    <span className="text-white/40">
                      {getLastPublish(content, property.slug)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            {!showAddProperty ? (
              <button
                className="inline-flex w-full items-center justify-center gap-2 border border-emerald-300/35 bg-emerald-300/10 px-3 py-2.5 text-sm font-medium text-emerald-100 hover:bg-emerald-300/15"
                onClick={() => setShowAddProperty(true)}
                type="button"
              >
                <Globe2 size={16} />
                New property
              </button>
            ) : (
              <form className="space-y-3" onSubmit={handleAddProperty}>
                <Field label="Name">
                  <input className={fieldClass} name="name" />
                </Field>
                <Field label="Base URL">
                  <input className={fieldClass} name="baseUrl" placeholder="https://example.com" />
                </Field>
                <Field label="Language">
                  <select className={fieldClass} name="language">
                    <option>English</option>
                    <option>Spanish</option>
                  </select>
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    className="border border-emerald-300/40 bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#08100d]"
                    type="submit"
                  >
                    Create
                  </button>
                  <button
                    className="border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/[0.04]"
                    onClick={() => setShowAddProperty(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </Panel>
      </div>

      <Panel title={selectedProperty.domain}>
        <div className="mb-5 grid gap-2 sm:grid-cols-3">
          {propertySections.map((section) => (
            <button
              className={`flex items-center justify-center gap-2 border px-3 py-2.5 text-sm ${
                propertyTab === section.tab
                  ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                  : "border-white/10 text-white/60 hover:bg-white/[0.04]"
              }`}
              key={section.tab}
              onClick={() => onSetTab(section.tab)}
              type="button"
            >
              {section.icon}
              {section.label}
            </button>
          ))}
        </div>

        {propertyTab === "profile" && brand && (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Voice", !completeness.missing.includes("voice description")],
                ["Audience", !completeness.missing.includes("audience")],
                ["Pillar", !completeness.missing.includes("content pillar")],
                ["Doc/example", !completeness.missing.includes("context doc or style example")],
              ].map(([label, done]) => (
                <div className="border border-white/10 bg-white/[0.025] p-3" key={String(label)}>
                  <p className="text-sm font-medium">{label}</p>
                  <Badge tone={done ? "green" : "amber"}>{done ? "Done" : "Missing"}</Badge>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Field label="Voice description">
                <textarea
                  className={`${fieldClass} min-h-28`}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, { voice: event.target.value })
                  }
                  value={brand.voice}
                />
              </Field>
              <Field label="Audience">
                <textarea
                  className={`${fieldClass} min-h-28`}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, { audience: event.target.value })
                  }
                  value={brand.audience}
                />
              </Field>
              <Field label="Content pillars">
                <input
                  className={fieldClass}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, { pillars: event.target.value })
                  }
                  value={brand.pillars}
                />
              </Field>
              <Field label="Banned topics / claims">
                <input
                  className={fieldClass}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, { banned: event.target.value })
                  }
                  value={brand.banned}
                />
              </Field>
              <Field label="Default CTA">
                <input
                  className={fieldClass}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, { cta: event.target.value })
                  }
                  value={brand.cta}
                />
              </Field>
              <Field label="Style examples">
                <textarea
                  className={`${fieldClass} min-h-24`}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, {
                      styleExamples: event.target.value
                        .split("\n---\n")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                  value={(brand.styleExamples ?? []).join("\n---\n")}
                />
              </Field>
              <Field label="Visual style">
                <textarea
                  className={`${fieldClass} min-h-24`}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, {
                      visualStyleDescription: event.target.value,
                    })
                  }
                  placeholder="Photographic, editorial, abstract, no text in images..."
                  value={brand.visualStyleDescription ?? ""}
                />
              </Field>
              <Field label="Visual palette">
                <input
                  className={fieldClass}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, {
                      visualPalette: event.target.value,
                    })
                  }
                  placeholder="deep green, graphite, warm white"
                  value={brand.visualPalette ?? ""}
                />
              </Field>
              <Field label="Visual rules">
                <input
                  className={fieldClass}
                  onChange={(event) =>
                    onUpdateBrand(brand.property, {
                      visualRules: event.target.value,
                    })
                  }
                  placeholder="no text, no faces, photographic not illustrated"
                  value={brand.visualRules ?? ""}
                />
              </Field>
            </div>

            <div className="border border-white/10 bg-[#0d0f12] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-medium">Context documents</h3>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                  <Upload size={16} />
                  Upload .md/.txt
                  <input
                    accept=".md,.txt"
                    className="hidden"
                    multiple
                    onChange={(event) => void handleUpload(event.target.files)}
                    type="file"
                  />
                </label>
              </div>

              <button
                className="mt-3 border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100"
                onClick={() =>
                  onUpsertDoc({
                    id: makeId("doc"),
                    property: selectedProperty.slug,
                    title: "New context doc",
                    contentMd: "",
                    source: "written",
                    active: true,
                    sortOrder: docs.length,
                    createdAt: new Date().toISOString(),
                  })
                }
                type="button"
              >
                Write document
              </button>

              <div className="mt-4 space-y-3">
                {docs.map((doc, index) => (
                  <div className="border border-white/10 bg-white/[0.025] p-3" key={doc.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <input
                        className={`${fieldClass} sm:max-w-xs`}
                        onChange={(event) =>
                          onUpdateDoc({ ...doc, title: event.target.value })
                        }
                        value={doc.title}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="gray">{doc.source}</Badge>
                        <label className="flex items-center gap-2 text-sm text-white/65">
                          <input
                            checked={doc.active}
                            className="accent-emerald-300"
                            onChange={(event) =>
                              onUpdateDoc({ ...doc, active: event.target.checked })
                            }
                            type="checkbox"
                          />
                          Active
                        </label>
                        <button
                          className="text-sm text-white/55 hover:text-white"
                          onClick={() =>
                            onUpdateDoc({
                              ...doc,
                              sortOrder: Math.max(0, doc.sortOrder - 1),
                            })
                          }
                          type="button"
                        >
                          Up
                        </button>
                        <button
                          className="text-sm text-white/55 hover:text-white"
                          onClick={() => onUpdateDoc({ ...doc, sortOrder: index + 1 })}
                          type="button"
                        >
                          Down
                        </button>
                        <button
                          className="text-sm text-red-200 hover:text-red-100"
                          onClick={() => onDeleteDoc(doc.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <textarea
                      className={`${fieldClass} mt-3 min-h-40`}
                      onChange={(event) =>
                        onUpdateDoc({ ...doc, contentMd: event.target.value.slice(0, 50000) })
                      }
                      value={doc.contentMd}
                    />
                    <p className="mt-2 font-mono text-xs text-white/40">
                      {doc.contentMd.length.toLocaleString()} / 50,000 characters
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {propertyTab === "content" && (
          <ContentTable
            content={content.filter((item) => item.property === selectedProperty.slug)}
            onPublish={onPublish}
            onSelect={onSelectContent}
          />
        )}

        {propertyTab === "settings" && (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 border border-white/10 bg-white/[0.025] p-4 text-sm text-white/70">
              <span>
                <span className="block font-medium text-white">Hero images</span>
                <span className="text-white/45">
                  Optional after-QA image stage. Text publishing never waits on this.
                </span>
              </span>
              <input
                checked={Boolean(selectedProperty.imagesEnabled)}
                className="h-4 w-4 accent-cyan-300"
                onChange={(event) =>
                  onUpdateProperty(selectedProperty.slug, {
                    imagesEnabled: event.target.checked,
                  })
                }
                type="checkbox"
              />
            </label>
            <Field label="Auto-publish threshold">
              <input
                className={fieldClass}
                max={100}
                min={0}
                onChange={(event) =>
                  onUpdateProperty(selectedProperty.slug, {
                    threshold: Number(event.target.value),
                  })
                }
                type="number"
                value={selectedProperty.threshold}
              />
            </Field>
            <Field label="Revalidate URL">
              <input
                className={fieldClass}
                onChange={(event) =>
                  onUpdateProperty(selectedProperty.slug, {
                    revalidateUrl: event.target.value,
                  })
                }
                value={selectedProperty.revalidateUrl ?? ""}
              />
            </Field>
            <Field label="Revalidate secret">
              <input
                className={fieldClass}
                onChange={(event) =>
                  onUpdateProperty(selectedProperty.slug, {
                    revalidateSecret: event.target.value,
                  })
                }
                value={selectedProperty.revalidateSecret ?? ""}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                checked={selectedProperty.active}
                className="accent-emerald-300"
                onChange={(event) =>
                  onUpdateProperty(selectedProperty.slug, { active: event.target.checked })
                }
                type="checkbox"
              />
              Active property
            </label>
            <div className="border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-100">
              <p className="font-medium">Site checklist</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-cyan-100/80">
                <li>Serve `llms.txt`.</li>
                <li>Sitemap includes Engine-published URLs.</li>
                <li>Robots and bot protection do not block AI crawlers.</li>
              </ul>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function PerformanceView({
  content,
  days,
  gscConnected,
  metrics,
  onDaysChange,
  onPropertyChange,
  properties,
  selectedProperty,
}: {
  content: ContentItem[];
  days: 7 | 30 | 90;
  gscConnected: boolean;
  metrics: ContentMetricDaily[];
  onDaysChange: (days: 7 | 30 | 90) => void;
  onPropertyChange: (property: PropertySlug | "all") => void;
  properties: PropertyConfig[];
  selectedProperty: PropertySlug | "all";
}) {
  const scopedContent =
    selectedProperty === "all"
      ? content
      : content.filter((item) => item.property === selectedProperty);
  const scopedIds = new Set(scopedContent.map((item) => item.id));
  const scopedMetrics = metrics.filter((metric) => scopedIds.has(metric.contentItemId));
  const totalPageviews = scopedMetrics.reduce((sum, metric) => sum + metric.pageviews, 0);
  const totalClicks = scopedMetrics.reduce((sum, metric) => sum + (metric.gscClicks ?? 0), 0);
  const totalImpressions = scopedMetrics.reduce(
    (sum, metric) => sum + (metric.gscImpressions ?? 0),
    0,
  );
  const publishedCount = scopedContent.filter((item) => item.status === "published").length;
  const daily = aggregateDaily(scopedMetrics, days);
  const articleRows = scopedContent.map((item) => {
    const itemMetrics = scopedMetrics.filter((metric) => metric.contentItemId === item.id);
    return {
      item,
      pageviews: itemMetrics.reduce((sum, metric) => sum + metric.pageviews, 0),
      impressions: itemMetrics.reduce((sum, metric) => sum + (metric.gscImpressions ?? 0), 0),
      clicks: itemMetrics.reduce((sum, metric) => sum + (metric.gscClicks ?? 0), 0),
      position:
        itemMetrics.find((metric) => metric.gscAvgPosition !== undefined)?.gscAvgPosition ??
        null,
    };
  });

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <select
              className={fieldClass}
              onChange={(event) =>
                onPropertyChange(event.target.value as PropertySlug | "all")
              }
              value={selectedProperty}
            >
              <option value="all">All properties</option>
              {properties.map((property) => (
                <option key={property.slug} value={property.slug}>
                  {property.domain}
                </option>
              ))}
            </select>
            <select
              className={fieldClass}
              onChange={(event) => onDaysChange(Number(event.target.value) as 7 | 30 | 90)}
              value={days}
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          {!gscConnected && (
            <Badge tone="amber">Connect Search Console in Settings</Badge>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Panel>
          <MiniStat label="Pageviews" value={totalPageviews.toLocaleString()} />
        </Panel>
        <Panel>
          <MiniStat label="Published" value={publishedCount.toString()} />
        </Panel>
        <Panel>
          <MiniStat
            label="Avg / piece"
            value={publishedCount ? Math.round(totalPageviews / publishedCount).toString() : "0"}
          />
        </Panel>
        <Panel>
          <MiniStat label="Impressions" value={gscConnected ? totalImpressions.toString() : "-"} />
        </Panel>
        <Panel>
          <MiniStat label="Clicks" value={gscConnected ? totalClicks.toString() : "-"} />
        </Panel>
        <Panel>
          <MiniStat
            label="CTR"
            value={
              gscConnected && totalImpressions
                ? `${Math.round((totalClicks / totalImpressions) * 1000) / 10}%`
                : "-"
            }
          />
        </Panel>
      </div>

      <Panel title="Pageviews by day">
        {daily.length ? (
          <div className="flex h-48 items-end gap-2">
            {daily.map((day) => (
              <div className="flex flex-1 flex-col items-center gap-2" key={day.date}>
                <div
                  className="w-full bg-emerald-300/70"
                  style={{
                    height: `${Math.max(5, (day.pageviews / Math.max(...daily.map((d) => d.pageviews), 1)) * 170)}px`,
                  }}
                  title={`${day.date}: ${day.pageviews}`}
                />
                <span className="font-mono text-[10px] text-white/35">
                  {day.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<BarChart3 size={20} />} label="No pageviews yet" />
        )}
      </Panel>

      <Panel title="Articles">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="border-b border-white/10 text-white/45">
              <tr>
                <th className="py-3 pr-4 font-medium">Title</th>
                <th className="py-3 pr-4 font-medium">Published</th>
                <th className="py-3 pr-4 font-medium">Pageviews</th>
                <th className="py-3 pr-4 font-medium">Impressions</th>
                <th className="py-3 pr-4 font-medium">Clicks</th>
                <th className="py-3 pr-4 font-medium">Position</th>
              </tr>
            </thead>
            <tbody>
              {articleRows.map((row) => (
                <tr className="border-b border-white/10" key={row.item.id}>
                  <td className="py-3 pr-4 font-medium">{row.item.title}</td>
                  <td className="py-3 pr-4 text-white/60">
                    {formatDateTime(row.item.publishedAt)}
                  </td>
                  <td className="py-3 pr-4 font-mono">{row.pageviews}</td>
                  <td className="py-3 pr-4 font-mono">
                    {gscConnected ? row.impressions : "-"}
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    {gscConnected ? row.clicks : "-"}
                  </td>
                  <td className="py-3 pr-4 font-mono">
                    {gscConnected && row.position ? row.position : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function SettingsView({
  apiKeys,
  cron,
  gscConnected,
  models,
  onCronChange,
  onGenerateApiKey,
  onModelsChange,
  onReset,
  onRoutingRulesChange,
  onThresholdChange,
  properties,
  routingRules,
}: {
  apiKeys: EngineState["apiKeys"];
  cron: string;
  gscConnected: boolean;
  models: ModelRegistryEntry[];
  onCronChange: (cron: string) => void;
  onGenerateApiKey: () => void;
  onModelsChange: (models: ModelRegistryEntry[]) => void;
  onReset: () => void;
  onRoutingRulesChange: (routingRules: RoutingRule[]) => void;
  onThresholdChange: (property: PropertySlug, threshold: number) => void;
  properties: PropertyConfig[];
  routingRules: RoutingRule[];
}) {
  const estimatedCost = estimateArticleCost(models, routingRules);
  const hasQaRule = routingRules.some((rule) => rule.task === "qa");
  function updateModel(id: string, patch: Partial<ModelRegistryEntry>) {
    onModelsChange(
      models.map((model) => (model.id === id ? { ...model, ...patch } : model)),
    );
  }
  function addModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const provider = String(data.get("provider")) as ModelProvider;
    const modelId = String(data.get("modelId") ?? "").trim();
    if (!modelId) return;
    onModelsChange([
      ...models,
      {
        id: makeId("model"),
        provider,
        modelId,
        displayName: String(data.get("displayName") ?? "").trim() || modelId,
        capabilities: String(data.get("capability")) === "image_gen" ? ["image_gen"] : ["text"],
        qualityTier: String(data.get("tier")) as QualityTier,
        active: true,
      },
    ]);
    event.currentTarget.reset();
  }
  function addRoutingRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const primary = String(data.get("primary") ?? "");
    const fallback = String(data.get("fallback") ?? "");
    if (!primary) return;
    onRoutingRulesChange([
      ...routingRules,
      {
        id: makeId("rule"),
        task: String(data.get("task")) as RoutingTask,
        property: "all",
        contentType: "all",
        language: "all",
        modelChain: [primary, fallback].filter(Boolean),
        priority: Number(data.get("priority") ?? 0),
        active: true,
        notes: "Added from local Settings.",
      },
    ]);
    event.currentTarget.reset();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Models">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <MiniStat label="Registry" value={`${models.length} models`} />
            <MiniStat label="Rules" value={`${routingRules.length} active/available`} />
            <MiniStat label="Est. article" value={estimatedCost} />
          </div>
          <div className="space-y-2">
            {models.map((model) => (
              <div
                className="grid gap-3 border border-white/10 bg-white/[0.025] p-3 md:grid-cols-[1fr_auto]"
                key={model.id}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${fieldClass} max-w-xs`}
                      onChange={(event) =>
                        updateModel(model.id, { displayName: event.target.value })
                      }
                      value={model.displayName}
                    />
                    <Badge tone="gray">{model.provider}</Badge>
                    <Badge tone={providerConfigured(model.provider) ? "green" : "amber"}>
                      {providerConfigured(model.provider) ? "key ready" : "missing key"}
                    </Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs text-white/45">
                    {model.modelId} · {model.capabilities.join(", ")} · {model.qualityTier}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-white/65">
                  <input
                    checked={model.active}
                    className="accent-emerald-300"
                    onChange={(event) =>
                      updateModel(model.id, { active: event.target.checked })
                    }
                    type="checkbox"
                  />
                  Active
                </label>
              </div>
            ))}
          </div>
          <form className="grid gap-3 border border-white/10 bg-[#0d0f12] p-3 md:grid-cols-2" onSubmit={addModel}>
            <Field label="Display name">
              <input className={fieldClass} name="displayName" />
            </Field>
            <Field label="Model ID">
              <input className={fieldClass} name="modelId" />
            </Field>
            <Field label="Provider">
              <select className={fieldClass} name="provider">
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="replicate">Replicate</option>
              </select>
            </Field>
            <Field label="Capability">
              <select className={fieldClass} name="capability">
                <option value="text">Text</option>
                <option value="image_gen">Image generation</option>
              </select>
            </Field>
            <Field label="Tier">
              <select className={fieldClass} name="tier">
                <option value="standard">Standard</option>
                <option value="fast">Fast</option>
                <option value="premium">Premium</option>
              </select>
            </Field>
            <button
              className="self-end border border-emerald-300/40 bg-emerald-300 px-3 py-2.5 text-sm font-semibold text-[#08100d]"
              type="submit"
            >
              Add model
            </button>
          </form>
          <div className="border border-white/10 bg-[#0d0f12] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Cross-provider QA route</p>
                <p className="mt-1 text-sm text-white/50">
                  Drafts stay on today&apos;s default unless an active rule matches.
                </p>
              </div>
              <button
                className="border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={hasQaRule}
                onClick={() =>
                  onRoutingRulesChange([
                    ...routingRules,
                    makeRecommendedQaRule(models),
                  ])
                }
                type="button"
              >
                {hasQaRule ? "QA rule added" : "Add QA rule"}
              </button>
            </div>
          </div>
          <form className="grid gap-3 border border-white/10 bg-[#0d0f12] p-3 md:grid-cols-2" onSubmit={addRoutingRule}>
            <Field label="Task">
              <select className={fieldClass} name="task">
                {(["brief", "draft", "qa", "faq", "meta", "image_brief", "image_gen", "image_check"] as RoutingTask[]).map((task) => (
                  <option key={task} value={task}>
                    {task}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <input className={fieldClass} defaultValue={10} name="priority" type="number" />
            </Field>
            <Field label="Primary model">
              <select className={fieldClass} name="primary">
                <option value="">Choose model</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fallback model">
              <select className={fieldClass} name="fallback">
                <option value="">None</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="border border-cyan-300/35 bg-cyan-300/10 px-3 py-2.5 text-sm text-cyan-100 md:col-span-2"
              type="submit"
            >
              Add routing rule
            </button>
          </form>
          {routingRules.length > 0 && (
            <div className="space-y-2">
              {routingRules.map((rule) => (
                <div className="border border-white/10 bg-white/[0.025] p-3" key={rule.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium">{rule.task}</p>
                    <label className="flex items-center gap-2 text-sm text-white/65">
                      <input
                        checked={rule.active}
                        className="accent-emerald-300"
                        onChange={(event) =>
                          onRoutingRulesChange(
                            routingRules.map((entry) =>
                              entry.id === rule.id
                                ? { ...entry, active: event.target.checked }
                                : entry,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      {rule.active ? "Active" : "Inactive"}
                    </label>
                  </div>
                  <p className="mt-2 font-mono text-xs text-white/45">
                    {rule.modelChain
                      .map((id) => models.find((model) => model.id === id)?.displayName ?? id)
                      .join(" -> ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Publishing Gates">
        <div className="space-y-4">
          {properties.map((property) => (
            <div className="border border-white/10 bg-white/[0.025] p-4" key={property.slug}>
              <div className="flex items-center justify-between">
                <p className="font-medium">{property.domain}</p>
                <p className="font-mono text-sm text-emerald-200">
                  {property.threshold}
                </p>
              </div>
              <input
                className="mt-4 w-full accent-emerald-300"
                max={100}
                min={0}
                onChange={(event) =>
                  onThresholdChange(property.slug, Number(event.target.value))
                }
                type="range"
                value={property.threshold}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Schedules">
        <Field label="Cron">
          <input
            className={fieldClass}
            onChange={(event) => onCronChange(event.target.value)}
            value={cron}
          />
        </Field>
      </Panel>

      <Panel title="Search Console">
        <div className="space-y-3 text-sm text-white/65">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-white">Google Search Console</p>
            <Badge tone={gscConnected ? "green" : "amber"}>
              {gscConnected ? "Connected" : "Pageviews only"}
            </Badge>
          </div>
          <p>
            Add `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, and `GSC_REFRESH_TOKEN`
            when credentials are ready. Until then, Performance stays live with
            first-party pageviews.
          </p>
        </div>
      </Panel>

      <Panel title="API Keys">
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div className="flex items-center justify-between gap-3 border border-white/10 bg-white/[0.025] p-3" key={key.id}>
              <div>
                <p className="font-medium">{key.name}</p>
                <p className="font-mono text-xs text-white/45">
                  {key.scopes.join(", ")}
                </p>
              </div>
              <KeyRound size={17} className="text-white/45" />
            </div>
          ))}
          <ActionButton
            icon={<KeyRound size={16} />}
            label="Create key"
            onClick={onGenerateApiKey}
            tone="cyan"
          />
        </div>
      </Panel>

      <Panel title="Workspace">
        <ActionButton
          icon={<RotateCcw size={16} />}
          label="Reset demo data"
          onClick={onReset}
          tone="red"
        />
      </Panel>
    </div>
  );
}

function ContentTable({
  content,
  onPublish,
  onSelect,
}: {
  content: ContentItem[];
  onPublish: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="border-b border-white/10 text-white/45">
          <tr>
            <th className="py-3 pr-4 font-medium">Title</th>
            <th className="py-3 pr-4 font-medium">Property</th>
            <th className="py-3 pr-4 font-medium">Status</th>
            <th className="py-3 pr-4 font-medium">Score</th>
            <th className="py-3 pr-4 font-medium">Date</th>
            <th className="py-3 pr-4 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {content.map((item) => (
            <tr className="border-b border-white/10" key={item.id}>
              <td className="py-3 pr-4">
                <button
                  className="line-clamp-1 text-left font-medium hover:text-emerald-200"
                  onClick={() => onSelect(item.id)}
                  type="button"
                >
                  {item.title}
                </button>
              </td>
              <td className="py-3 pr-4 text-white/60">{propertyLabel(item.property)}</td>
              <td className="py-3 pr-4">
                <StatusBadge status={item.status} />
              </td>
              <td className="py-3 pr-4">
                <Score value={item.qualityScore} />
              </td>
              <td className="py-3 pr-4 text-white/60">
                {formatDateTime(item.publishAt || item.publishedAt || item.createdAt)}
              </td>
              <td className="py-3 pr-4">
                {item.status === "scheduled" ? (
                  <button
                    className="inline-flex items-center gap-1 text-emerald-200 hover:text-emerald-100"
                    onClick={() => onPublish(item.id)}
                    type="button"
                  >
                    <Play size={14} />
                    Publish
                  </button>
                ) : (
                  <span className="text-white/35">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentDetail({ item }: { item: ContentItem }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          <Score value={item.qualityScore} />
          <Badge tone="gray">{propertyLabel(item.property)}</Badge>
        </div>
        <h2 className="mt-3 text-xl font-semibold">{item.title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">{item.excerpt}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MiniStat label="Source" value={sourceLabel(item.source)} />
        <MiniStat
          label={item.status === "published" ? "Published" : "Publish date"}
          value={formatDateTime(item.publishedAt || item.publishAt)}
        />
        <MiniStat label="Meta title" value={item.metaTitle} />
        <MiniStat label="Keywords" value={item.keywords.join(", ") || "-"} />
        <MiniStat
          label="Brand alignment"
          value={
            item.evals.find((evalResult) => evalResult.name === "Brand alignment")
              ? `${item.evals.find((evalResult) => evalResult.name === "Brand alignment")?.score}`
              : "-"
          }
        />
        <MiniStat label="Context hash" value={item.contextHash ?? "-"} />
        <MiniStat label="OG title" value={item.socialMeta?.ogTitle ?? "-"} />
        <MiniStat label="Image" value={item.imageStatus ?? "off"} />
        <MiniStat label="Alt text" value={item.heroImageAlt ?? "-"} />
      </div>
      {(item.heroImageUrl || item.imageCheck) && (
        <div className="border border-white/10 bg-[#0d0f12] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase text-white/45">Hero image</p>
              <p className="mt-2 text-sm text-white/60">{item.imageCheck}</p>
            </div>
            <Badge
              tone={
                item.imageStatus === "generated"
                  ? "green"
                  : item.imageStatus === "failed"
                    ? "red"
                    : item.imageStatus === "queued"
                      ? "cyan"
                      : "gray"
              }
            >
              {item.imageStatus ?? "off"}
            </Badge>
          </div>
          {item.heroImageUrl && (
            <div className="mt-4 flex aspect-video items-center justify-center border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
              <div className="flex items-center gap-2 text-sm">
                <ImageIcon size={18} />
                {item.heroImageUrl}
              </div>
            </div>
          )}
        </div>
      )}
      {(item.servedModels ?? []).length > 0 && (
        <div className="border border-white/10 bg-[#0d0f12] p-4">
          <p className="font-mono text-xs uppercase text-white/45">Model calls</p>
          <div className="mt-3 grid gap-2">
            {(item.servedModels ?? []).map((call, index) => (
              <div
                className="flex flex-col gap-2 border border-white/10 bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between"
                key={`${call.task}-${index}`}
              >
                <div>
                  <p className="text-sm font-medium">{call.task}</p>
                  <p className="text-xs text-white/50">{call.detail}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="gray">{call.provider}</Badge>
                  <Badge tone={call.fallbackUsed ? "amber" : "green"}>
                    {call.displayName}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {item.evals.length > 0 && (
        <div className="border border-white/10 bg-[#0d0f12] p-4">
          <p className="font-mono text-xs uppercase text-white/45">QA gates</p>
          <div className="mt-3 grid gap-2">
            {item.evals.map((evalResult) => (
              <div
                className="flex flex-col gap-2 border border-white/10 bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between"
                key={evalResult.name}
              >
                <div>
                  <p className="text-sm font-medium">{evalResult.name}</p>
                  <p className="text-xs text-white/50">{evalResult.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  {evalResult.hard && <Badge tone="amber">HARD</Badge>}
                  <Badge tone={evalResult.passed ? "green" : "red"}>
                    {evalResult.passed ? "Pass" : "Fail"} {evalResult.score}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="border border-white/10 bg-[#0d0f12] p-4">
        <p className="font-mono text-xs uppercase text-white/45">Draft</p>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/70">
          {item.body}
        </div>
      </div>
    </div>
  );
}

function CompactContentRow({ item }: { item: ContentItem }) {
  return (
    <div className="border border-white/10 bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
        <StatusBadge status={item.status} />
      </div>
      <p className="mt-2 font-mono text-xs text-white/40">
        {formatDateTime(item.createdAt)}
      </p>
    </div>
  );
}

function Panel({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="border border-white/10 bg-[#15191e] p-4">
      {title && (
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/60">
          <PanelLeft size={15} />
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-wide text-white/45">
        {label}
      </span>
      {children}
    </label>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone: "green" | "cyan" | "red";
}) {
  const toneClass = {
    green: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15",
    cyan: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15",
    red: "border-red-300/35 bg-red-300/10 text-red-100 hover:bg-red-300/15",
  }[tone];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 border px-3 py-2 text-sm ${toneClass}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center border border-dashed border-white/15 bg-white/[0.02] text-white/45">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        {label}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.025] p-3">
      <p className="font-mono text-xs uppercase text-white/40">{label}</p>
      <p className="mt-2 line-clamp-2 text-sm text-white/75">{value || "-"}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ContentStatus }) {
  const tone =
    status === "published"
      ? "green"
      : status === "scheduled"
        ? "cyan"
        : status === "needs_review"
          ? "amber"
          : status === "failed" || status === "rejected"
            ? "red"
            : "gray";
  return <Badge tone={tone}>{statusLabel(status)}</Badge>;
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "cyan" | "amber" | "red" | "gray";
}) {
  const toneClass = {
    green: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    cyan: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
    amber: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    red: "border-red-300/30 bg-red-300/10 text-red-100",
    gray: "border-white/15 bg-white/[0.04] text-white/60",
  }[tone];
  return (
    <span className={`inline-flex items-center border px-2 py-1 font-mono text-xs ${toneClass}`}>
      {children}
    </span>
  );
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="font-mono text-xs text-white/35">-</span>;
  const color =
    value >= 80 ? "text-emerald-200" : value >= 70 ? "text-amber-200" : "text-red-200";
  return <span className={`font-mono text-xs ${color}`}>{value}</span>;
}

const fieldClass =
  "w-full border border-white/10 bg-[#0d0f12] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/45";

function normalizeState(saved: Partial<EngineState>): EngineState {
  const properties = (saved.properties?.length ? saved.properties : initialState.properties).map(
    (property) => ({ ...property, imagesEnabled: property.imagesEnabled ?? false }),
  );
  const brands = properties.map((property) => {
    const savedBrand = saved.brands?.find((brand) => brand.property === property.slug);
    const seedBrand = initialState.brands.find((brand) => brand.property === property.slug);
    return {
      property: property.slug,
      voice: savedBrand?.voice ?? seedBrand?.voice ?? "",
      audience: savedBrand?.audience ?? seedBrand?.audience ?? "",
      pillars: savedBrand?.pillars ?? seedBrand?.pillars ?? "",
      banned: savedBrand?.banned ?? seedBrand?.banned ?? "",
      cta: savedBrand?.cta ?? seedBrand?.cta ?? "",
      styleExamples: savedBrand?.styleExamples ?? seedBrand?.styleExamples ?? [],
      defaultCtas: savedBrand?.defaultCtas ?? seedBrand?.defaultCtas ?? [],
      visualStyleDescription:
        savedBrand?.visualStyleDescription ?? seedBrand?.visualStyleDescription ?? "",
      visualPalette: savedBrand?.visualPalette ?? seedBrand?.visualPalette ?? "",
      visualRules: savedBrand?.visualRules ?? seedBrand?.visualRules ?? "",
    };
  });

  return {
    properties,
    content: (saved.content ?? initialState.content).map((item) => ({
      ...item,
      imageStatus: item.imageStatus ?? "off",
      imageCheck: item.imageCheck ?? "Hero image generation is off for this property.",
      servedModels: item.servedModels ?? [],
    })),
    topics: saved.topics ?? initialState.topics,
    brands,
    contextDocs: saved.contextDocs ?? initialState.contextDocs,
    metrics: saved.metrics ?? initialState.metrics,
    models: saved.models ?? initialState.models,
    routingRules: saved.routingRules ?? initialState.routingRules,
    gscConnected: saved.gscConnected ?? false,
    cron: saved.cron ?? initialState.cron,
    apiKeys: saved.apiKeys ?? initialState.apiKeys,
  };
}

function getProfileCompleteness(state: EngineState, property: PropertySlug) {
  const brand = state.brands.find((entry) => entry.property === property);
  const activeDoc = state.contextDocs.some(
    (doc) => doc.property === property && doc.active && doc.contentMd.trim(),
  );
  const hasStyleExample = (brand?.styleExamples ?? []).some((example) => example.trim());
  const missing: string[] = [];

  if (!brand?.voice.trim()) missing.push("voice description");
  if (!brand?.audience.trim()) missing.push("audience");
  if (!parseList(brand?.pillars ?? "").length) missing.push("content pillar");
  if (!activeDoc && !hasStyleExample) missing.push("context doc or style example");

  return { complete: missing.length === 0, missing };
}

function getVisualProfileCompleteness(state: EngineState, property: PropertySlug) {
  const brand = state.brands.find((entry) => entry.property === property);
  const missing: string[] = [];
  if (!brand?.visualStyleDescription?.trim()) {
    missing.push("visual style description");
  }
  return { complete: missing.length === 0, missing };
}

function collectServedModels(
  state: EngineState,
  item: ContentItem,
  language: PropertyConfig["language"],
  includeImage: boolean,
): ModelCallLog[] {
  const tasks: RoutingTask[] = includeImage
    ? ["brief", "draft", "qa", "image_brief", "image_gen", "image_check"]
    : ["brief", "draft", "qa"];
  return tasks.map((task) =>
    resolveServedModel(state, {
      task,
      property: item.property,
      contentType: item.contentType,
      language,
    }),
  );
}

function resolveServedModel(
  state: EngineState,
  context: {
    task: RoutingTask;
    property: PropertySlug;
    contentType: ContentItem["contentType"];
    language: PropertyConfig["language"];
  },
): ModelCallLog {
  const defaultModel =
    state.models.find((model) => model.id === "model_claude_sonnet") ?? state.models[0];
  const rule = state.routingRules
    .filter((candidate) => candidate.active)
    .filter((candidate) => candidate.task === context.task)
    .filter((candidate) => candidate.property === "all" || candidate.property === context.property)
    .filter(
      (candidate) =>
        candidate.contentType === "all" || candidate.contentType === context.contentType,
    )
    .filter((candidate) => candidate.language === "all" || candidate.language === context.language)
    .sort((a, b) => b.priority - a.priority)[0];
  const chain = rule?.modelChain.length ? rule.modelChain : [defaultModel?.id ?? ""];

  for (const [index, modelId] of chain.entries()) {
    const model = state.models.find((entry) => entry.id === modelId);
    if (!model || !model.active) continue;
    if (!providerConfigured(model.provider)) {
      if (index < chain.length - 1) continue;
      return {
        task: context.task,
        modelId: defaultModel?.modelId ?? "prompt-template-default",
        provider: defaultModel?.provider ?? "anthropic",
        displayName: defaultModel?.displayName ?? "Prompt template default",
        fallbackUsed: true,
        status: "config_error",
        detail: `${model.provider} key missing; fell back to today's default.`,
      };
    }
    return {
      task: context.task,
      modelId: model.modelId,
      provider: model.provider,
      displayName: model.displayName,
      fallbackUsed: index > 0,
      status: "served",
      detail: rule
        ? `Matched routing rule ${rule.id}.`
        : "No routing rule matched; used prompt template default.",
    };
  }

  return {
    task: context.task,
    modelId: defaultModel?.modelId ?? "prompt-template-default",
    provider: defaultModel?.provider ?? "anthropic",
    displayName: defaultModel?.displayName ?? "Prompt template default",
    fallbackUsed: true,
    status: "fallback",
    detail: "Routing chain exhausted; used today's default.",
  };
}

function buildHeroImagePatch(
  item: ContentItem,
  brand?: BrandProfile,
): Partial<ContentItem> {
  if (!brand?.visualStyleDescription?.trim()) {
    return {
      imageStatus: "skipped",
      imageCheck: "visual_profile_incomplete: visual style description required.",
    };
  }

  const slug = slugifyTitle(item.title);
  const heroImageUrl = `/hero-images/${item.property}/${slug}.png`;
  const heroImageAlt = makeAltText(item.title, brand.visualStyleDescription);
  return {
    heroImageUrl,
    heroImageAlt,
    imageStatus: "generated",
    imageCheck:
      "Image brief generated, mock image attached, and image-check passed in local mode.",
    socialMeta: {
      ...(item.socialMeta ?? {
        ogTitle: item.title.slice(0, 60),
        ogDescription: item.metaDescription,
        ogType: "article" as const,
      }),
      ogImage: heroImageUrl,
    },
  };
}

function providerConfigured(provider: ModelProvider) {
  return provider === "anthropic";
}

function makeRecommendedQaRule(models: ModelRegistryEntry[]): RoutingRule {
  const openAi = models.find((model) => model.provider === "openai" && model.capabilities.includes("text"));
  const fallback = models.find((model) => model.provider === "anthropic" && model.capabilities.includes("text"));
  return {
    id: makeId("rule"),
    task: "qa",
    property: "all",
    contentType: "all",
    language: "all",
    modelChain: [openAi?.id, fallback?.id].filter(Boolean) as string[],
    priority: 50,
    active: true,
    notes: "Recommended cross-provider QA. Falls back to default if OpenAI is unconfigured.",
  };
}

function estimateArticleCost(models: ModelRegistryEntry[], routingRules: RoutingRule[]) {
  const routedIds = new Set(routingRules.flatMap((rule) => rule.modelChain));
  const relevant = models.filter((model) => routedIds.has(model.id));
  const textCost = relevant.reduce(
    (sum, model) => sum + (model.costInputPerMtok ?? 0) + (model.costOutputPerMtok ?? 0),
    0,
  );
  const imageCost = relevant.reduce((sum, model) => sum + (model.costPerImage ?? 0), 0);
  const total = textCost + imageCost;
  return total ? `$${total.toFixed(4)}` : "not priced";
}

function makeAltText(title: string, visualStyle: string) {
  const text = `${title}, shown in ${visualStyle.toLowerCase()}`.replace(/\s+/g, " ");
  return text.length <= 125 ? text : `${text.slice(0, 122).trimEnd()}...`;
}

function assembleBrandContext(state: EngineState, property: PropertySlug) {
  const propertyConfig = state.properties.find((entry) => entry.slug === property);
  const brand = state.brands.find((entry) => entry.property === property);
  const docs = state.contextDocs
    .filter((doc) => doc.property === property && doc.active && doc.contentMd.trim())
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return [
    `PROPERTY: ${propertyConfig?.name ?? property}`,
    `BASE_URL: ${propertyConfig?.domain ?? property}`,
    `LANGUAGE: ${propertyConfig?.language ?? "English"}`,
    `VOICE: ${brand?.voice ?? ""}`,
    `AUDIENCE: ${brand?.audience ?? ""}`,
    `CONTENT_PILLARS: ${parseList(brand?.pillars ?? "").join("; ")}`,
    `BANNED_TOPICS_OR_CLAIMS: ${parseList(brand?.banned ?? "").join("; ")}`,
    `DEFAULT_CTAS: ${(brand?.defaultCtas ?? [])
      .map((cta) => `${cta.name} <${cta.url}>`)
      .join("; ") || brand?.cta || ""}`,
    `STYLE_EXAMPLES:\n${(brand?.styleExamples ?? []).join("\n---\n")}`,
    `CONTEXT_DOCS:\n${docs
      .map((doc) => `## ${doc.title}\n${doc.contentMd}`)
      .join("\n\n---\n\n")}`,
  ].join("\n\n");
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ctx_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseKeywords(value: string) {
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function parseList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function makeTitle(prompt: string, language = "English") {
  const words = prompt
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .join(" ");
  if (language === "Spanish") return words || "Nueva reflexion editorial";
  return words || "New editorial brief";
}

function makeExcerpt(prompt: string, language = "English") {
  if (language === "Spanish") {
    return `Una pieza generada sobre ${prompt.toLowerCase().slice(0, 96)}.`;
  }
  return `A generated article about ${prompt.toLowerCase().slice(0, 100)}.`;
}

function makeMetaDescription(excerpt: string, primaryKeyword: string, language = "English") {
  const seed =
    language === "Spanish"
      ? `${primaryKeyword} explicado con claridad para conectar contexto, criterio humano y proximos pasos practicos.`
      : `${primaryKeyword} explained clearly with brand context, practical operator judgment, and next steps for readers.`;
  const combined = `${excerpt.replace(/\s+/g, " ")} ${seed}`.trim();
  if (combined.length >= 120 && combined.length <= 155) return combined;
  if (combined.length > 155) return combined.slice(0, 152).trimEnd() + "...";
  return `${combined} ${language === "Spanish" ? "Incluye una respuesta directa, estructura FAQ y recomendaciones accionables." : "Includes a direct answer, FAQ structure, and actionable recommendations."}`.slice(0, 155);
}

function extractContextPhrase(context: string) {
  const phraseMatch = context.match(/Distinctive positioning phrase:\s*([^\n.]+)/i);
  if (phraseMatch?.[1]) return phraseMatch[1].trim();
  const docLine = context
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 30 && !line.includes(":"));
  return docLine ?? "the property's documented positioning";
}

function makeBody(
  title: string,
  prompt: string,
  language = "English",
  context = "",
  primaryKeyword = title.split(" ").slice(0, 2).join(" "),
) {
  const phrase = extractContextPhrase(context);
  if (language === "Spanish") {
    return `# ${title}\n\n${primaryKeyword} aborda ${prompt.toLowerCase().slice(0, 90)} con una respuesta clara: la tecnologia debe servir al criterio humano, no reemplazarlo. Esta pieza se apoya en ${phrase} para mantener coherencia con la marca y orientar al lector desde el primer parrafo.\n\n## Por que importa ${primaryKeyword}\n\nEl tema importa porque conecta una necesidad practica con una postura humanista. La pieza mantiene parrafos breves, lenguaje directo y una conclusion accionable sin promesas excesivas.\n\n## Pasos recomendados\n\n1. Define la pregunta humana antes de elegir la herramienta.\n2. Conecta la idea con una experiencia concreta del lector.\n3. Cierra con una invitacion clara a seguir explorando.\n\n## Que debe recordar el lector?\n\nDebe recordar que ${primaryKeyword} funciona mejor cuando el contexto, el lenguaje y la intencion son consistentes.\n\n## Como se evita la exageracion?\n\nSe evita usando afirmaciones prudentes, ejemplos verificables y una voz que no promete resultados garantizados.\n\n## Cuando conviene revisar esta pieza?\n\nConviene revisarla si aparece una afirmacion medica, terapeutica o tecnica que requiera evidencia adicional.`;
  }
  return `# ${title}\n\n${primaryKeyword} answers ${prompt.toLowerCase().slice(0, 90)} with a practical point: content works best when it becomes an operating system, not a one-off asset. This draft uses ${phrase} so the piece stays grounded in the property's documented positioning from the first paragraph.\n\n## Why ${primaryKeyword} matters\n\nThe topic matters because operators need reusable systems, not more scattered publishing tasks. The article keeps the argument specific, avoids inflated claims, and gives readers a clear next action.\n\n## Practical sequence\n\n1. Identify the reader's immediate decision.\n2. Connect the idea to a repeatable operating habit.\n3. Close with one focused action instead of several competing asks.\n\n## What should the reader remember?\n\nThe reader should remember that ${primaryKeyword} improves when brand context, audience needs, and publication structure stay connected.\n\n## How does this avoid generic advice?\n\nIt anchors the article in the property's context docs, uses the approved terminology, and avoids claims that the brand has banned.\n\n## When should this go to review?\n\nIt should go to review when the draft makes unsupported claims, contradicts positioning, or misses the required answer-first and FAQ structure.`;
}

function buildEvals({
  context,
  hardFail,
  item,
  language,
  score,
}: {
  context: string;
  hardFail: boolean;
  item: ContentItem;
  language: string;
  score: number;
}): EvalResult[] {
  const primaryKeyword = estimatePrimaryKeyword(item);
  const slug = slugifyTitle(item.title);
  const body = item.body;
  const headings = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s/.test(line));
  const h1Count = headings.filter((heading) => heading.startsWith("# ")).length;
  const skippedHeading = headings.some((heading, index) => {
    if (index === 0) return false;
    return headingLevel(heading) - headingLevel(headings[index - 1]) > 1;
  });
  const firstParagraph = firstBodyParagraph(body);
  const jsonLd = makeJsonLd(item, slug);
  const jsonLdValid = validateJsonLd(jsonLd);
  const hasFaq = headings.filter((heading) => /^#{2,3}\s.+\?/.test(heading)).length >= 3;
  const hasAnswerFirst = wordCount(firstParagraph) <= 60 && firstParagraph.length > 40;
  const metaOk =
    item.metaTitle.length > 0 &&
    item.metaTitle.length <= 60 &&
    item.metaDescription.length >= 120 &&
    item.metaDescription.length <= 155 &&
    includesKeyword(item.metaTitle, primaryKeyword) &&
    includesKeyword(item.metaDescription, primaryKeyword);
  const slugOk =
    slug.split("-").length <= 6 &&
    slug === slug.toLowerCase() &&
    slug.includes(slugifyTitle(primaryKeyword));
  const keywordPlacement =
    includesKeyword(headings[0] ?? "", primaryKeyword) &&
    includesKeyword(body.split(/\s+/).slice(0, 100).join(" "), primaryKeyword) &&
    headings.some((heading) => heading.startsWith("## ") && includesKeyword(heading, primaryKeyword));
  const hasList = /^\s*(\d+\.|-)\s+/m.test(body);
  const shortParagraphs = body
    .split(/\n\n+/)
    .filter((paragraph) => paragraph && !paragraph.startsWith("#"))
    .every((paragraph) => paragraph.split(/[.!?]+/).filter(Boolean).length <= 4);

  return [
    {
      name: "Brand alignment",
      score: hardFail ? 58 : Math.min(96, score + 7),
      passed: !hardFail && context.trim().length > 0,
      detail: hardFail
        ? "Manual review requested; alignment must be checked against the assembled context."
        : "Voice, audience, terminology, and context docs are represented.",
      hard: true,
      category: "brand",
    },
    {
      name: "SEO heading hierarchy",
      score: h1Count === 1 && !skippedHeading ? 95 : 45,
      passed: h1Count === 1 && !skippedHeading,
      detail: "Exactly one H1 and no skipped H2/H3 levels.",
      hard: true,
      category: "seo",
    },
    {
      name: "SEO metadata",
      score: metaOk ? 92 : 48,
      passed: metaOk,
      detail: "Meta title and description fit length rules and include the primary keyword.",
      hard: true,
      category: "seo",
    },
    {
      name: "SEO slug",
      score: slugOk ? 91 : 50,
      passed: slugOk,
      detail: `Slug candidate: ${slug}`,
      hard: true,
      category: "seo",
    },
    {
      name: "AEO answer-first",
      score: hasAnswerFirst ? 93 : 44,
      passed: hasAnswerFirst,
      detail: "First paragraph after the H1 directly answers the query in 60 words or fewer.",
      hard: true,
      category: "aeo",
    },
    {
      name: "AEO FAQ block",
      score: hasFaq ? 90 : 42,
      passed: hasFaq,
      detail: "Includes 3-5 question-phrased H2/H3 headings with standalone answers.",
      hard: true,
      category: "aeo",
    },
    {
      name: "AEO JSON-LD",
      score: jsonLdValid ? 94 : 40,
      passed: jsonLdValid,
      detail: "Article and FAQPage schema parse and include required fields.",
      hard: true,
      category: "aeo",
    },
    {
      name: "Keyword placement",
      score: keywordPlacement ? 86 : 70,
      passed: keywordPlacement,
      detail: "Primary keyword appears in H1, first 100 words, and at least one H2.",
      category: "seo",
    },
    {
      name: "Internal link suggestions",
      score: 74,
      passed: true,
      detail: "Review should add at least two same-property links when confident matches exist.",
      category: "seo",
    },
    {
      name: "Readability",
      score: shortParagraphs ? 88 : 68,
      passed: shortParagraphs,
      detail: "Paragraphs are short and scannable.",
      category: "quality",
    },
    {
      name: "Extractable list",
      score: hasList ? 86 : 66,
      passed: hasList,
      detail: "Includes at least one list or step sequence where useful.",
      category: "aeo",
    },
    {
      name: "Language",
      score: Math.min(97, score + 8),
      passed: true,
      detail: language === "Spanish" ? "Spanish output." : "English output.",
      category: "quality",
    },
  ];
}

function getPropertyCounts(content: ContentItem[], property: PropertySlug) {
  const scoped = content.filter((item) => item.property === property);
  return {
    published: scoped.filter((item) => item.status === "published").length,
    scheduled: scoped.filter((item) => item.status === "scheduled").length,
    review: scoped.filter((item) => item.status === "needs_review").length,
  };
}

function getLastPublish(content: ContentItem[], property: PropertySlug) {
  const latest = content
    .filter((item) => item.property === property && item.publishedAt)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
  return latest ? `Last ${formatDateTime(latest.publishedAt)}` : "No publishes";
}

function aggregateDaily(metrics: ContentMetricDaily[], days: 7 | 30 | 90) {
  const today = new Date("2026-07-14T12:00:00.000Z");
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - 1 - offset));
    const key = date.toISOString().slice(0, 10);
    const dayMetrics = metrics.filter((metric) => metric.date === key);
    return {
      date: key,
      pageviews: dayMetrics.reduce((sum, metric) => sum + metric.pageviews, 0),
      clicks: dayMetrics.reduce((sum, metric) => sum + (metric.gscClicks ?? 0), 0),
    };
  });
}

function estimatePrimaryKeyword(item: ContentItem) {
  return item.keywords[0] ?? item.title.split(/\s+/).slice(0, 2).join(" ");
}

function slugifyTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-");
}

function derivePropertySlug(value: string) {
  const withoutProtocol = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const host = withoutProtocol.split("/")[0]?.replace(/\.[a-z]{2,}$/i, "") ?? value;
  return host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function headingLevel(heading: string) {
  return heading.match(/^#+/)?.[0].length ?? 1;
}

function firstBodyParagraph(body: string) {
  return body
    .split(/\n\n+/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#")) ?? "";
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function includesKeyword(value: string, keyword: string) {
  if (!keyword.trim()) return true;
  return value.toLowerCase().includes(keyword.toLowerCase());
}

function makeJsonLd(item: ContentItem, slug: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: item.title,
        description: item.metaDescription,
        datePublished: item.publishedAt || item.createdAt,
        dateModified: new Date("2026-07-14T12:00:00.000Z").toISOString(),
        mainEntityOfPage: `/${slug}`,
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What should the reader remember?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The article gives a direct answer grounded in the property's brand context.",
            },
          },
        ],
      },
    ],
  });
}

function validateJsonLd(json: string) {
  try {
    const parsed = JSON.parse(json) as {
      "@context"?: string;
      "@graph"?: Array<Record<string, unknown>>;
    };
    const graph = parsed["@graph"] ?? [];
    const article = graph.find((entry) => entry["@type"] === "Article");
    const faq = graph.find((entry) => entry["@type"] === "FAQPage");
    return Boolean(
      parsed["@context"] &&
        article?.headline &&
        article?.datePublished &&
        article?.dateModified &&
        faq?.mainEntity,
    );
  } catch {
    return false;
  }
}

function countByStatus(content: ContentItem[], status: ContentStatus) {
  return content.filter((item) => item.status === status).length.toString();
}

function averageScore(content: ContentItem[]) {
  const scores = content
    .map((item) => item.qualityScore)
    .filter((score): score is number => score !== null);
  if (scores.length === 0) return "-";
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length).toString();
}

function propertyLabel(property: PropertySlug) {
  if (property === "herzenco") return "herzenco.co";
  if (property === "humanismo-evolutivo") return "humanismoevolutivo.com";
  return property;
}

function sourceLabel(source: ContentSource) {
  return source.replace("_", " ");
}

function statusLabel(status: ContentStatus) {
  const labels: Record<ContentStatus, string> = {
    drafting: "Drafting",
    qa: "QA",
    needs_review: "Review",
    scheduled: "Scheduled",
    published: "Published",
    rejected: "Rejected",
    failed: "Failed",
  };
  return labels[status];
}

function activeViewLabel(view: View) {
  return navItems.find((item) => item.view === view)?.label ?? "Workspace";
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    quick: "Generate content",
    overview: "Pipeline overview",
    properties: "Properties",
    review: "Quality review",
    performance: "Performance",
    calendar: "Publishing calendar",
    topics: "Topic backlog",
    settings: "Engine settings",
  };
  return titles[view];
}

function calendarTime(item: ContentItem) {
  return new Date(item.publishAt || item.publishedAt || item.createdAt).getTime();
}

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}
