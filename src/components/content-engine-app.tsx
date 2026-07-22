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
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { humanizeCode, humanizeEval, primaryReviewReason } from "@/lib/humanize";
import {
  defaultContentTypeForProperty,
  isContentTypeAllowedForProperty,
  normalizeContentTypeForProperty,
  type PropertySurface,
} from "@/lib/property-content-types";

type View = "home" | "content" | "properties" | "settings";
type ContentMode = "list" | "calendar" | "ideas";

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
type ContentSource = "quick_generate" | "api" | "schedule" | "repurpose" | "autopilot";
type ModelProvider = "anthropic" | "openai" | "google" | "replicate";
type ModelCapability = "text" | "image_gen" | "vision";
type QualityTier = "fast" | "standard" | "premium";
type RoutingTask =
  | "brief"
  | "draft"
  | "qa"
  | "faq"
  | "meta"
  | "autopilot_prompt"
  | "image_brief"
  | "image_gen"
  | "image_check";
type AutopilotCadence = "daily" | "weekly" | "biweekly" | "monthly" | "custom";

interface PropertyConfig {
  slug: PropertySlug;
  name: string;
  domain: string;
  surface: PropertySurface;
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

interface AutopilotSetting {
  property: PropertySlug;
  enabled: boolean;
  cadence: AutopilotCadence;
  customCron: string;
  piecesPerCycle: number;
  publishTime: string;
  publishDays: string[];
  contentType: ContentItem["contentType"];
  maxQueued: number;
  backlogPriorityThreshold: number;
  lastRunAt?: string;
  nextRunAt?: string;
}

interface AutopilotWarning {
  id: string;
  property: PropertySlug;
  code:
    | "autopilot_skipped_queue_full"
    | "brand_profile_incomplete"
    | "autopilot_skipped_duplicate";
  detail: string;
  createdAt: string;
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
  autopilotSettings: AutopilotSetting[];
  autopilotWarnings: AutopilotWarning[];
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

const weekDays = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

const navItems: {
  view: View;
  label: string;
  icon: ReactNode;
}[] = [
  { view: "home", label: "Home", icon: <Gauge size={17} /> },
  { view: "content", label: "Content", icon: <FileText size={17} /> },
  { view: "properties", label: "Properties", icon: <Globe2 size={17} /> },
];

const herzenVoiceGuide = `# Herzen Co. — Content, Voice & Messaging Guide

## Brand architecture
Herzen Co. is a holding company and routing layer for two operating brands. It does not sell directly to end customers. Always identify which brand is speaking.

- Herzen Co.: the calm, credible, minimal corporate parent. Tagline: “Building and Scaling Digital Ventures.” Route visitors toward the relevant operating brand.
- Xyren: a productized website conversion system for consultation-led service businesses. It is not custom web design. It turns traffic into qualified, booked appointments through clear positioning, intent-to-action structure, lead capture and filtering, automated booking, and bad-lead screening. Typical launch window: 5–10 days.
- Xelerate: subscription-based fractional product leadership for founders and digital teams needing ongoing product strategy, execution oversight, systems thinking, and operational leverage without a full-time hire.

## Voice
Be direct, concise, specific, systems-minded, and clear. Say the thing without preamble. Remove adjectives that do not carry weight. Never fake certainty or manufacture urgency. Confidence must come from mechanisms, evidence, and specificity. Prefer plain words over jargon and understanding over cleverness. Name the buyer, pain, mechanism, and outcome.

Adjust the tone by brand:
- Herzen Co.: corporate-parent, credible, minimal, and oriented toward routing.
- Xyren: practical, confident, benefit-first, and written for service-business owners whose sites do not produce qualified appointments.
- Xelerate: strategic, senior, calm, and advisory rather than vendor-like.

## Positioning and messages
Herzen Co. builds and scales digital ventures. A useful two-door frame is: “Need a website conversion system?” → Xyren. “Need product leadership?” → Xelerate.

For Xyren, preserve these anchors: not custom web design; systems over pages; qualified booked appointments; 5–10 day launch; intent → action; bad-lead filtering; automation where it creates leverage. Primary CTA: “Get your free project plan.”

For Xelerate, preserve these anchors: product leadership without the full-time hire; ongoing strategy plus execution oversight; systems thinking and operational leverage; subscription engagement; evidence and measurable case studies before the call. Primary CTA: “Book a free 20-minute call.” Do not publish pricing unless it is verified as current.

## Topics
Xyren: why service-business websites fail to convert; lead qualification and screening; booking automation; launch speed and custom-build bloat; positioning; intent-to-action structure; industry-specific content for plumbers, roofers, lawyers, consultants, and other consultation-led services. Every article needs a relevant lead-capture path.

Xelerate: fractional versus full-time product leadership; product strategy and execution; systems thinking and operational leverage; reducing time-to-launch; execution oversight; outcome-driven case studies.

Herzen Co.: concise venture-building and scaling narratives plus clear brand descriptions that route visitors to Xyren or Xelerate. AI-orchestrated, brand-governed production systems may be used as a thought-leadership theme when appropriate.

## Formats
Use intent-to-action website copy, clustered blog series, email and newsletters, one-pagers, industry pages, measurable case studies, LinkedIn-forward social repurposing, and template-driven short-form video.

## Guardrails
Do name the ICP, lead with outcomes, place the strongest relevant CTA early, handle objections, support claims with evidence, and keep one idea per sentence.

Do not call Xyren “web design” or reduce it to pages. Avoid generic agency copy, unsupported metrics, manufactured urgency, adjective walls, jargon, and content without a lead-capture path. Keep adjacent client work—including retail-media, LiveRamp, audience-data, and SAM material—out of brand content unless deliberately approved as a case study.

## Source status
This guide was compiled July 21, 2026 from project strategy documents and May 2026 audits. The live sites were unavailable during compilation. Verify current site copy, pricing, offers, blog titles, testimonials, and performance claims before presenting them as current facts.`;

const herzenSocialStrategyGuide = `# Herzen Co. — LinkedIn Content Strategy

## Purpose
Generate founder-facing LinkedIn posts that Lupe can review, lightly edit, and queue for posting. This guide is the source of truth for positioning, tone, ICP, pain points, constraints, emphasis, and exclusions.

## Brand direction and offer priority
Herzen Co. is the only public-facing brand. Xyren and Xelerate are likely retired and must never be mentioned. Lead commercially with project management for digital teams, followed by fractional product leadership, then product strategy and execution. Build, website, and development work may remain commercially real but must stay in the background unless explicitly requested. The public impression must be an embedded project-management and product-leadership partner, never a dev shop.

## Ideal client
Write directly to founders at funded startups and established founder-led companies with digital products, especially non-technical founders navigating product and engineering complexity. The reader should feel: “This person gets the chaos I’m dealing with” and “I need this person inside my team.”

## Positioning and value
Position Herzen Co. as an embedded operator who personally leads the work and owns execution from inside the team, not a traditional consultant observing from outside. Execution is the core value being bought. Clarity, accountability, alignment, and speed support execution but do not replace it. Keep the translator role between stakeholders and engineering implicit.

## Core pain stack
1. Teams keep shipping chaos instead of progress.
2. What stakeholders want and what developers build keep drifting apart.
3. Nobody owns the digital work.
4. Priorities keep changing and nothing lands.
5. Founders are forced to translate between business and technical teams.
6. Output happens without meaningful business progress.
7. Execution problems get misdiagnosed as developer problems.

## Content model
Open with a real, specific founder problem. Clarify why it happens. Diagnose or reframe it. Offer a practical fix, lens, operating principle, or takeaway. End cleanly without manufactured inspiration. The preferred underlying model is: founder with a recognizable problem, followed by a usable solution.

Vary posts across pain and diagnosis, execution lessons, founder reframes, operating principles, team dysfunction observations, and practical how-we-think posts. Test angles and iterate from performance rather than treating one message as permanently correct.

## Format mix and creative direction
Use this target mix across batches and the content calendar:
- Carousels or document posts: approximately 45%. This is the primary format for saves and dwell time. Use a real hook on slide one, one idea per slide, a coherent progression, and a clear takeaway or question at the end.
- Image posts with strong copy: approximately 30%. Use a custom, relevant image concept and let the written post carry a specific operator insight. Avoid decorative stock-style concepts.
- Polls: approximately 10%. Ask genuine, open-ended questions that surface how founders and teams actually operate. Never use engagement bait or false binary choices.
- Text-only thought leadership: approximately 15%. Use a sharp first line, short skimmable paragraphs, and one practical point.

Video and LinkedIn Live are out of scope. Carousels and image posts carry the keep-people-on-platform work, so prioritize their creative quality. Prioritize launching a LinkedIn Page newsletter because each issue can notify subscribers and works entirely through text and images.

## Publishing and engagement
Target 3–5 posts per week, with Tuesday through Thursday mornings as the preferred starting window. Employee advocacy is the strongest distribution lever. Comments matter more than likes, so end with a useful question when it fits and reply to substantive comments within the first hour. Put external links in the first comment rather than the post body. Use zero hashtags by default and no more than three when they are genuinely useful or explicitly requested.

## Voice
Conversational, confident, human, practical, lightly opinionated, credible, direct, and useful. Sound hands-dirty and embedded in the work. Use mostly “we,” while allowing “I” when it adds ownership, conviction, or credibility. Make it implicitly clear that Herzen personally leads the work. Prefer plain language to jargon and practical specificity to abstraction.

## Hard constraints
- No emojis.
- Default to no hashtags; use no more than three when strategically useful or explicitly requested.
- No em dashes.
- No cheesy hooks, fake storytelling, fluff, or vague inspiration.
- No “hot take” framing unless genuinely earned.
- No corporate, consultant, dev-shop, or generic productivity-creator tone.
- No excessive formatting tricks.
- Never mention Xyren or Xelerate.
- Never invent claims, metrics, client stories, or credentials.
- Keep build, development, and site work in the background unless explicitly requested.
- Keep paragraphs readable and natural.

## Output contract
Default to one 150–300 word LinkedIn post unless the request asks for a batch or another length. Choose formats according to the target mix. For each post provide:
1. Title
2. Recommended format
3. Format-specific creative brief (carousel slide outline, image concept, poll options, or text structure)
4. LinkedIn post draft
5. Primary pain angle
6. Why this angle should resonate
7. Suggested CTA, if any

Do not merely restate this guide. Produce native, sharp, publishable LinkedIn writing. When given several topics, create one distinct post per topic. For a batch, vary the pain angles. During revisions, preserve this strategy and voice.`;

const humanismoVoiceGuide = `# Humanismo Evolutivo — Content, Tone & Voice Guide

## Foundation
Humanismo Evolutivo is the philosophy and foundation based on the work of Marcos Constandse Madrazo. Its central idea is that evolution is not only biological or technological; above all, it is the evolution of consciousness. Its ethical imperative is “Yo soy nosotros”: the human being is an end, never a means, and individual wellbeing is inseparable from collective wellbeing.

Use the provenance line “Basado en la obra filosófica de Marcos Constandse” when appropriate. Spanish is the primary language of composition. Preserve canonical Spanish terms on first use in English.

## Core framework
Build arguments faithfully from these ideas: reality requires intention, will, project, execution, and information; evolution moves “de lo simple a lo complejo”; the human being is matter and spirit and can become conscious of itself; humanity shares a common origin and absolute dignity; trabajo is an evolutionary tool and a means of autorrealización; conscious, ethical work leads toward paz interior and felicidad.

The five institutional axes are:
1. Economía con sentido humano.
2. Conciencia ecológica racional.
3. Espiritualidad práctica.
4. Tecnología al servicio del ser humano.
5. Imperativo Ético — “Yo soy nosotros.”

Keep the distinction between consciencia (awareness, darse cuenta) and conciencia (values, moral conscience). Other important concepts include algoritmos mentales, ego positivo and ego negativo, ente creador, organizador energético, libre mercado with social responsibility, republican democracy with division of powers, and AI as a tool that can potentiate consciousness rather than replace the human being.

## Voice
The voice is integrative, reasoned, evidence-minded, reverent, hopeful, warm, humane, elevated but accessible, ethically serious, invitational, and lived. Synthesize science with spirituality, individual with collective, reason with love, and progress with responsibility. Use concrete analogies, stepwise reasoning, evolutionary arcs, convergence across traditions, and ethical reframing of loaded concepts. The emotional register is serene, expansive, and encouraging. The reader should finish feeling larger, calmer, and more responsible.

Choose the register for the medium:
- Philosophical essay: first-person, reasoned, flowing, conviction with humility.
- Museum or public explainer: direct “tú,” curiosity, wonder, open questions, reader agency.
- Study guide: structured, teacherly, clear, with key ideas and review questions.
- Narrative fiction: scenes, dialogue, character, sensory experience; embody rather than state philosophy.
- Podcast: warm, spoken, reflective, welcoming, and invitational.
- Foundation: collective “we,” mission-driven, humane, and non-corporate.

## Audience
Write for a capable, dignified, free reader: the general public and seekers; serious readers and thinkers; leaders and entrepreneurs developing an integral vision; and students. Hand the reader a map, not a verdict.

## Themes
Prioritize evolution of consciousness; human dignity and the Imperativo Ético; unity of science and spirituality; work as self-realization; rational ecological consciousness; cosmology, life, and humanity; ethical entrepreneurship; inner peace and happiness; technology and AI in service of humanity; convergence of spiritual traditions; critical thinking; identity and free will; integral leadership; and personal plus collective transformation.

## Guardrails
Always keep science and spirituality married. Present an ente creador as a reasoned inference held with humility, never sectarian dogma. Respect all religious traditions and emphasize their convergence on love of the other. Land on hope and agency.

Never flatten the philosophy into generic self-help, manifestation language, shallow positivity, corporate filler, dogma, or fear-driven ecology. Never preach, shame, become partisan, or claim scientific proof for a thesis presented as logic or faith. Do not portray entrepreneurs, work, markets, or money as inherently corrupt; name abuse honestly while preserving the ethical reframing.

## Canonical lexicon
Humanismo Evolutivo; Yo soy nosotros; El otro es como yo; Imperativo Ético; El ser humano es fin y no medio; De lo simple a lo complejo; De la nada, nada puede surgir; niveles de conciencia / consciencia; trabajo; autorrealización; paz interior → felicidad; organizador energético; algoritmos mentales; ego positivo / ego negativo; ente creador; espiritualización de la materia; conciencia ecológica racional; Déjalo ser.

Useful refrains include “Evolucionar es ser,” “Y lo mejor aún está por venir,” and Teilhard de Chardin’s formulation that evolution is the spiritualization of matter. Use quotations selectively and verify attribution.

## Final check
For every piece: select the right register and language; identify one faithful anchor idea; bridge rather than oppose; carry abstraction with a concrete image; maintain a reasoned, reverent, hopeful, humane tone; end with agency, hope, or an open question; apply the guardrails; and credit Marcos Constandse or the foundation appropriately.`;

const initialState: EngineState = {
  properties: [
    {
      slug: "herzenco",
      name: "Herzen Co.",
      domain: "herzenco.co",
      surface: "website",
      language: "English",
      threshold: 75,
      active: true,
      imagesEnabled: false,
    },
    {
      slug: "humanismo-evolutivo",
      name: "Humanismo Evolutivo",
      domain: "humanismoevolutivo.com",
      surface: "website",
      language: "Spanish",
      threshold: 75,
      active: true,
      imagesEnabled: false,
    },
    {
      slug: "herzenco-social",
      name: "Social Media Content",
      domain: "LinkedIn · Herzen Co.",
      surface: "social",
      language: "English",
      threshold: 100,
      active: true,
      imagesEnabled: false,
    },
  ],
  content: [],
  topics: [],
  brands: [
    {
      property: "herzenco",
      voice:
        "Direct, concise, specific, systems-minded, calm, and credible. Say the thing without preamble. Prefer clarity over cleverness and confidence grounded in evidence over hype. Herzen Co. is minimal and routes; Xyren is practical and benefit-first; Xelerate is strategic, senior, and advisory.",
      audience:
        "Herzen Co. visitors deciding between operating brands; consultation-led service-business owners such as plumbers, roofers, lawyers, and consultants for Xyren; and early-stage or funded founders and operators needing fractional product leadership for Xelerate.",
      pillars:
        "Building and scaling digital ventures; conversion systems for service businesses; qualified booked appointments and lead quality; intent-to-action website structure; automation as leverage; fractional product leadership; product strategy and execution oversight; systems thinking and operational leverage; measurable case studies; AI-orchestrated brand-governed production",
      banned:
        "Calling Xyren custom web design or reducing it to pages; generic agency copy; unsupported results or metrics; fake certainty; manufactured urgency; vague ICP language; adjective-heavy copy; empty jargon; content without a lead-capture path; unverified current pricing; adjacent retail-media, LiveRamp, audience-data, or SAM client work unless explicitly approved as a case study",
      cta:
        "Route by need: Xyren — Get your free project plan. Xelerate — Book a free 20-minute call. Herzen Co. — direct the visitor to the appropriate operating brand rather than selling from the parent brand.",
      styleExamples: [
        "Need a website conversion system? Xyren turns service-business traffic into qualified, booked appointments. Get your free project plan.",
        "Need product leadership without a full-time hire? Xelerate brings ongoing strategy, execution oversight, and systems thinking. Book a free 20-minute call.",
        "One buyer. One pain. One mechanism. One outcome. Keep the sentence short and support every claim.",
      ],
      defaultCtas: [],
      visualStyleDescription:
        "Minimal, credible, systems-led editorial imagery. Show structured workflows, real operators, service-business contexts, product teams, and clear input-to-outcome mechanisms. Keep Herzen Co. restrained, Xyren practical and action-oriented, and Xelerate polished, strategic, and senior.",
      visualPalette: "",
      visualRules:
        "Avoid generic agency stock imagery, abstract tech hype, fake dashboards, unverified result callouts, decorative complexity, and text-heavy generated images. Visuals should clarify the buyer, operating system, mechanism, or measurable outcome and must never imply unsupported certainty.",
    },
    {
      property: "humanismo-evolutivo",
      voice:
        "Integrative, reasoned, evidence-minded, reverent, hopeful, warm, humane, elevated but accessible, ethically serious, and invitational. Bridge science with spirituality, individual with collective, reason with love, and progress with responsibility. Use concrete analogies and stepwise reasoning; remain serene and never preachy.",
      audience:
        "Spanish-first general readers and seekers; serious readers and thinkers; leaders and entrepreneurs developing an integral vision; and students. Treat every reader as capable, dignified, and free.",
      pillars:
        "Evolution of consciousness; Imperativo Ético and human dignity; science and spirituality; trabajo and autorrealización; conciencia ecológica racional; ethical entrepreneurship; technology and AI in service of humanity; integral leadership and collective transformation",
      banned:
        "Generic self-help; manifestation language; shallow positivity; scientific claims presented beyond their evidence; sectarian dogma; partisan campaigning; fear-driven ecology; preaching or shaming; anti-entrepreneur or anti-work framing; corporate jargon; doom and us-vs-them rhetoric",
      cta: "Invite reflection, agency, and an open question; connect the reader to the foundation’s work or the Jardín de la Evolución when relevant.",
      styleExamples: [
        "Move from a concrete image or scientific observation into a reasoned philosophical chain, then return the insight to the reader’s responsibility and agency.",
        "Close with serene possibility: Evolucionar es ser. Y lo mejor aún está por venir.",
      ],
      defaultCtas: [],
      visualStyleDescription:
        "Serene, expansive editorial imagery connecting cosmic evolution, nature, human dignity, conscious work, and the monumental Venetian-mosaic language of the Jardín de la Evolución. Use concrete visual metaphors that make abstract ideas accessible; feel contemplative, humane, intelligent, and hopeful rather than mystical or promotional.",
      visualPalette: "",
      visualRules:
        "Bridge science and spirituality without sectarian symbolism; represent people with dignity and universality; avoid fear-driven ecological imagery, guru or manifestation clichés, corporate stock-photo tropes, partisan symbols, dogmatic religious claims, text-heavy generated images, and doom-oriented compositions.",
    },
    {
      property: "herzenco-social",
      voice:
        "Founder-facing, conversational, confident, human, direct, practical, lightly opinionated, and useful. Sound like an embedded operator who is inside the work and owns execution, never like a consultant observing from outside. Use mostly we, with I only when it adds real ownership or conviction. Keep paragraphs natural and the language plain.",
      audience:
        "Founders at funded startups and established founder-led companies with digital products, especially non-technical founders dealing with product and engineering complexity, shifting priorities, missing ownership, and stakeholder/developer drift.",
      pillars:
        "Teams shipping chaos instead of progress; stakeholder and developer drift; missing ownership of digital work; shifting priorities; founders acting as translator and execution glue; output without business progress; execution problems misdiagnosed as developer problems; embedded project management; fractional product leadership; product strategy and execution",
      banned:
        "Xyren or Xelerate; emojis; more than three hashtags or decorative hashtag stuffing; em dashes; cheesy hooks; fake stories; unsupported claims, metrics, credentials, or client outcomes; hot-take framing without substance; corporate language; consultant tone; dev-shop positioning; generic productivity advice; fluff; excessive formatting; leading with website, build, or development work; video or LinkedIn Live",
      cta:
        "Use no CTA when the insight lands cleanly. When useful, end with a low-pressure founder-facing question or an invitation to compare how execution ownership works inside their team. Never force a sales pitch.",
      styleExamples: [
        "Lead with a founder problem that feels immediately familiar, explain the operating failure underneath it, then offer one practical change the team can use this week.",
        "The team can be shipping every week and still not be making progress. Output is not the same as execution when priorities move, decisions disappear, and nobody owns the path from stakeholder intent to what engineering builds.",
        "Keep the translator role implicit. Show that we understand where business intent gets lost and how an embedded owner closes the gap.",
      ],
      defaultCtas: [],
      visualStyleDescription: "",
      visualPalette: "",
      visualRules:
        "LinkedIn posts are text-first. Do not generate an image unless explicitly requested. If a visual is requested, keep it editorial, restrained, operator-led, and free of text-heavy social templates.",
    },
  ],
  contextDocs: [
    {
      id: "context_herzen_voice_guide_2026_07",
      property: "herzenco",
      title: "Herzen Co. — Content, Voice & Messaging Guide",
      contentMd: herzenVoiceGuide,
      source: "written",
      active: true,
      sortOrder: 0,
      createdAt: "2026-07-21T00:00:00.000Z",
    },
    {
      id: "context_humanismo_voice_guide_2026_07",
      property: "humanismo-evolutivo",
      title: "Humanismo Evolutivo — Content, Tone & Voice Guide",
      contentMd: humanismoVoiceGuide,
      source: "written",
      active: true,
      sortOrder: 0,
      createdAt: "2026-07-21T00:00:00.000Z",
    },
    {
      id: "context_herzen_social_strategy_2026_07_22",
      property: "herzenco-social",
      title: "Herzen Co. — LinkedIn Content Strategy (July 22, 2026)",
      contentMd: herzenSocialStrategyGuide,
      source: "written",
      active: true,
      sortOrder: 0,
      createdAt: "2026-07-22T00:00:00.000Z",
    },
  ],
  metrics: [],
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
      id: "model_openai_premium_text",
      provider: "openai",
      modelId: "gpt-4.1",
      displayName: "OpenAI GPT-4.1",
      capabilities: ["text"],
      qualityTier: "premium",
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
  routingRules: [
    {
      id: "rule_update03_draft_openai",
      task: "draft",
      property: "all",
      contentType: "all",
      language: "all",
      modelChain: ["model_openai_premium_text", "model_claude_sonnet"],
      priority: 0,
      active: true,
      notes: "Update 03 routing flip: OpenAI drafts first, Anthropic premium fallback.",
    },
    {
      id: "rule_update03_qa_anthropic",
      task: "qa",
      property: "all",
      contentType: "all",
      language: "all",
      modelChain: ["model_claude_sonnet", "model_openai_text"],
      priority: 0,
      active: true,
      notes: "Update 03 routing flip: Anthropic QA first, OpenAI standard fallback.",
    },
    {
      id: "rule_update03_autopilot_prompt",
      task: "autopilot_prompt",
      property: "all",
      contentType: "all",
      language: "all",
      modelChain: ["model_claude_sonnet", "model_openai_text"],
      priority: 0,
      active: true,
      notes: "Default routed model call for Autopilot prompt generation.",
    },
  ],
  autopilotSettings: [
    {
      property: "herzenco",
      enabled: false,
      cadence: "weekly",
      customCron: "",
      piecesPerCycle: 1,
      publishTime: "09:00",
      publishDays: ["tue"],
      contentType: "article",
      maxQueued: 3,
      backlogPriorityThreshold: 7,
      nextRunAt: "2026-07-21T09:00:00.000Z",
    },
    {
      property: "humanismo-evolutivo",
      enabled: false,
      cadence: "weekly",
      customCron: "",
      piecesPerCycle: 1,
      publishTime: "09:00",
      publishDays: ["thu"],
      contentType: "article",
      maxQueued: 3,
      backlogPriorityThreshold: 7,
      nextRunAt: "2026-07-23T09:00:00.000Z",
    },
  ],
  autopilotWarnings: [],
  gscConnected: false,
  cron: "0 9 * * 1,3",
  apiKeys: [],
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
  const [activeView, setActiveView] = useState<View>("home");
  const [contentMode, setContentMode] = useState<ContentMode>("list");
  const [homeOptionsOpen, setHomeOptionsOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("herzen-home-options-open") === "true",
  );
  const [form, setForm] = useState<QuickGenerateForm>(emptyForm);
  const [selectedContentId, setSelectedContentId] = useState<string>(
    initialState.content[0]?.id ?? "",
  );
  const [selectedPropertySlug, setSelectedPropertySlug] =
    useState<PropertySlug>("herzenco");
  const [propertyTab, setPropertyTab] =
    useState<"profile" | "content" | "performance" | "settings">("profile");
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
    window.localStorage.setItem("herzen-home-options-open", String(homeOptionsOpen));
  }, [homeOptionsOpen]);

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

  const reviewCount = state.content.filter((item) => item.status === "needs_review").length;

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

  async function persistPublishedContent(item: ContentItem) {
    try {
      const response = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property: item.property,
          contentType: item.contentType,
          title: item.title,
          body: item.body,
          excerpt: item.excerpt,
          metaTitle: item.metaTitle,
          metaDescription: item.metaDescription,
          qualityScore: item.qualityScore,
          publishedAt: item.publishedAt,
          heroImageUrl: item.heroImageUrl ?? null,
          heroImageAlt: item.heroImageAlt ?? null,
        }),
      });
      const payload = (await response.json()) as {
        data?: { slug?: string };
        message?: string;
        websiteBuildTriggered?: boolean;
      };
      if (!response.ok) throw new Error(payload.message || "Website publishing failed");
      setToast(
        item.property === "herzenco-social"
          ? "LinkedIn draft approved"
          : `Published /resources/${payload.data?.slug ?? ""}/`,
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Website publishing failed");
    }
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
      const publishedAt = nextStatus === "published" ? new Date().toISOString() : "";
      const finalPatch: Partial<ContentItem> = {
        status: nextStatus,
        qualityScore: score,
        evals,
        contextHash,
        servedModels,
        publishedAt,
      };
      setContentItem(item.id, finalPatch);
      setToast(statusLabel(nextStatus));
      if (nextStatus === "published") {
        void persistPublishedContent({ ...item, ...finalPatch });
      }
    }, 1700);

    if (item.imageStatus === "queued") {
      window.setTimeout(() => {
        const imagePatch = buildHeroImagePatch(item, brand);
        setContentItem(item.id, imagePatch);
        setToast(imagePatch.heroImageUrl ? "Hero image attached" : "Image skipped");
      }, 2300);
    }
  }

  async function createContentFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.prompt.trim()) {
      setToast("Prompt required");
      return;
    }
    if (!selectedPropertyCompleteness.complete) {
      setToast(humanizeCode("brand_profile_incomplete"));
      setActiveView("properties");
      setSelectedPropertySlug(form.property);
      setPropertyTab("profile");
      return;
    }
    const property = state.properties.find((entry) => entry.slug === form.property);
    if (!property) {
      setToast("Property not found");
      return;
    }
    const contentType = normalizeContentTypeForProperty(property, form.contentType);
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
      contentType,
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
      body: "",
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
      contentType: defaultContentTypeForProperty(property),
      skipAutoPublish: property.surface === "social",
      generateHeroImage: Boolean(property?.imagesEnabled),
    });
    setToast("Draft job started");

    const draftModel = resolveServedModel(state, {
      task: "draft",
      property: form.property,
      contentType,
      language: property?.language ?? "English",
    });

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: draftModel.provider,
          model: draftModel.modelId,
          maxOutputTokens: 8_000,
          instructions: buildContentInstructions(
            property?.language ?? "English",
            item.contentType,
            item.property,
          ),
          prompt: buildArticlePrompt({
            requestedTitle: form.title.trim(),
            request: form.prompt.trim(),
            keywords,
            toneOverride: form.toneOverride.trim(),
            brandContext,
          }),
        }),
      });
      const payload = (await response.json()) as {
        data?: { text?: string; model?: string; provider?: string };
        message?: string;
      };
      if (!response.ok || !payload.data?.text) {
        throw new Error(payload.message || "The provider returned no article.");
      }

      const generatedItem = applyGeneratedContent(
        item,
        payload.data.text,
        Boolean(form.title.trim()),
        property.language,
      );
      setContentItem(id, generatedItem);
      setToast(`Draft received from ${payload.data.model ?? draftModel.displayName}`);
      finishPipeline(generatedItem, form.skipAutoPublish);
    } catch (error) {
      setContentItem(id, {
        status: "failed",
        body: "",
      });
      setToast(error instanceof Error ? error.message : "Draft generation failed");
    }
  }

  function approveContent(id: string) {
    const item = state.content.find((entry) => entry.id === id);
    if (!item) return;
    const isFuture = item.publishAt
      ? new Date(item.publishAt).getTime() > Date.now()
      : false;
    const publishedAt = isFuture ? "" : new Date().toISOString();
    const patch: Partial<ContentItem> = {
      status: isFuture ? "scheduled" : "published",
      publishedAt,
    };
    setContentItem(id, patch);
    setToast(isFuture ? "Scheduled" : "Published");
    if (!isFuture) void persistPublishedContent({ ...item, ...patch });
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
    const item = state.content.find((entry) => entry.id === id);
    if (!item) return;
    const patch: Partial<ContentItem> = {
      status: "published",
      publishedAt: new Date().toISOString(),
    };
    setContentItem(id, patch);
    setToast("Published");
    void persistPublishedContent({ ...item, ...patch });
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
      contentType: topic.property === "herzenco-social" ? "social_post" : "article",
      prompt: `${topic.title}. ${topic.angle}`,
      title: topic.title,
      keywords: topic.keywords.join(", "),
      skipAutoPublish: topic.property === "herzenco-social",
    });
    setActiveView("home");
    setState((current) => ({
      ...current,
      topics: current.topics.map((entry) =>
        entry.id === topic.id ? { ...entry, status: "drafted" } : entry,
      ),
    }));
    setToast("Topic loaded");
  }

  function runAutopilotCycle(propertySlug: PropertySlug) {
    const setting = state.autopilotSettings.find((entry) => entry.property === propertySlug);
    const property = state.properties.find((entry) => entry.slug === propertySlug);
    if (!setting || !property) return;

    const profile = getProfileCompleteness(state, propertySlug);
    if (!profile.complete) {
      addAutopilotWarning(
        propertySlug,
        "brand_profile_incomplete",
        `Autopilot skipped ${property.domain}: missing ${profile.missing.join(", ")}.`,
      );
      setToast("Autopilot skipped: profile incomplete");
      return;
    }

    const unpublishedAutopilot = state.content.filter(
      (item) =>
        item.property === propertySlug &&
        item.source === "autopilot" &&
        !["published", "rejected", "failed"].includes(item.status),
    );
    if (unpublishedAutopilot.length >= setting.maxQueued) {
      addAutopilotWarning(
        propertySlug,
        "autopilot_skipped_queue_full",
        `${property.domain} already has ${unpublishedAutopilot.length} unpublished autopilot items.`,
      );
      setToast("Autopilot skipped: queue full");
      return;
    }

    const brandContext = assembleBrandContext(state, propertySlug);
    const highPriorityBacklog = [...state.topics]
      .filter(
        (topic) =>
          topic.property === propertySlug &&
          topic.status === "backlog" &&
          topic.priority >= setting.backlogPriorityThreshold,
      )
      .sort((a, b) => b.priority - a.priority);
    const createdItems: ContentItem[] = [];
    const consumedTopicIds = new Set<string>();
    const warnings: AutopilotWarning[] = [];

    for (let index = 0; index < setting.piecesPerCycle; index += 1) {
      const backlogTopic = highPriorityBacklog.find(
        (topic) => !consumedTopicIds.has(topic.id),
      );
      if (backlogTopic) consumedTopicIds.add(backlogTopic.id);

      let promptPlan = makeAutopilotPromptPlan(
        state,
        property,
        setting,
        backlogTopic,
        index,
      );
      let duplicate = findDuplicateCandidate(state, propertySlug, promptPlan.title, promptPlan.keywords);
      if (duplicate) {
        promptPlan = makeAutopilotPromptPlan(
          state,
          property,
          setting,
          backlogTopic,
          index + 1,
          duplicate.title,
        );
        duplicate = findDuplicateCandidate(state, propertySlug, promptPlan.title, promptPlan.keywords);
      }
      if (duplicate) {
        warnings.push({
          id: makeId("autowarn"),
          property: propertySlug,
          code: "autopilot_skipped_duplicate",
          detail: `${property.domain} skipped a near-duplicate of "${duplicate.title}".`,
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      const primaryKeyword = promptPlan.keywords[0] ?? promptPlan.title.split(" ").slice(0, 2).join(" ");
      const excerpt = makeExcerpt(promptPlan.prompt, property.language);
      const metaDescription = makeMetaDescription(excerpt, primaryKeyword, property.language);
      const id = makeId("ci");
      createdItems.push({
        id,
        title: promptPlan.title,
        property: propertySlug,
        prompt: promptPlan.prompt,
        contentType: setting.contentType,
        status: "drafting",
        source: "autopilot",
        keywords: promptPlan.keywords,
        toneOverride: `Autopilot pillar: ${promptPlan.pillar}. ${promptPlan.noveltyRationale}`,
        qualityScore: null,
        publishAt: makeAutopilotPublishAt(setting, index),
        publishedAt: "",
        createdAt: new Date().toISOString(),
        excerpt,
        metaTitle: promptPlan.title.slice(0, 60),
        metaDescription,
        evals: [],
        body: makeBody(promptPlan.title, promptPlan.prompt, property.language, brandContext, primaryKeyword),
        contextHash: hashString(brandContext),
        socialMeta: {
          ogTitle: promptPlan.title.slice(0, 60),
          ogDescription: metaDescription,
          ogType: "article",
        },
        imageStatus: "off",
        imageCheck: "Hero image generation is off for autopilot unless requested from review.",
      });
    }

    if (!createdItems.length) {
      setState((current) => ({
        ...current,
        autopilotWarnings: [...warnings, ...current.autopilotWarnings].slice(0, 12),
      }));
      setToast("Autopilot skipped: duplicate guard");
      return;
    }

    setState((current) => ({
      ...current,
      content: [...createdItems, ...current.content],
      topics: current.topics.map((topic) =>
        consumedTopicIds.has(topic.id) ? { ...topic, status: "drafted" } : topic,
      ),
      autopilotWarnings: [...warnings, ...current.autopilotWarnings].slice(0, 12),
      autopilotSettings: current.autopilotSettings.map((entry) =>
        entry.property === propertySlug
          ? {
              ...entry,
              lastRunAt: new Date().toISOString(),
              nextRunAt: nextAutopilotRun(entry),
            }
          : entry,
      ),
    }));
    setSelectedContentId(createdItems[0].id);
    setToast(`Autopilot created ${createdItems.length} draft${createdItems.length === 1 ? "" : "s"}`);
    createdItems.forEach((item) => finishPipeline(item, false));
  }

  function addAutopilotWarning(
    property: PropertySlug,
    code: AutopilotWarning["code"],
    detail: string,
  ) {
    setState((current) => ({
      ...current,
      autopilotWarnings: [
        { id: makeId("autowarn"), property, code, detail, createdAt: new Date().toISOString() },
        ...current.autopilotWarnings,
      ].slice(0, 12),
    }));
  }

  function updateAutopilotSetting(property: PropertySlug, patch: Partial<AutopilotSetting>) {
    setState((current) => ({
      ...current,
      autopilotSettings: current.autopilotSettings.map((entry) =>
        entry.property === property ? (() => {
          const propertyConfig = current.properties.find((item) => item.slug === property);
          const nextContentType = propertyConfig
            ? normalizeContentTypeForProperty(
                propertyConfig,
                patch.contentType ?? entry.contentType,
              )
            : entry.contentType;
          return {
              ...entry,
              ...patch,
              contentType: nextContentType,
              piecesPerCycle: Math.min(5, Math.max(1, patch.piecesPerCycle ?? entry.piecesPerCycle)),
              maxQueued: Math.max(1, patch.maxQueued ?? entry.maxQueued),
            };
        })()
          : entry,
      ),
    }));
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
    setToast("Workspace cleared");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <main className="herzen-engine min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-[256px_1fr]">
        <aside className="engine-sidebar border-r px-4 py-6">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center border border-[var(--border-on-dark)] text-sm font-medium text-[var(--paper-50)]">
              H
            </div>
            <div>
              <p className="editorial-wordmark text-xs">Herzen Co.</p>
              <p className="mt-1 text-xs text-[var(--text-on-dark-muted)]">Content engine</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1" aria-label="Primary">
            {navItems.map((item) => (
              <button
                className={`flex w-full items-center gap-3 border px-3 py-2.5 text-left text-sm transition ${
                  activeView === item.view
                    ? "border-[var(--clay-400)] bg-[rgba(156,92,62,0.18)] text-[var(--paper-50)]"
                    : "border-transparent text-[var(--text-on-dark-muted)] hover:border-[var(--border-on-dark)] hover:text-[var(--paper-50)]"
                }`}
                key={item.view}
                onClick={() => setActiveView(item.view)}
                type="button"
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.view === "home" && reviewCount > 0 && (
                  <Badge tone="amber">{reviewCount}</Badge>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-8 border-t border-white/10 pt-4">
            <button
              className={`flex w-full items-center gap-3 border px-3 py-2.5 text-left text-sm transition ${
                activeView === "settings"
                  ? "border-[var(--clay-400)] bg-[rgba(156,92,62,0.18)] text-[var(--paper-50)]"
                  : "border-transparent text-[var(--text-on-dark-muted)] hover:border-[var(--border-on-dark)] hover:text-[var(--paper-50)]"
              }`}
              onClick={() => setActiveView("settings")}
              type="button"
            >
              <Settings size={17} />
              Settings
            </button>
          </div>

          <div className="mt-4 border border-[var(--border-on-dark)] p-3">
            <div className="flex items-center gap-2 text-sm text-[var(--text-on-dark-muted)]">
              <Activity size={16} />
              {toast}
            </div>
          </div>
        </aside>

        <section className="engine-workspace min-w-0">
          <header className="engine-header sticky top-0 z-20 flex flex-col gap-4 border-b px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="editorial-eyebrow">
                {activeViewLabel(activeView)}
              </p>
              <h1 className="editorial-title mt-1 text-3xl text-[var(--text-primary)]">
                {viewTitle(activeView)}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden items-center gap-2 border border-[var(--border-hairline)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-secondary)] md:flex">
                <KeyRound size={15} />
                <span className="max-w-52 truncate">{userEmail}</span>
              </div>
              <label className="flex min-w-0 items-center gap-2 border border-[var(--border-soft)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                <Search size={16} />
                <input
                  className="w-48 bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search content"
                  value={query}
                />
              </label>
              <button
                className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--surface-ink)] bg-[var(--surface-ink)] px-4 py-2 text-xs font-medium uppercase tracking-[var(--tracking-wide)] text-[var(--text-on-dark)] hover:bg-[var(--ink-700)]"
                onClick={() => setActiveView("home")}
                type="button"
              >
                <Zap size={16} />
                New
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-2 text-xs font-medium uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                onClick={signOut}
                type="button"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </header>

          <div className="engine-content p-6 xl:p-8">
            {activeView === "home" && (
              <HomeView
                autopilotWarnings={state.autopilotWarnings}
                content={state.content}
                form={form}
                gscConnected={state.gscConnected}
                homeOptionsOpen={homeOptionsOpen}
                metrics={state.metrics}
                onChange={setForm}
                onOpenCalendar={() => {
                  setActiveView("content");
                  setContentMode("calendar");
                }}
                onSubmit={createContentFromForm}
                onToggleOptions={() => setHomeOptionsOpen((value) => !value)}
                onApprove={approveContent}
                onOpenContent={(id) => {
                  setSelectedContentId(id);
                  setActiveView("content");
                  setContentMode("list");
                }}
                onOpenProfile={() => {
                  setActiveView("properties");
                  setSelectedPropertySlug(form.property);
                  setPropertyTab("profile");
                }}
                onOpenPropertyPerformance={(property) => {
                  setActiveView("properties");
                  setSelectedPropertySlug(property);
                  setPropertyTab("performance");
                }}
                onRegenerate={regenerateContent}
                properties={state.properties}
                profileCompleteness={selectedPropertyCompleteness}
                selectedContent={selectedContent}
              />
            )}
            {activeView === "content" && (
              <ContentView
                content={filteredContent}
                contentMode={contentMode}
                onAddTopic={addTopic}
                onApprove={approveContent}
                onDraft={draftFromTopic}
                onRegenerate={regenerateContent}
                onRegenerateImage={regenerateHeroImage}
                onModeChange={setContentMode}
                onPublish={publishNow}
                onReject={rejectContent}
                onSelect={(id) => setSelectedContentId(id)}
                properties={state.properties}
                selectedContentId={selectedContentId}
                topics={state.topics}
              />
            )}
            {activeView === "properties" && (
              <PropertiesView
                brands={state.brands}
                autopilotSettings={state.autopilotSettings}
                content={filteredContent}
                contextDocs={state.contextDocs}
                onAddProperty={(property, brand, contextDoc, autopilotPatch) =>
                  setState((current) => ({
                    ...current,
                    properties: [property, ...current.properties],
                    brands: [brand, ...current.brands],
                    contextDocs: contextDoc
                      ? [contextDoc, ...current.contextDocs]
                      : current.contextDocs,
                    autopilotSettings: [
                      {
                        ...makeDefaultAutopilotSetting(property.slug),
                        ...autopilotPatch,
                      },
                      ...current.autopilotSettings,
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
                onRunAutopilot={runAutopilotCycle}
                onSelectContent={(id) => {
                  setSelectedContentId(id);
                  setActiveView("content");
                  setContentMode("list");
                }}
                onUpdateAutopilotSetting={updateAutopilotSetting}
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
                gscConnected={state.gscConnected}
                metrics={state.metrics}
                onPerformanceDaysChange={setPerformanceDays}
                performanceDays={performanceDays}
                propertyTab={propertyTab}
                properties={state.properties}
                selectedPropertySlug={selectedPropertySlug}
              />
            )}
            {activeView === "settings" && (
              <SettingsView
                apiKeys={state.apiKeys}
                autopilotSettings={state.autopilotSettings}
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
                onUpdateAutopilotSetting={updateAutopilotSetting}
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

function HomeView({
  autopilotWarnings,
  content,
  form,
  gscConnected,
  homeOptionsOpen,
  metrics,
  onApprove,
  onChange,
  onOpenCalendar,
  onOpenContent,
  onOpenProfile,
  onOpenPropertyPerformance,
  onRegenerate,
  onSubmit,
  onToggleOptions,
  properties,
  profileCompleteness,
  selectedContent,
}: {
  autopilotWarnings: AutopilotWarning[];
  content: ContentItem[];
  form: QuickGenerateForm;
  gscConnected: boolean;
  homeOptionsOpen: boolean;
  metrics: ContentMetricDaily[];
  onApprove: (id: string) => void;
  onChange: (form: QuickGenerateForm) => void;
  onOpenCalendar: () => void;
  onOpenContent: (id: string) => void;
  onOpenProfile: () => void;
  onOpenPropertyPerformance: (property: PropertySlug) => void;
  onRegenerate: (id: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleOptions: () => void;
  properties: PropertyConfig[];
  profileCompleteness: { complete: boolean; missing: string[] };
  selectedContent?: ContentItem;
}) {
  const selectedProperty = properties.find((property) => property.slug === form.property);
  const needsReview = content.filter((item) => item.status === "needs_review");
  const comingUp = content
    .filter((item) => item.status === "scheduled")
    .sort((a, b) => calendarTime(a) - calendarTime(b))
    .slice(0, 7);

  return (
    <div className="space-y-5">
      <Panel title="Generate">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="flex flex-wrap gap-2">
            {properties.map((property) => (
              <button
                className={`border px-3 py-2 text-sm ${
                  form.property === property.slug
                    ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                    : "border-white/10 text-white/60 hover:bg-white/[0.04]"
                }`}
                key={property.slug}
                onClick={() =>
                  onChange({
                    ...form,
                    property: property.slug,
                    contentType: normalizeContentTypeForProperty(property, form.contentType),
                    skipAutoPublish:
                      property.surface === "social" ? true : false,
                    generateHeroImage: Boolean(property.imagesEnabled),
                  })
                }
                type="button"
              >
                {property.domain}
              </button>
            ))}
          </div>

          <textarea
            className={`${fieldClass} min-h-28 resize-y text-base`}
            onChange={(event) => onChange({ ...form, prompt: event.target.value })}
            placeholder="What should the Engine make today?"
            value={form.prompt}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              className="text-sm text-white/60 underline underline-offset-4 hover:text-white"
              onClick={onToggleOptions}
              type="button"
            >
              {homeOptionsOpen ? "Hide options" : "Options"}
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 border border-emerald-300/40 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-[#08100d] hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35"
              disabled={!profileCompleteness.complete}
              type="submit"
            >
              <Send size={17} />
              Generate
            </button>
          </div>

          {!profileCompleteness.complete && (
            <div className="border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p>{humanizeCode("brand_profile_incomplete")}</p>
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

          {homeOptionsOpen && (
            <div className="grid gap-4 border-t border-white/10 pt-4 md:grid-cols-2">
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
                  {selectedProperty?.surface === "social" ? (
                    <option value="social_post">Social post</option>
                  ) : (
                    <>
                      <option value="article">Article</option>
                      <option value="newsletter">Newsletter</option>
                    </>
                  )}
                </select>
              </Field>
              <Field label="Publish date">
                <input
                  className={fieldClass}
                  onChange={(event) => onChange({ ...form, publishAt: event.target.value })}
                  type="datetime-local"
                  value={form.publishAt}
                />
              </Field>
              <Field label="Title">
                <input
                  className={fieldClass}
                  onChange={(event) => onChange({ ...form, title: event.target.value })}
                  value={form.title}
                />
              </Field>
              <Field label="Keywords">
                <input
                  className={fieldClass}
                  onChange={(event) => onChange({ ...form, keywords: event.target.value })}
                  value={form.keywords}
                />
              </Field>
              <Field label="Tone">
                <input
                  className={fieldClass}
                  onChange={(event) => onChange({ ...form, toneOverride: event.target.value })}
                  value={form.toneOverride}
                />
              </Field>
              <div className="flex flex-wrap items-end gap-4">
                {selectedProperty?.imagesEnabled && (
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      checked={form.generateHeroImage}
                      className="h-4 w-4 accent-cyan-300"
                      onChange={(event) =>
                        onChange({ ...form, generateHeroImage: event.target.checked })
                      }
                      type="checkbox"
                    />
                    Generate hero image
                  </label>
                )}
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
              </div>
            </div>
          )}
        </form>

        {selectedContent && (
          <div className="mt-4 border border-white/10 bg-[#0d0f12] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{selectedContent.title}</p>
                <p className="mt-1 text-sm text-white/50">
                  Current status: {statusLabel(selectedContent.status)}
                </p>
              </div>
              <StatusBadge status={selectedContent.status} />
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Needs you">
          <div className="space-y-3">
            {needsReview.map((item) => (
              <NeedsReviewCard
                item={item}
                key={item.id}
                onApprove={() => onApprove(item.id)}
                onOpen={() => onOpenContent(item.id)}
                onRegenerate={() => onRegenerate(item.id)}
              />
            ))}
            {autopilotWarnings.map((warning) => (
              <div className="needs-you-card p-4" key={warning.id}>
                <p className="editorial-eyebrow">Autopilot needs attention</p>
                <p className="mt-2 font-medium text-[var(--text-primary)]">
                  {humanizeCode(warning.code)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {warning.detail}
                </p>
                <p className="mt-3 font-mono text-xs text-[var(--text-muted)]">
                  {propertyLabel(warning.property)} · {warning.code}
                </p>
              </div>
            ))}
            {needsReview.length === 0 && autopilotWarnings.length === 0 && (
              <EmptyState icon={<Check size={20} />} label="Nothing needs you." />
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Coming up">
            <div className="space-y-3">
              {comingUp.map((item) => (
                <button
                  className="w-full border border-white/10 bg-white/[0.025] p-3 text-left hover:bg-white/[0.045]"
                  key={item.id}
                  onClick={() => onOpenContent(item.id)}
                  type="button"
                >
                  <div className="flex items-center gap-2 text-xs text-white/45">
                    <span>{formatDateTime(item.publishAt)}</span>
                    <span>{propertyLabel(item.property)}</span>
                    {item.source === "autopilot" && <Zap size={13} className="text-cyan-200" />}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium">{item.title}</p>
                </button>
              ))}
              {comingUp.length === 0 && (
                <EmptyState icon={<CalendarDays size={20} />} label="Nothing scheduled" />
              )}
              <button
                className="text-sm text-cyan-100 underline underline-offset-4"
                onClick={onOpenCalendar}
                type="button"
              >
                Full calendar
              </button>
            </div>
          </Panel>

          <Panel title="Pulse">
            <div className="space-y-3">
              {properties.map((property) => (
                <button
                  className="w-full border border-white/10 bg-white/[0.025] p-3 text-left hover:bg-white/[0.045]"
                  key={property.slug}
                  onClick={() => onOpenPropertyPerformance(property.slug)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{property.domain}</p>
                    <p className="font-mono text-sm text-emerald-200">
                      {pageviewsForProperty(content, metrics, property.slug, 7)}
                    </p>
                  </div>
                  <Sparkline values={sparklineForProperty(content, metrics, property.slug, 7)} />
                </button>
              ))}
              {!gscConnected && <Badge tone="amber">Pageviews only</Badge>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function NeedsReviewCard({
  item,
  onApprove,
  onOpen,
  onRegenerate,
}: {
  item: ContentItem;
  onApprove: () => void;
  onOpen: () => void;
  onRegenerate: () => void;
}) {
  const failedChecks = item.evals
    .filter((result) => !result.passed)
    .sort((a, b) => Number(Boolean(b.hard)) - Number(Boolean(a.hard)) || a.score - b.score);
  const passedChecks = item.evals.filter((result) => result.passed).length;
  const publishAction = item.publishAt
    ? `Approve and schedule for ${formatDateTime(item.publishAt)}`
    : "Approve and publish now";

  return (
    <article className="needs-you-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="editorial-eyebrow">
            {item.contentType.replaceAll("_", " ")} · {propertyLabel(item.property)}
          </p>
          <h3 className="mt-2 text-lg font-medium leading-snug text-[var(--text-primary)]">
            {item.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {item.excerpt || item.prompt || "No summary was generated for this item."}
          </p>
        </div>
        <div className="needs-you-score" aria-label={`Quality score ${item.qualityScore ?? "not available"}`}>
          <span>Quality</span>
          <strong>{item.qualityScore ?? "—"}</strong>
          {item.qualityScore !== null && <small>/100</small>}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="needs-you-detail">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--clay-600)]">
            Why this stopped
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-primary)]">
            {primaryReviewReason(item.evals)}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {failedChecks.length} {failedChecks.length === 1 ? "check needs" : "checks need"} attention · {passedChecks} passed
          </p>
        </div>

        <div className="needs-you-detail">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Review context
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-[var(--text-muted)]">Requested</dt>
            <dd className="text-[var(--text-primary)]">{item.prompt || "No prompt saved"}</dd>
            <dt className="text-[var(--text-muted)]">Created</dt>
            <dd className="text-[var(--text-primary)]">{formatDateTime(item.createdAt)}</dd>
            <dt className="text-[var(--text-muted)]">Source</dt>
            <dd className="capitalize text-[var(--text-primary)]">{sourceLabel(item.source)}</dd>
          </dl>
        </div>
      </div>

      {failedChecks.length > 0 && (
        <div className="mt-3 border-t border-[var(--border-hairline)] pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Checks to review
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {failedChecks.slice(0, 4).map((result) => (
              <li className="flex gap-2 text-sm" key={result.name}>
                <span className="mt-1 h-2 w-2 shrink-0 bg-[var(--clay-500)]" aria-hidden="true" />
                <span>
                  <strong className="font-medium text-[var(--text-primary)]">
                    {humanizeEval(result.name, result.detail)}
                  </strong>
                  <span className="block text-[var(--text-secondary)]">{result.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-4">
        <ActionButton icon={<Check size={16} />} label={publishAction} onClick={onApprove} tone="green" />
        <ActionButton icon={<FileText size={16} />} label="Review full draft" onClick={onOpen} tone="cyan" />
        <ActionButton icon={<RefreshCw size={16} />} label="Regenerate draft" onClick={onRegenerate} tone="cyan" />
      </div>
    </article>
  );
}

function ContentView({
  content,
  contentMode,
  onAddTopic,
  onApprove,
  onDraft,
  onRegenerate,
  onRegenerateImage,
  onModeChange,
  onPublish,
  onReject,
  onSelect,
  properties,
  selectedContentId,
  topics,
}: {
  content: ContentItem[];
  contentMode: ContentMode;
  onAddTopic: (event: FormEvent<HTMLFormElement>) => void;
  onApprove: (id: string) => void;
  onDraft: (topic: Topic) => void;
  onRegenerate: (id: string) => void;
  onRegenerateImage: (id: string) => void;
  onModeChange: (mode: ContentMode) => void;
  onPublish: (id: string) => void;
  onReject: (id: string) => void;
  onSelect: (id: string) => void;
  properties: PropertyConfig[];
  selectedContentId: string;
  topics: Topic[];
}) {
  const [propertyFilter, setPropertyFilter] = useState<PropertySlug | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<ContentSource | "all">("all");
  const filtered = content.filter(
    (item) =>
      (propertyFilter === "all" || item.property === propertyFilter) &&
      (statusFilter === "all" || item.status === statusFilter) &&
      (sourceFilter === "all" || item.source === sourceFilter),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(["list", "calendar", "ideas"] as ContentMode[]).map((mode) => (
          <button
            className={`border px-3 py-2 text-sm ${
              contentMode === mode
                ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                : "border-white/10 text-white/60 hover:bg-white/[0.04]"
            }`}
            key={mode}
            onClick={() => onModeChange(mode)}
            type="button"
          >
            {mode === "ideas" ? "Ideas" : mode[0].toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {contentMode === "list" && (
        <div className="space-y-5">
          <Panel title="Content list">
            <div className="mb-4 flex flex-wrap gap-2">
              <select className={fieldClass} onChange={(event) => setPropertyFilter(event.target.value as PropertySlug | "all")} value={propertyFilter}>
                <option value="all">All properties</option>
                {properties.map((property) => (
                  <option key={property.slug} value={property.slug}>{property.domain}</option>
                ))}
              </select>
              <select className={fieldClass} onChange={(event) => setStatusFilter(event.target.value as ContentStatus | "all")} value={statusFilter}>
                <option value="all">All statuses</option>
                {(["drafting", "qa", "needs_review", "scheduled", "published", "rejected", "failed"] as ContentStatus[]).map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
              <select className={fieldClass} onChange={(event) => setSourceFilter(event.target.value as ContentSource | "all")} value={sourceFilter}>
                <option value="all">All sources</option>
                {(["quick_generate", "autopilot", "api", "schedule", "repurpose"] as ContentSource[]).map((source) => (
                  <option key={source} value={source}>{sourceLabel(source)}</option>
                ))}
              </select>
            </div>
            <ContentTable content={filtered} onPublish={onPublish} onSelect={onSelect} />
          </Panel>
          <ReviewView
            content={content}
            onApprove={onApprove}
            onRegenerate={onRegenerate}
            onRegenerateImage={onRegenerateImage}
            onReject={onReject}
            onSelect={onSelect}
            selectedContentId={selectedContentId}
          />
        </div>
      )}

      {contentMode === "calendar" && (
        <CalendarView content={content} onPublish={onPublish} />
      )}

      {contentMode === "ideas" && (
        <TopicsView onAddTopic={onAddTopic} onDraft={onDraft} properties={properties} topics={topics} />
      )}
    </div>
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
                    contentType: nextProperty
                      ? normalizeContentTypeForProperty(nextProperty, form.contentType)
                      : form.contentType,
                    skipAutoPublish: nextProperty?.surface === "social",
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
                {selectedProperty?.surface === "social" ? (
                  <option value="social_post">Social post</option>
                ) : (
                  <>
                    <option value="article">Article</option>
                    <option value="newsletter">Newsletter</option>
                  </>
                )}
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
                <p>{humanizeCode("brand_profile_incomplete")}</p>
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
  autopilotSettings,
  autopilotWarnings,
  content,
  onPublish,
  onRunAutopilot,
  onSelect,
  properties,
}: {
  autopilotSettings: AutopilotSetting[];
  autopilotWarnings: AutopilotWarning[];
  content: ContentItem[];
  onPublish: (id: string) => void;
  onRunAutopilot: (property: PropertySlug) => void;
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

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Next autopilot runs">
          <div className="space-y-3">
            {autopilotSettings.map((setting) => {
              const property = properties.find((entry) => entry.slug === setting.property);
              return (
                <div className="grid gap-3 border border-white/10 bg-white/[0.025] p-3 md:grid-cols-[1fr_auto]" key={setting.property}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{property?.domain ?? setting.property}</p>
                      <Badge tone={setting.enabled ? "green" : "gray"}>
                        {setting.enabled ? "On" : "Off"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-white/55">
                      {autopilotSummary(setting)}
                    </p>
                    <p className="mt-2 font-mono text-xs text-white/40">
                      Next: {setting.nextRunAt ? formatDateTime(setting.nextRunAt) : "not scheduled"}
                    </p>
                  </div>
                  <ActionButton
                    icon={<Zap size={16} />}
                    label="Run"
                    onClick={() => onRunAutopilot(setting.property)}
                    tone="cyan"
                  />
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Autopilot warnings">
          <div className="space-y-2">
            {autopilotWarnings.map((warning) => (
              <div className="border border-amber-300/25 bg-amber-300/10 p-3" key={warning.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone="amber">{warning.code}</Badge>
                  <span className="font-mono text-xs text-amber-100/60">
                    {formatDateTime(warning.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-amber-100/85">{warning.detail}</p>
              </div>
            ))}
            {autopilotWarnings.length === 0 && (
              <EmptyState icon={<Zap size={20} />} label="No skipped cycles" />
            )}
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
                    <div>
                      <p className="font-medium">{humanizeEval(evalResult.name, evalResult.detail)}</p>
                      <p className="mt-1 font-mono text-xs text-white/35">{evalResult.name}</p>
                    </div>
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

void QuickGenerateView;
void OverviewView;

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
              <div className="flex flex-wrap items-center gap-2">
                {item.source === "autopilot" && (
                  <Badge tone="cyan">
                    <span className="inline-flex items-center gap-1">
                      <Zap size={13} />
                      Autopilot
                    </span>
                  </Badge>
                )}
                <p className="font-medium">{item.title}</p>
              </div>
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
      <Panel title="Drop an idea">
        <form className="space-y-4" onSubmit={onAddTopic}>
          <p className="text-sm text-white/55">
            Add a ranked idea here. Autopilot will use high-priority ideas before inventing new ones.
          </p>
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
      <Panel title="Ideas">
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
  autopilotSettings,
  brands,
  content,
  contextDocs,
  gscConnected,
  metrics,
  onAddProperty,
  onDeleteDoc,
  onSelectProperty,
  onPublish,
  onRunAutopilot,
  onSetTab,
  onSelectContent,
  onUpdateAutopilotSetting,
  onUpdateBrand,
  onUpdateDoc,
  onUpdateProperty,
  onUpsertDoc,
  onPerformanceDaysChange,
  performanceDays,
  properties,
  propertyTab,
  selectedPropertySlug,
}: {
  autopilotSettings: AutopilotSetting[];
  brands: BrandProfile[];
  content: ContentItem[];
  contextDocs: BrandContextDoc[];
  gscConnected: boolean;
  metrics: ContentMetricDaily[];
  onAddProperty: (
    property: PropertyConfig,
    brand: BrandProfile,
    contextDoc?: BrandContextDoc,
    autopilotPatch?: Partial<AutopilotSetting>,
  ) => void;
  onDeleteDoc: (id: string) => void;
  onPublish: (id: string) => void;
  onRunAutopilot: (property: PropertySlug) => void;
  onSelectProperty: (slug: PropertySlug) => void;
  onSelectContent: (id: string) => void;
  onSetTab: (tab: "profile" | "content" | "performance" | "settings") => void;
  onUpdateAutopilotSetting: (property: PropertySlug, patch: Partial<AutopilotSetting>) => void;
  onUpdateBrand: (property: PropertySlug, patch: Partial<BrandProfile>) => void;
  onUpdateDoc: (doc: BrandContextDoc) => void;
  onUpdateProperty: (slug: PropertySlug, patch: Partial<PropertyConfig>) => void;
  onUpsertDoc: (doc: BrandContextDoc) => void;
  onPerformanceDaysChange: (days: 7 | 30 | 90) => void;
  performanceDays: 7 | 30 | 90;
  properties: PropertyConfig[];
  propertyTab: "profile" | "content" | "performance" | "settings";
  selectedPropertySlug: PropertySlug;
}) {
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizard, setWizard] = useState({
    name: "",
    baseUrl: "",
    language: "English" as PropertyConfig["language"],
    voice: "",
    audience: "",
    pillars: "",
    contextTitle: "Brand context",
    contextMd: "",
    threshold: 75,
    autopilotEnabled: false,
    imagesEnabled: false,
  });
  const [sourceFilter, setSourceFilter] = useState<ContentSource | "all">("all");
  const selectedProperty =
    properties.find((property) => property.slug === selectedPropertySlug) ??
    properties[0];
  const autopilotSetting =
    autopilotSettings.find((setting) => setting.property === selectedProperty.slug) ??
    makeDefaultAutopilotSetting(selectedProperty.slug);
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
    tab: "profile" | "content" | "performance" | "settings";
  }[] = [
    { icon: <FileText size={16} />, label: "Brand context", tab: "profile" },
    { icon: <ListChecks size={16} />, label: "Content", tab: "content" },
    { icon: <BarChart3 size={16} />, label: "Performance", tab: "performance" },
    { icon: <Settings size={16} />, label: "Publishing", tab: "settings" },
  ];

  function handleWizardFinish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = wizard.name.trim();
    const domain = wizard.baseUrl.trim();
    const slugBase = derivePropertySlug(domain || name);
    const existingSlugs = new Set(properties.map((property) => property.slug));
    let slug = slugBase;
    let suffix = 2;
    while (existingSlugs.has(slug)) {
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }
    if (!slug) return;
    const property: PropertyConfig = {
      slug,
      name: name || domain || slug,
      domain,
      surface: "website",
      language: wizard.language,
      threshold: wizard.threshold,
      active: true,
      imagesEnabled: wizard.imagesEnabled,
      revalidateUrl: "",
      revalidateSecret: "",
    };
    onAddProperty(
      property,
      {
        property: slug,
        voice: wizard.voice,
        audience: wizard.audience,
        pillars: wizard.pillars,
        banned: "",
        cta: "",
        styleExamples: [],
        defaultCtas: [],
        visualStyleDescription: "",
        visualPalette: "",
        visualRules: "",
      },
      wizard.contextMd.trim()
        ? {
            id: makeId("doc"),
            property: slug,
            title: wizard.contextTitle.trim() || "Brand context",
            contentMd: wizard.contextMd,
            source: "written",
            active: true,
            sortOrder: 0,
            createdAt: new Date().toISOString(),
          }
        : undefined,
      { enabled: wizard.autopilotEnabled },
    );
    setWizard({
      name: "",
      baseUrl: "",
      language: "English",
      voice: "",
      audience: "",
      pillars: "",
      contextTitle: "Brand context",
      contextMd: "",
      threshold: 75,
      autopilotEnabled: false,
      imagesEnabled: false,
    });
    setWizardStep(1);
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
              <form className="space-y-4" onSubmit={handleWizardFinish}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs uppercase text-white/45">
                    Step {wizardStep} of 4
                  </p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((step) => (
                      <span
                        className={`h-1.5 w-8 ${wizardStep >= step ? "bg-emerald-300" : "bg-white/10"}`}
                        key={step}
                      />
                    ))}
                  </div>
                </div>

                {wizardStep === 1 && (
                  <div className="space-y-3">
                    <Field label="Name">
                      <input
                        className={fieldClass}
                        onChange={(event) => setWizard({ ...wizard, name: event.target.value })}
                        value={wizard.name}
                      />
                    </Field>
                    <Field label="Base URL">
                      <input
                        className={fieldClass}
                        onChange={(event) => setWizard({ ...wizard, baseUrl: event.target.value })}
                        placeholder="https://example.com"
                        value={wizard.baseUrl}
                      />
                    </Field>
                    <Field label="Language">
                      <select
                        className={fieldClass}
                        onChange={(event) =>
                          setWizard({
                            ...wizard,
                            language: event.target.value === "Spanish" ? "Spanish" : "English",
                          })
                        }
                        value={wizard.language}
                      >
                        <option>English</option>
                        <option>Spanish</option>
                      </select>
                    </Field>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-3">
                    <Field label="Voice">
                      <textarea
                        className={`${fieldClass} min-h-24`}
                        onChange={(event) => setWizard({ ...wizard, voice: event.target.value })}
                        placeholder="Clear, practical, confident without hype."
                        value={wizard.voice}
                      />
                    </Field>
                    <Field label="Audience">
                      <textarea
                        className={`${fieldClass} min-h-24`}
                        onChange={(event) => setWizard({ ...wizard, audience: event.target.value })}
                        placeholder="Founders, operators, and leaders who need better systems."
                        value={wizard.audience}
                      />
                    </Field>
                    <Field label="Pillars">
                      <input
                        className={fieldClass}
                        onChange={(event) => setWizard({ ...wizard, pillars: event.target.value })}
                        placeholder="AI operations, content strategy, founder leverage"
                        value={wizard.pillars}
                      />
                    </Field>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-3">
                    <p className="text-sm text-white/55">
                      Context docs are read on every generation, so the Engine has enough brand memory to write safely.
                    </p>
                    <Field label="Doc title">
                      <input
                        className={fieldClass}
                        onChange={(event) => setWizard({ ...wizard, contextTitle: event.target.value })}
                        value={wizard.contextTitle}
                      />
                    </Field>
                    <Field label="Context">
                      <textarea
                        className={`${fieldClass} min-h-36`}
                        onChange={(event) => setWizard({ ...wizard, contextMd: event.target.value })}
                        placeholder="Positioning, offers, terminology, origin story, and things never to say."
                        value={wizard.contextMd}
                      />
                    </Field>
                  </div>
                )}

                {wizardStep === 4 && (
                  <div className="space-y-3">
                    <Field label="Publishing posture">
                      <select
                        className={fieldClass}
                        onChange={(event) => setWizard({ ...wizard, threshold: Number(event.target.value) })}
                        value={wizard.threshold}
                      >
                        <option value={90}>Careful - hold more for review</option>
                        <option value={75}>Balanced - recommended</option>
                        <option value={50}>Trusting - publish more automatically</option>
                      </select>
                    </Field>
                    <label className="flex items-center gap-2 text-sm text-white/70">
                      <input
                        checked={wizard.autopilotEnabled}
                        className="accent-emerald-300"
                        onChange={(event) => setWizard({ ...wizard, autopilotEnabled: event.target.checked })}
                        type="checkbox"
                      />
                      Turn on Autopilot
                    </label>
                    <label className="flex items-center gap-2 text-sm text-white/70">
                      <input
                        checked={wizard.imagesEnabled}
                        className="accent-cyan-300"
                        onChange={(event) => setWizard({ ...wizard, imagesEnabled: event.target.checked })}
                        type="checkbox"
                      />
                      Allow hero images
                    </label>
                    <div className="border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100/80">
                      After finishing, deploy the site integration snippet and set the property revalidate secret.
                    </div>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    className="border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/[0.04] disabled:opacity-40"
                    disabled={wizardStep === 1}
                    onClick={() => setWizardStep((step) => Math.max(1, step - 1))}
                    type="button"
                  >
                    Back
                  </button>
                  {wizardStep < 4 ? (
                    <button
                      className="border border-emerald-300/40 bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#08100d]"
                      onClick={() => setWizardStep((step) => Math.min(4, step + 1))}
                      type="button"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      className="border border-emerald-300/40 bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#08100d]"
                      type="submit"
                    >
                      Finish
                    </button>
                  )}
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
        <div className="mb-5 grid gap-2 sm:grid-cols-4">
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
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "quick_generate", "autopilot", "api", "schedule", "repurpose"] as const).map((source) => (
                <button
                  className={`border px-3 py-2 text-sm ${
                    sourceFilter === source
                      ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                      : "border-white/10 text-white/60 hover:bg-white/[0.04]"
                  }`}
                  key={source}
                  onClick={() => setSourceFilter(source)}
                  type="button"
                >
                  {source === "all" ? "All" : sourceLabel(source)}
                </button>
              ))}
            </div>
            <ContentTable
              content={content.filter(
                (item) =>
                  item.property === selectedProperty.slug &&
                  (sourceFilter === "all" || item.source === sourceFilter),
              )}
              onPublish={onPublish}
              onSelect={onSelectContent}
            />
          </div>
        )}

        {propertyTab === "performance" && (
          <PerformanceView
            content={content}
            days={performanceDays}
            gscConnected={gscConnected}
            metrics={metrics}
            onDaysChange={onPerformanceDaysChange}
            onPropertyChange={() => undefined}
            properties={properties}
            selectedProperty={selectedProperty.slug}
          />
        )}

        {propertyTab === "settings" && (
          <div className="space-y-4">
            <div className="border border-emerald-300/20 bg-emerald-300/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-emerald-100">Autopilot</p>
                  <p className="mt-1 text-sm text-emerald-100/70">
                    {autopilotSummary(autopilotSetting)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 text-sm text-emerald-100/80">
                    <input
                      checked={autopilotSetting.enabled}
                      className="accent-emerald-300"
                      onChange={(event) =>
                        onUpdateAutopilotSetting(selectedProperty.slug, {
                          enabled: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    Enabled
                  </label>
                  <ActionButton
                    icon={<Zap size={16} />}
                    label="Run now"
                    onClick={() => onRunAutopilot(selectedProperty.slug)}
                    tone="green"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Cadence">
                  <select
                    className={fieldClass}
                    onChange={(event) =>
                      onUpdateAutopilotSetting(selectedProperty.slug, {
                        cadence: event.target.value as AutopilotCadence,
                      })
                    }
                    value={autopilotSetting.cadence}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom cron</option>
                  </select>
                </Field>
                <Field label="Pieces per cycle">
                  <input
                    className={fieldClass}
                    max={5}
                    min={1}
                    onChange={(event) =>
                      onUpdateAutopilotSetting(selectedProperty.slug, {
                        piecesPerCycle: Number(event.target.value),
                      })
                    }
                    type="number"
                    value={autopilotSetting.piecesPerCycle}
                  />
                </Field>
                {autopilotSetting.cadence === "custom" && (
                  <Field label="Custom cron">
                    <input
                      className={fieldClass}
                      onChange={(event) =>
                        onUpdateAutopilotSetting(selectedProperty.slug, {
                          customCron: event.target.value,
                        })
                      }
                      value={autopilotSetting.customCron}
                    />
                  </Field>
                )}
                <Field label="Publish time">
                  <input
                    className={fieldClass}
                    onChange={(event) =>
                      onUpdateAutopilotSetting(selectedProperty.slug, {
                        publishTime: event.target.value,
                      })
                    }
                    type="time"
                    value={autopilotSetting.publishTime}
                  />
                </Field>
                <Field label="Content type">
                  <select
                    className={fieldClass}
                    onChange={(event) =>
                      onUpdateAutopilotSetting(selectedProperty.slug, {
                        contentType: event.target.value as ContentItem["contentType"],
                      })
                    }
                    value={autopilotSetting.contentType}
                  >
                    {selectedProperty.surface === "social" ? (
                      <option value="social_post">Social post</option>
                    ) : (
                      <>
                        <option value="article">Article</option>
                        <option value="newsletter">Newsletter</option>
                      </>
                    )}
                  </select>
                </Field>
                <Field label="Max queued">
                  <input
                    className={fieldClass}
                    min={1}
                    onChange={(event) =>
                      onUpdateAutopilotSetting(selectedProperty.slug, {
                        maxQueued: Number(event.target.value),
                      })
                    }
                    type="number"
                    value={autopilotSetting.maxQueued}
                  />
                </Field>
                <Field label="Backlog priority threshold">
                  <input
                    className={fieldClass}
                    max={10}
                    min={1}
                    onChange={(event) =>
                      onUpdateAutopilotSetting(selectedProperty.slug, {
                        backlogPriorityThreshold: Number(event.target.value),
                      })
                    }
                    type="number"
                    value={autopilotSetting.backlogPriorityThreshold}
                  />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {weekDays.map((day) => (
                  <label
                    className={`flex items-center gap-2 border px-3 py-2 text-sm ${
                      autopilotSetting.publishDays.includes(day.value)
                        ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                        : "border-white/10 text-white/60"
                    }`}
                    key={day.value}
                  >
                    <input
                      checked={autopilotSetting.publishDays.includes(day.value)}
                      className="accent-emerald-300"
                      onChange={(event) => {
                        const nextDays = event.target.checked
                          ? [...autopilotSetting.publishDays, day.value]
                          : autopilotSetting.publishDays.filter((value) => value !== day.value);
                        onUpdateAutopilotSetting(selectedProperty.slug, {
                          publishDays: nextDays.length ? nextDays : [day.value],
                        });
                      }}
                      type="checkbox"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>
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
  autopilotSettings,
  cron,
  gscConnected,
  models,
  onCronChange,
  onGenerateApiKey,
  onModelsChange,
  onReset,
  onRoutingRulesChange,
  onThresholdChange,
  onUpdateAutopilotSetting,
  properties,
  routingRules,
}: {
  apiKeys: EngineState["apiKeys"];
  autopilotSettings: AutopilotSetting[];
  cron: string;
  gscConnected: boolean;
  models: ModelRegistryEntry[];
  onCronChange: (cron: string) => void;
  onGenerateApiKey: () => void;
  onModelsChange: (models: ModelRegistryEntry[]) => void;
  onReset: () => void;
  onRoutingRulesChange: (routingRules: RoutingRule[]) => void;
  onThresholdChange: (property: PropertySlug, threshold: number) => void;
  onUpdateAutopilotSetting: (property: PropertySlug, patch: Partial<AutopilotSetting>) => void;
  properties: PropertyConfig[];
  routingRules: RoutingRule[];
}) {
  const estimatedCost = estimateArticleCost(models, routingRules);
  const hasQaRule = routingRules.some((rule) => rule.task === "qa");
  const draftRule = routingRules.find((rule) => rule.task === "draft" && rule.property === "all");
  const qaRule = routingRules.find((rule) => rule.task === "qa" && rule.property === "all");
  const imageModel = models.find((model) => model.capabilities.includes("image_gen") && model.active);
  const draftModel = models.find((model) => model.id === draftRule?.modelChain[0]);
  const qaModel = models.find((model) => model.id === qaRule?.modelChain[0]);
  function updateGlobalRuleHead(task: RoutingTask, modelId: string) {
    const existing = routingRules.find((rule) => rule.task === task && rule.property === "all");
    if (!modelId) {
      if (existing) {
        onRoutingRulesChange(routingRules.filter((rule) => rule.id !== existing.id));
      }
      return;
    }
    if (existing) {
      onRoutingRulesChange(
        routingRules.map((rule) =>
          rule.id === existing.id
            ? { ...rule, modelChain: [modelId, ...rule.modelChain.filter((id) => id !== modelId)] }
            : rule,
        ),
      );
      return;
    }
    onRoutingRulesChange([
      ...routingRules,
      {
        id: makeId("rule"),
        task,
        property: "all",
        contentType: "all",
        language: "all",
        modelChain: [modelId],
        priority: 0,
        active: true,
        notes: "Simple Settings model picker.",
      },
    ]);
  }
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
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Publishing">
          <div className="space-y-3">
            {properties.map((property) => (
              <div className="border border-white/10 bg-white/[0.025] p-3" key={property.slug}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{property.domain}</p>
                    <p className="mt-1 text-sm text-white/50">
                      {thresholdLabel(property.threshold)}
                    </p>
                  </div>
                  <Badge tone="gray">{property.threshold}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["Careful", 90],
                    ["Balanced", 75],
                    ["Trusting", 50],
                  ].map(([label, value]) => (
                    <button
                      className={`border px-2 py-2 text-xs ${
                        property.threshold === value
                          ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                          : "border-white/10 text-white/60 hover:bg-white/[0.04]"
                      }`}
                      key={String(label)}
                      onClick={() => onThresholdChange(property.slug, Number(value))}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Autopilot">
          <div className="space-y-3">
            {autopilotSettings.map((setting) => {
              const property = properties.find((entry) => entry.slug === setting.property);
              return (
                <div className="border border-white/10 bg-white/[0.025] p-3" key={setting.property}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{property?.domain ?? setting.property}</p>
                    <label className="flex items-center gap-2 text-sm text-white/65">
                      <input
                        checked={setting.enabled}
                        className="accent-emerald-300"
                        onChange={(event) =>
                          onUpdateAutopilotSetting(setting.property, {
                            enabled: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                      {setting.enabled ? "On" : "Off"}
                    </label>
                  </div>
                  <p className="mt-2 text-sm text-white/55">{autopilotSummary(setting)}</p>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="AI setup">
          <div className="space-y-3 text-sm text-white/65">
            <p>
              Articles written by {draftModel?.displayName ?? "the default model"} · Checked by{" "}
              {qaModel?.displayName ?? "the default model"} · Images by{" "}
              {imageModel?.displayName ?? "not configured"}
            </p>
            <Field label="Writing model">
              <select
                className={fieldClass}
                onChange={(event) => updateGlobalRuleHead("draft", event.target.value)}
                value={draftModel?.id ?? ""}
              >
                <option value="">Default</option>
                {models.filter((model) => model.capabilities.includes("text")).map((model) => (
                  <option key={model.id} value={model.id}>{model.displayName}</option>
                ))}
              </select>
            </Field>
            <Field label="Checking model">
              <select
                className={fieldClass}
                onChange={(event) => updateGlobalRuleHead("qa", event.target.value)}
                value={qaModel?.id ?? ""}
              >
                <option value="">Default</option>
                {models.filter((model) => model.capabilities.includes("text")).map((model) => (
                  <option key={model.id} value={model.id}>{model.displayName}</option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>
      </div>

      <details className="border border-white/10 bg-white/[0.025] p-4">
        <summary className="cursor-pointer text-sm font-medium text-white/75">
          Advanced - you rarely need this
        </summary>
        <div className="mt-4 grid gap-5 xl:grid-cols-2">
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
                {(["brief", "draft", "qa", "faq", "meta", "autopilot_prompt", "image_brief", "image_gen", "image_check"] as RoutingTask[]).map((task) => (
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
          label="Clear workspace data"
          onClick={onReset}
          tone="red"
        />
      </Panel>
        </div>
      </details>
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
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="border-b border-white/10 text-white/45">
          <tr>
            <th className="py-3 pr-4 font-medium">Title</th>
            <th className="py-3 pr-4 font-medium">Property</th>
            <th className="py-3 pr-4 font-medium">Source</th>
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
                <Badge tone={item.source === "autopilot" ? "cyan" : "gray"}>
                  {sourceLabel(item.source)}
                </Badge>
              </td>
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
    <section className="rounded-[var(--radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-sm)]">
      {title && (
        <h2 className="editorial-eyebrow mb-5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rotate-45 bg-[var(--clay-500)]" aria-hidden="true" />
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
      <span className="editorial-eyebrow mb-2 block">
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
    green: "border-[var(--surface-ink)] bg-[var(--surface-ink)] text-[var(--text-on-dark)] hover:bg-[var(--ink-700)]",
    cyan: "border-[var(--clay-500)] bg-[var(--clay-500)] text-[var(--white-0)] hover:bg-[var(--clay-600)]",
    red: "border-[var(--clay-500)] bg-transparent text-[var(--clay-600)] hover:bg-[rgba(156,92,62,0.08)]",
  }[tone];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border px-4 py-2.5 text-xs font-medium uppercase tracking-[var(--tracking-wide)] ${toneClass}`}
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
    <div className="flex min-h-32 items-center justify-center border border-dashed border-[var(--border-soft)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        {label}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border-hairline)] bg-[var(--surface-card)] p-4">
      <p className="editorial-eyebrow">{label}</p>
      <p className="mt-2 line-clamp-2 text-sm text-[var(--text-primary)]">{value || "-"}</p>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-3 flex h-8 items-end gap-1">
      {values.map((value, index) => (
        <span
          className="flex-1 bg-[var(--clay-400)]"
          key={`${value}-${index}`}
          style={{ height: `${Math.max(4, (value / max) * 32)}px` }}
        />
      ))}
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
    green: "border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--ink-700)]",
    cyan: "border-[var(--clay-400)] bg-transparent text-[var(--clay-600)]",
    amber: "border-[var(--sand-200)] bg-[var(--surface-sunken)] text-[var(--ink-700)]",
    red: "border-[var(--clay-400)] bg-[rgba(156,92,62,0.08)] text-[var(--clay-600)]",
    gray: "border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)]",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-pill)] border px-3 py-1 text-xs ${toneClass}`}>
      {children}
    </span>
  );
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-[var(--text-muted)]">-</span>;
  const color =
    value >= 80 ? "text-[var(--ink-700)]" : value >= 70 ? "text-[var(--clay-500)]" : "text-[var(--clay-600)]";
  return <span className={`text-xs font-medium ${color}`}>{value}</span>;
}

const fieldClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--surface-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--clay-500)] focus:ring-2 focus:ring-[var(--focus-ring)]";

function mergeById<T extends { id: string }>(saved: T[], seeded: T[]) {
  const savedIds = new Set(saved.map((entry) => entry.id));
  return [...saved, ...seeded.filter((entry) => !savedIds.has(entry.id))];
}

function mergeContextDocs(saved: BrandContextDoc[], seeded: BrandContextDoc[]) {
  const managedIds = new Set(["context_herzen_social_strategy_2026_07_22"]);
  return mergeById(
    saved.filter((doc) => !managedIds.has(doc.id)),
    seeded,
  );
}

function normalizeState(saved: Partial<EngineState>): EngineState {
  const savedProperties = saved.properties ?? [];
  const savedPropertySlugs = new Set(savedProperties.map((property) => property.slug));
  const properties = [
    ...savedProperties,
    ...initialState.properties.filter((property) => !savedPropertySlugs.has(property.slug)),
  ].map((property) => ({
    ...property,
    surface: property.surface ?? (property.slug === "herzenco-social" ? "social" : "website"),
    imagesEnabled: property.imagesEnabled ?? false,
  }));
  const brands = properties.map((property) => {
    const savedBrand = saved.brands?.find((brand) => brand.property === property.slug);
    const seedBrand = initialState.brands.find((brand) => brand.property === property.slug);
    return {
      property: property.slug,
      voice: savedBrand?.voice?.trim() || seedBrand?.voice || "",
      audience: savedBrand?.audience?.trim() || seedBrand?.audience || "",
      pillars: savedBrand?.pillars?.trim() || seedBrand?.pillars || "",
      banned: savedBrand?.banned?.trim() || seedBrand?.banned || "",
      cta: savedBrand?.cta?.trim() || seedBrand?.cta || "",
      styleExamples: savedBrand?.styleExamples?.length
        ? savedBrand.styleExamples
        : seedBrand?.styleExamples ?? [],
      defaultCtas: savedBrand?.defaultCtas?.length
        ? savedBrand.defaultCtas
        : seedBrand?.defaultCtas ?? [],
      visualStyleDescription:
        savedBrand?.visualStyleDescription?.trim() || seedBrand?.visualStyleDescription || "",
      visualPalette: savedBrand?.visualPalette?.trim() || seedBrand?.visualPalette || "",
      visualRules: savedBrand?.visualRules?.trim() || seedBrand?.visualRules || "",
    };
  });

  return {
    properties,
    content: (saved.content ?? initialState.content)
      .filter((item) => {
        const property = properties.find((entry) => entry.slug === item.property);
        return property ? isContentTypeAllowedForProperty(property, item.contentType) : false;
      })
      .map((item) => ({
        ...item,
        imageStatus: item.imageStatus ?? "off",
        imageCheck: item.imageCheck ?? "Hero image generation is off for this property.",
        servedModels: item.servedModels ?? [],
      })),
    topics: saved.topics ?? initialState.topics,
    brands,
    contextDocs: mergeContextDocs(saved.contextDocs ?? [], initialState.contextDocs),
    metrics: saved.metrics ?? initialState.metrics,
    models: mergeById(saved.models ?? [], initialState.models),
    routingRules: mergeById(
      (saved.routingRules ?? []).filter(
        (rule) =>
          !["rule_update03_draft_openai", "rule_update03_qa_anthropic", "rule_update03_autopilot_prompt"].includes(rule.id),
      ),
      initialState.routingRules,
    ),
    autopilotSettings: properties.map((property) => {
      const savedSetting = saved.autopilotSettings?.find(
        (setting) => setting.property === property.slug,
      );
      const defaultSetting = makeDefaultAutopilotSetting(property.slug);
      return {
        ...defaultSetting,
        ...savedSetting,
        property: property.slug,
        contentType: normalizeContentTypeForProperty(
          property,
          savedSetting?.contentType ?? defaultSetting.contentType,
        ),
        publishDays: savedSetting?.publishDays?.length
          ? savedSetting.publishDays
          : defaultSetting.publishDays,
      };
    }),
    autopilotWarnings: saved.autopilotWarnings ?? initialState.autopilotWarnings,
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

function makeDefaultAutopilotSetting(property: PropertySlug): AutopilotSetting {
  const contentType = property === "herzenco-social" ? "social_post" : "article";
  return {
    property,
    enabled: false,
    cadence: "weekly",
    customCron: "",
    piecesPerCycle: 1,
    publishTime: "09:00",
    publishDays: ["tue"],
    contentType,
    maxQueued: 3,
    backlogPriorityThreshold: 7,
    nextRunAt: nextAutopilotRun({
      property,
      enabled: false,
      cadence: "weekly",
      customCron: "",
      piecesPerCycle: 1,
      publishTime: "09:00",
      publishDays: ["tue"],
      contentType,
      maxQueued: 3,
      backlogPriorityThreshold: 7,
    }),
  };
}

function makeAutopilotPromptPlan(
  state: EngineState,
  property: PropertyConfig,
  setting: AutopilotSetting,
  backlogTopic: Topic | undefined,
  index: number,
  avoidTitle?: string,
) {
  const brand = state.brands.find((entry) => entry.property === property.slug);
  const pillars = parseList(brand?.pillars ?? "");
  const pillarCounts = pillars.map((pillar) => ({
    pillar,
    count: state.content.filter(
      (item) =>
        item.property === property.slug &&
        item.status === "published" &&
        item.toneOverride.toLowerCase().includes(pillar.toLowerCase()),
    ).length,
  }));
  const suggestedPillar =
    pillarCounts.sort((a, b) => a.count - b.count)[index % Math.max(1, pillarCounts.length)]
      ?.pillar ?? pillars[index % Math.max(1, pillars.length)] ?? "brand strategy";
  const recentTitles = state.content
    .filter((item) => item.property === property.slug)
    .slice(0, 30)
    .map((item) => item.title);
  const performers = topPerformanceTopics(state, property.slug);
  const englishFrames = [
    "becomes a repeatable operating habit",
    "improves decision quality for small teams",
    "turns scattered publishing into a system",
    "creates founder leverage without hype",
    "supports clearer content operations",
  ];
  const spanishFrames = [
    "fortalece el criterio humano",
    "convierte la publicacion en un sistema",
    "ayuda a decidir con mas claridad",
    "evita automatizar sin intencion",
    "sostiene una practica editorial consciente",
  ];
  const title = backlogTopic
    ? backlogTopic.title
    : property.language === "Spanish"
      ? `Como ${suggestedPillar} ${spanishFrames[index % spanishFrames.length]}`
      : `How ${suggestedPillar} ${englishFrames[index % englishFrames.length]}`;
  const adjustedTitle = avoidTitle ? `${title} from a new operator angle` : title;
  const keywords = backlogTopic?.keywords.length
    ? backlogTopic.keywords
    : [suggestedPillar, property.language === "Spanish" ? "criterio humano" : "operating system"];
  const angle = backlogTopic?.angle || (
    property.language === "Spanish"
      ? `Una pieza practica que rota hacia ${suggestedPillar} y evita repetir temas recientes.`
      : `A practical article that rotates into ${suggestedPillar} without repeating recent coverage.`
  );
  const noveltyRationale = recentTitles.length
    ? `Differs from recent coverage by focusing on ${suggestedPillar} through ${angle.toLowerCase()}`
    : `Starts the cadence with ${suggestedPillar} as the first coverage lane.`;

  return {
    title: adjustedTitle,
    angle,
    keywords,
    pillar: suggestedPillar,
    noveltyRationale,
    prompt: [
      `Topic: ${adjustedTitle}`,
      `Angle: ${angle}`,
      `Primary keyword: ${keywords[0] ?? suggestedPillar}`,
      `Secondary keywords: ${keywords.slice(1, 4).join(", ") || "none"}`,
      `Suggested pillar: ${suggestedPillar}`,
      performers ? `Performance signal: ${performers}` : "Performance signal: not enough data yet.",
      avoidTitle ? `Avoid repeating: ${avoidTitle}` : "",
      "Write the full piece through the existing SEO/AEO gates, with an answer-first opening, FAQ block, JSON-LD readiness, and brand alignment.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function findDuplicateCandidate(
  state: EngineState,
  property: PropertySlug,
  title: string,
  keywords: string[],
) {
  const proposed = `${title} ${keywords.join(" ")}`;
  return state.content
    .filter(
      (item) =>
        item.property === property &&
        !["rejected", "failed"].includes(item.status),
    )
    .slice(0, 30)
    .find((item) => textSimilarity(proposed, `${item.title} ${item.keywords.join(" ")}`) >= 0.85);
}

function textSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokenizeForSimilarity(left));
  const rightTokens = new Set(tokenizeForSimilarity(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function tokenizeForSimilarity(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s-]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);
}

function makeAutopilotPublishAt(setting: AutopilotSetting, index: number) {
  const day = setting.publishDays[index % Math.max(1, setting.publishDays.length)] ?? "tue";
  const date = nextDateForDay(day, Math.floor(index / Math.max(1, setting.publishDays.length)));
  const [hours, minutes] = (setting.publishTime || "09:00").split(":").map(Number);
  date.setHours(hours || 9, minutes || 0, 0, 0);
  return toDatetimeLocalValue(date);
}

function nextAutopilotRun(setting: AutopilotSetting) {
  if (!setting.enabled) return setting.nextRunAt ?? "";
  return makeAutopilotPublishAt(setting, 0);
}

function nextDateForDay(day: string, weekOffset = 0) {
  const dayIndex = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(day);
  const target = dayIndex >= 0 ? dayIndex : 2;
  const date = new Date();
  const delta = (target - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta + weekOffset * 7);
  return date;
}

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function autopilotSummary(setting: AutopilotSetting) {
  const unit =
    setting.cadence === "daily"
      ? "every day"
      : setting.cadence === "weekly"
        ? "every week"
        : setting.cadence === "biweekly"
          ? "every two weeks"
          : setting.cadence === "monthly"
            ? "every month"
            : `on ${setting.customCron || "a custom cron"}`;
  const days = setting.publishDays
    .map((value) => weekDays.find((day) => day.value === value)?.label ?? value)
    .join("/");
  return `${setting.piecesPerCycle} ${setting.contentType.replace("_", " ")}${setting.piecesPerCycle === 1 ? "" : "s"} ${unit}, publishing ${days || "next open day"} at ${setting.publishTime || "09:00"}.`;
}

function topPerformanceTopics(state: EngineState, property: PropertySlug) {
  const propertyContent = state.content.filter((item) => item.property === property);
  const rows = propertyContent
    .map((item) => ({
      title: item.title,
      pageviews: state.metrics
        .filter((metric) => metric.contentItemId === item.id)
        .reduce((sum, metric) => sum + metric.pageviews, 0),
    }))
    .filter((row) => row.pageviews > 0)
    .sort((a, b) => b.pageviews - a.pageviews);
  if (!rows.length) return "";
  return `lean toward themes like "${rows[0].title}" (${rows[0].pageviews} pageviews).`;
}

function collectServedModels(
  state: EngineState,
  item: ContentItem,
  language: PropertyConfig["language"],
  includeImage: boolean,
): ModelCallLog[] {
  const tasks: RoutingTask[] = [
    ...(item.source === "autopilot" ? (["autopilot_prompt"] as RoutingTask[]) : []),
    "brief",
    "draft",
    "qa",
    ...(includeImage ? (["image_brief", "image_gen", "image_check"] as RoutingTask[]) : []),
  ];
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
  return provider === "anthropic" || provider === "openai";
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

function applyGeneratedContent(
  item: ContentItem,
  generatedText: string,
  titleWasFixed: boolean,
  language: PropertyConfig["language"],
): ContentItem {
  const extractedTitle = extractGeneratedTitle(generatedText, item.contentType);
  const title = titleWasFixed
    ? item.title
    : extractedTitle || makeFallbackGeneratedTitle(generatedText, item.contentType, language);
  const excerpt = extractGeneratedExcerpt(generatedText, item.contentType, language);
  const primaryKeyword = item.keywords[0] ?? title.split(/\s+/).slice(0, 3).join(" ");
  const metaDescription = makeGeneratedMetaDescription(excerpt, primaryKeyword, language);

  return {
    ...item,
    title,
    body: generatedText.trim(),
    excerpt,
    metaTitle: title.slice(0, 60),
    metaDescription,
    socialMeta: {
      ogTitle: title.slice(0, 60),
      ogDescription: metaDescription,
      ogType: "article",
      ...(item.socialMeta?.ogImage ? { ogImage: item.socialMeta.ogImage } : {}),
    },
  };
}

function extractGeneratedTitle(text: string, contentType: ContentItem["contentType"]) {
  if (contentType !== "social_post") {
    return cleanGeneratedTitle(text.match(/^#\s+(.+)$/m)?.[1] ?? "");
  }

  const inlineTitle = text.match(/^\s*(?:#{1,3}\s*)?(?:\*\*)?Title(?:\*\*)?\s*:\s*(.+)$/im)?.[1];
  if (inlineTitle) return cleanGeneratedTitle(inlineTitle);

  const titleSection = text.match(
    /^\s*(?:#{1,3}\s*)?(?:\*\*)?Title(?:\*\*)?\s*:?[ \t]*\n+([^\n]+)/im,
  )?.[1];
  return cleanGeneratedTitle(titleSection ?? "");
}

function cleanGeneratedTitle(value: string) {
  return value
    .replace(/^\s*(?:title\s*:\s*)/i, "")
    .replace(/^[#>*_`\s"“”']+|[#>*_`\s"“”']+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function isPublishableGeneratedTitle(title: string, request: string) {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, " ").trim();
  const normalizedTitle = normalize(title);
  const normalizedRequest = normalize(request);
  if (normalizedTitle.length < 12) return false;
  if (normalizedTitle === normalizedRequest) return false;
  if (normalizedRequest.startsWith(normalizedTitle) || normalizedTitle.startsWith(normalizedRequest)) {
    return false;
  }
  return !/^(?:write|generate|create|draft|make|i need you to|please)\b/i.test(title.trim());
}

function makeFallbackGeneratedTitle(
  text: string,
  contentType: ContentItem["contentType"],
  language: PropertyConfig["language"],
) {
  const source = contentType === "social_post" ? extractLinkedInDraft(text) : firstBodyParagraph(text);
  const words = stripMarkdown(source).split(/\s+/).filter(Boolean).slice(0, 10).join(" ");
  if (words) return words.replace(/[.:;,!?]+$/, "");
  return language === "Spanish" ? "Nueva pieza editorial" : "New editorial piece";
}

function extractGeneratedExcerpt(
  text: string,
  contentType: ContentItem["contentType"],
  language: PropertyConfig["language"],
) {
  const source = contentType === "social_post" ? extractLinkedInDraft(text) : firstBodyParagraph(text);
  const clean = stripMarkdown(source).replace(/\s+/g, " ").trim();
  if (!clean) {
    return language === "Spanish"
      ? "Una nueva pieza editorial generada para esta propiedad."
      : "A new editorial piece generated for this property.";
  }
  if (clean.length <= 240) return clean;
  const shortened = clean.slice(0, 237);
  const lastBreak = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf(" "));
  return `${shortened.slice(0, lastBreak > 120 ? lastBreak : 237).trimEnd()}...`;
}

function extractLinkedInDraft(text: string) {
  return text.match(
    /(?:^|\n)(?:#{1,3}\s*)?(?:\*\*)?LinkedIn post draft(?:\*\*)?\s*:?[ \t]*\n([\s\S]*?)(?=\n(?:#{1,3}\s*)?(?:\*\*)?(?:Primary pain angle|Why this angle should resonate|Suggested CTA)(?:\*\*)?\s*:?[ \t]*(?:\n|$)|$)/i,
  )?.[1]?.trim() ?? text;
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .trim();
}

function makeGeneratedMetaDescription(
  excerpt: string,
  primaryKeyword: string,
  language: PropertyConfig["language"],
) {
  const clean = excerpt.replace(/\s+/g, " ").trim();
  const keywordIncluded = includesKeyword(clean, primaryKeyword);
  const combined = keywordIncluded ? clean : `${primaryKeyword}: ${clean}`;
  if (combined.length >= 120) {
    return combined.length <= 155 ? combined : `${combined.slice(0, 152).trimEnd()}...`;
  }
  const ending = language === "Spanish"
    ? "Ideas prácticas para tomar mejores decisiones y avanzar."
    : "Practical guidance for clearer decisions and stronger execution.";
  return `${combined} ${ending}`.slice(0, 155).trimEnd();
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

function buildContentInstructions(
  language: string,
  contentType: ContentItem["contentType"],
  property: PropertySlug,
) {
  if (contentType === "social_post" || property === "herzenco-social") {
    return [
      "You are writing LinkedIn content for Herzen Co.",
      `Write in ${language}.`,
      "Treat the supplied LinkedIn strategy guide as the source of truth.",
      "Write directly to founders. Lead with a specific execution problem, diagnose why it happens, offer a practical fix or reframe, and end cleanly.",
      "Sound like an embedded operator who owns execution, not a consultant, dev shop, or productivity creator.",
      "Use mostly we. Use I only when it adds genuine ownership or conviction.",
      "Use no emojis, em dashes, cheesy hooks, fake stories, fluff, unsupported claims, or excessive formatting. Default to zero hashtags and never use more than three.",
      "Never mention Xyren or Xelerate. Keep build, development, and website work in the background unless explicitly requested.",
      "Default the LinkedIn draft to 150–300 words unless the request specifies otherwise.",
      "Choose formats using this target mix across batches: about 45% carousel/document, 30% custom image with strong copy, 10% genuine polls, and 15% text-only thought leadership.",
      "For carousels, write a strong slide-one hook, one idea per slide, and a final takeaway or question. For image posts, provide a specific custom image concept. For polls, use genuine options without engagement bait.",
      "Create a concise editorial title that captures the post's actual insight. The title is metadata for the content library, not the user's request. Never title a post with instructions such as Write a post, Generate, or I need you to.",
      "Return Markdown with exactly these labeled sections for each post: Title, Recommended format, Format-specific creative brief, LinkedIn post draft, Primary pain angle, Why this angle should resonate, Suggested CTA, if any.",
      "Return publishable content, not commentary about the guide or your writing process.",
    ].join("\n");
  }

  return [
    "You are the production writer for the Herzen Content Engine.",
    `Write in ${language}.`,
    "Return only the complete article in Markdown, beginning with one H1 heading.",
    "Create the final publishable H1 yourself from the underlying idea. Never reuse the editorial request as the headline or begin with instructions such as Write, Generate, Create, or I need you to.",
    "Use an answer-first opening, clear H2 sections, practical recommendations, and a useful FAQ section.",
    "Stay faithful to the supplied brand context and never invent claims, credentials, statistics, or sources.",
    "Avoid generic AI phrasing, exaggerated promises, and commentary about the writing process.",
  ].join("\n");
}

function buildArticlePrompt({
  requestedTitle,
  request,
  keywords,
  toneOverride,
  brandContext,
}: {
  requestedTitle: string;
  request: string;
  keywords: string[];
  toneOverride: string;
  brandContext: string;
}) {
  return [
    requestedTitle
      ? `FIXED TITLE: ${requestedTitle}`
      : "TITLE TASK: Create a specific, human, publishable title from the underlying idea. Never use the editorial request itself as the title, and never begin the title with instructions such as Write, Generate, Create, or I need you to.",
    `EDITORIAL REQUEST: ${request}`,
    `SEO KEYWORDS: ${keywords.join(", ") || "none supplied"}`,
    `TONE OVERRIDE: ${toneOverride || "use the brand voice"}`,
    "",
    "BRAND CONTEXT:",
    brandContext,
  ].join("\n");
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
  if (item.contentType === "social_post" || item.property === "herzenco-social") {
    return buildSocialPostEvals({ context, hardFail, item, language, score });
  }

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
      name: "Editorial title",
      score: isPublishableGeneratedTitle(item.title, item.prompt) ? 95 : 35,
      passed: isPublishableGeneratedTitle(item.title, item.prompt),
      detail: "Title is generated as publishable copy and does not repeat the internal request.",
      hard: true,
      category: "quality",
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

function buildSocialPostEvals({
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
  const body = item.body;
  const normalized = body.toLowerCase();
  const draftSection = extractLinkedInDraft(body);
  const postWords = wordCount(draftSection);
  const hasRequiredSections = [
    "title",
    "recommended format",
    "format-specific creative brief",
    "linkedin post draft",
    "primary pain angle",
    "why this angle should resonate",
    "suggested cta",
  ].every((label) => normalized.includes(label));
  const hashtagCount = draftSection.match(/(?:^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  const hasForbiddenFormatting = /\p{Extended_Pictographic}/u.test(draftSection) || draftSection.includes("—") || hashtagCount > 3;
  const mentionsRetiredBrand = /\b(?:xyren|xelerate)\b/i.test(body);
  const speaksToFounder = /\b(founder|your team|you|your)\b/i.test(draftSection);
  const executionSpecific = /\b(execution|ship|shipping|stakeholder|engineering|developer|priority|priorities|owner|ownership|progress)\b/i.test(draftSection);

  return [
    {
      name: "Brand alignment",
      score: hardFail ? 75 : Math.min(97, score + 6),
      passed: !hardFail && context.trim().length > 0 && !mentionsRetiredBrand,
      detail: hardFail
        ? "Review-first workflow: confirm the draft feels embedded, operator-led, and faithful to the strategy."
        : "The draft uses the active Herzen Co. LinkedIn strategy and avoids retired brands.",
      hard: true,
      category: "brand",
    },
    {
      name: "Editorial title",
      score: isPublishableGeneratedTitle(item.title, item.prompt) ? 95 : 35,
      passed: isPublishableGeneratedTitle(item.title, item.prompt),
      detail: "Title is generated as publishable copy and does not repeat the internal request.",
      hard: true,
      category: "quality",
    },
    {
      name: "LinkedIn output contract",
      score: hasRequiredSections ? 95 : 55,
      passed: hasRequiredSections,
      detail: "Includes title, recommended format, creative brief, post draft, pain angle, resonance rationale, and suggested CTA.",
      hard: true,
      category: "quality",
    },
    {
      name: "LinkedIn length",
      score: postWords >= 150 && postWords <= 300 ? 94 : 65,
      passed: postWords >= 150 && postWords <= 300,
      detail: `${postWords} words in the post draft; target is 150–300 unless the request overrides it.`,
      category: "quality",
    },
    {
      name: "Founder relevance",
      score: speaksToFounder && executionSpecific ? 93 : 62,
      passed: speaksToFounder && executionSpecific,
      detail: "Speaks directly to founders through a concrete execution, ownership, priority, or stakeholder/engineering problem.",
      hard: true,
      category: "brand",
    },
    {
      name: "Social style constraints",
      score: !hasForbiddenFormatting ? 96 : 45,
      passed: !hasForbiddenFormatting,
      detail: `No emojis or em dashes, with no more than three hashtags. Found ${hashtagCount} hashtag${hashtagCount === 1 ? "" : "s"}.`,
      hard: true,
      category: "quality",
    },
    {
      name: "Retired brand exclusion",
      score: !mentionsRetiredBrand ? 100 : 0,
      passed: !mentionsRetiredBrand,
      detail: "Does not mention Xyren or Xelerate.",
      hard: true,
      category: "brand",
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

function pageviewsForProperty(
  content: ContentItem[],
  metrics: ContentMetricDaily[],
  property: PropertySlug,
  days: number,
) {
  return sparklineForProperty(content, metrics, property, days)
    .reduce((sum, value) => sum + value, 0)
    .toLocaleString();
}

function sparklineForProperty(
  content: ContentItem[],
  metrics: ContentMetricDaily[],
  property: PropertySlug,
  days: number,
) {
  const propertyIds = new Set(
    content.filter((item) => item.property === property).map((item) => item.id),
  );
  const today = new Date("2026-07-14T12:00:00.000Z");
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - 1 - offset));
    const key = date.toISOString().slice(0, 10);
    return metrics
      .filter((metric) => metric.date === key && propertyIds.has(metric.contentItemId))
      .reduce((sum, metric) => sum + metric.pageviews, 0);
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
  if (property === "herzenco-social") return "LinkedIn · Herzen Co.";
  return property;
}

function sourceLabel(source: ContentSource) {
  return source.replaceAll("_", " ");
}

function thresholdLabel(threshold: number) {
  if (threshold >= 85) return "Careful: more pieces wait for approval.";
  if (threshold <= 60) return "Trusting: strong drafts publish with less review.";
  return "Balanced: recommended mix of automation and review.";
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
  if (view === "settings") return "Settings";
  return navItems.find((item) => item.view === view)?.label ?? "Workspace";
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    home: "Run the day",
    content: "Content",
    properties: "Properties",
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
