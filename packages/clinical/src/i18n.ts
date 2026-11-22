import type { Finding, RuleId } from "@ctxmedic/core";
import type { Lang, Triage } from "./schema.js";

export interface CardText {
  name: string;
  prognosis: (f: Finding) => string;
  action: (f: Finding) => string;
}

const d = (f: Finding, k: string) => f.data[k] as any;
const n = (x: unknown) => Number(x ?? 0).toLocaleString("en");
const usd = (x: unknown) => `$${Number(x ?? 0).toFixed(2)}`;
const pct = (x: unknown) => `${Math.round(Number(x ?? 0) * 100)}%`;

const en: Record<RuleId, CardText> = {
  ERR_BROKEN_LINK: {
    name: "Symlink Necrosis",
    prognosis: (f) =>
      d(f, "absolute")
        ? "Works on this machine only. Teammates and CI silently lose these instructions."
        : "The agent silently loses these instructions and runs without them. You will see it ignore rules you think are active.",
    action: (f) => (f.fix ? "Rewrite the link as a relative symlink." : `Restore the target or delete the dead link: ${f.files[0]}`),
  },
  WARN_CONTEXT_BLOAT: {
    name: "Context Obesity",
    prognosis: (f) =>
      `${n(d(f, "tokens"))} tokens ride along with every request. Rules in the middle get "lost in the middle", attention drifts and the bill grows with each turn.`,
    action: () => "Move rarely-needed sections into skills or path-scoped rules; keep the always-on core under 3,500 tokens.",
  },
  WARN_DUPLICATE_RULES: {
    name: "Instruction Duplication Syndrome",
    prognosis: (f) => `${n(d(f, "wastedTokens"))} duplicated tokens. The copies drift apart and the agents get contradictory orders.`,
    action: (f) => (f.fix ? `Merge into ${d(f, "hub")} (hub) and symlink every tool's file to it (spokes).` : "Keep one canonical file and symlink the others to it."),
  },
  ERR_INVALID_SKILL: {
    name: "Skill Amnesia",
    prognosis: () => "The harness cannot discover or trigger this skill reliably. It costs tokens and never helps.",
    action: (f) => `Fix the SKILL.md frontmatter: ${d(f, "problem")}.`,
  },
  CRIT_SECRET_LEAK: {
    name: "Credential Hemorrhage",
    prognosis: (f) =>
      d(f, "exposed")
        ? "One `git add .` away from a public leak. Leaked keys are found by scanners within minutes."
        : "Plain-text keys in config files end up in backups, screenshots and support bundles.",
    action: () => "Rotate the key now, then reference it through an environment variable (`${VAR}`) and git-ignore the file.",
  },
  INFO_UNSUPPORTED_SYNTAX: {
    name: "Cross-Harness Allergy",
    prognosis: (f) => `${d(f, "harness")} reads ${(d(f, "directives") ?? []).join(", ")} as plain text: noise at best, wrong instructions at worst.`,
    action: () => "Move tool-specific directives into that tool's own file, or keep shared files directive-free.",
  },
  FIN_BLOAT_IGNORE: {
    name: "Indexing Bloat",
    prognosis: (f) => `${d(f, "harness")} indexes build output and lockfiles. Search results fill with junk and retrieval burns tokens.`,
    action: (f) => `Create ${d(f, "ignoreFile")} with the standard exclusions.`,
  },
  FIN_UNUSED_MCP: {
    name: "Toxic MCP Syndrome",
    prognosis: (f) => `~${n(d(f, "schemaTokens"))} tokens of tool schemas in every request for a server nobody calls.`,
    action: (f) =>
      d(f, "scope") === "global"
        ? `Move "${d(f, "server")}" from the global config into the project-level MCP config of the projects that need it.`
        : `Remove "${d(f, "server")}" from ${f.files[0]} or disable it until needed.`,
  },
  FIN_MODEL_OVERKILL: {
    name: "Model Overkill",
    prognosis: (f) => `${d(f, "sessions")} trivial sessions paid frontier prices (${usd(d(f, "costUsd"))} in ${d(f, "days")} days).`,
    action: (f) => `Route one-shot tasks, routine skills and subagents to ${d(f, "suggested")} (set \`model:\` in the skill/agent frontmatter).`,
  },
  FIN_CONTEXT_SNOWBALL: {
    name: "Context Snowball",
    prognosis: (f) => `Worst case: ${d(f, "worstSteps")} steps, peak context ${n(d(f, "worstMaxContext"))} tokens. Each step re-reads the whole history; quality drops as it grows.`,
    action: () => "Run /compact at task milestones and /clear between unrelated tasks; enable auto-compact.",
  },
  FIN_CACHE_MISS: {
    name: "Prompt Cache Thrashing",
    prognosis: (f) => `Cache hit ratio ${pct(d(f, "cacheHitRatio"))}: you pay full price for context the provider could serve at ~10%.`,
    action: () => "Keep instructions static: no dates, branch names or random IDs at the top; avoid switching models mid-session.",
  },
};

const uk: Record<RuleId, CardText> = {
  ERR_BROKEN_LINK: {
    name: "Некроз симлінків",
    prognosis: (f) =>
      d(f, "absolute")
        ? "Працює лише на цій машині. Колеги та CI мовчки втрачають ці інструкції."
        : "Агент мовчки втрачає ці інструкції й працює без них. Ви побачите, як він ігнорує правила, які вважаєте активними.",
    action: (f) => (f.fix ? "Переписати посилання як відносний симлінк." : `Відновіть ціль або видаліть мертве посилання: ${f.files[0]}`),
  },
  WARN_CONTEXT_BLOAT: {
    name: "Ожиріння контексту",
    prognosis: (f) =>
      `${n(d(f, "tokens"))} токенів їдуть із кожним запитом. Правила посередині «губляться», увага моделі розмивається, а рахунок росте з кожним кроком.`,
    action: () => "Винесіть рідко потрібні розділи у скіли або правила з path-scope; тримайте завжди-активне ядро до 3 500 токенів.",
  },
  WARN_DUPLICATE_RULES: {
    name: "Синдром дублювання інструкцій",
    prognosis: (f) => `${n(d(f, "wastedTokens"))} дубльованих токенів. Копії розходяться, і агенти отримують суперечливі накази.`,
    action: (f) => (f.fix ? `Об'єднати в ${d(f, "hub")} (hub) і зробити файли кожного інструмента симлінками на нього (spokes).` : "Залиште один канонічний файл, інші зробіть симлінками на нього."),
  },
  ERR_INVALID_SKILL: {
    name: "Амнезія скілу",
    prognosis: () => "Харнес не може надійно знайти чи викликати цей скіл. Він коштує токенів і не допомагає.",
    action: (f) => `Виправте frontmatter у SKILL.md: ${d(f, "problem")}.`,
  },
  CRIT_SECRET_LEAK: {
    name: "Кровотеча облікових даних",
    prognosis: (f) =>
      d(f, "exposed")
        ? "Один `git add .` до публічного витоку. Сканери знаходять ключі за лічені хвилини."
        : "Ключі відкритим текстом потрапляють у бекапи, скриншоти та звіти підтримки.",
    action: () => "Негайно ротуйте ключ, потім посилайтеся на нього через змінну оточення (`${VAR}`) і додайте файл у .gitignore.",
  },
  INFO_UNSUPPORTED_SYNTAX: {
    name: "Крос-харнесна алергія",
    prognosis: (f) => `${d(f, "harness")} читає ${(d(f, "directives") ?? []).join(", ")} як звичайний текст: у кращому разі шум, у гіршому — хибні інструкції.`,
    action: () => "Перенесіть специфічні директиви у власний файл відповідного інструмента або тримайте спільні файли без директив.",
  },
  FIN_BLOAT_IGNORE: {
    name: "Індексаційне здуття",
    prognosis: (f) => `${d(f, "harness")} індексує артефакти збірки та lock-файли. Пошук засмічується, а retrieval палить токени.`,
    action: (f) => `Створити ${d(f, "ignoreFile")} зі стандартними виключеннями.`,
  },
  FIN_UNUSED_MCP: {
    name: "Токсичний MCP-синдром",
    prognosis: (f) => `~${n(d(f, "schemaTokens"))} токенів схем інструментів у кожному запиті до сервера, який ніхто не викликає.`,
    action: (f) =>
      d(f, "scope") === "global"
        ? `Перенесіть "${d(f, "server")}" з глобального конфігу у проєктний MCP-конфіг тих проєктів, яким він потрібен.`
        : `Видаліть "${d(f, "server")}" з ${f.files[0]} або вимкніть, доки не знадобиться.`,
  },
  FIN_MODEL_OVERKILL: {
    name: "Модельний перебір",
    prognosis: (f) => `${d(f, "sessions")} тривіальних сесій оплачено за frontier-цінами (${usd(d(f, "costUsd"))} за ${d(f, "days")} днів).`,
    action: (f) => `Перепризначте одноходові задачі, рутинні скіли та субагенти на ${d(f, "suggested")} (поле \`model:\` у frontmatter).`,
  },
  FIN_CONTEXT_SNOWBALL: {
    name: "Сніжний ком контексту",
    prognosis: (f) => `Найгірший випадок: ${d(f, "worstSteps")} кроків, пік контексту ${n(d(f, "worstMaxContext"))} токенів. Кожен крок перечитує всю історію; якість падає.`,
    action: () => "Робіть /compact на етапах задачі та /clear між різними задачами; увімкніть auto-compact.",
  },
  FIN_CACHE_MISS: {
    name: "Трешинг кешу промтів",
    prognosis: (f) => `Влучання в кеш ${pct(d(f, "cacheHitRatio"))}: ви платите повну ціну за контекст, який провайдер віддав би за ~10%.`,
    action: () => "Тримайте інструкції статичними: без дат, назв гілок і випадкових ID на початку; не перемикайте моделі посеред сесії.",
  },
};

const ui = {
  en: {
    triage: { resuscitation: "🔴 Resuscitation", therapy: "🟡 Therapy", preventive: "🟢 Preventive" } as Record<Triage, string>,
    diagnosis: "Diagnosis",
    labs: "Vitals & Lab Results",
    prognosis: "Prognosis",
    rx: "Prescription",
    health: "Health Score",
    savings: "Potential savings",
    perMonth: "/mo",
    healthy: "No complaints. The patient is healthy.",
    opinion: (s: number): string =>
      s >= 90 ? "Excellent condition. Only preventive care needed." : s >= 70 ? "Stable, but a few conditions need therapy." : s >= 40 ? "The patient needs treatment soon." : "Critical condition. Start with the red cards right now.",
    since: (d: number): string => (d === 0 ? "unchanged since the last visit" : d > 0 ? `+${d} since the last visit` : `${d} since the last visit`),
    autoFix: "auto-fix available",
    manual: "manual treatment",
  },
  uk: {
    triage: { resuscitation: "🔴 Реанімація", therapy: "🟡 Терапія", preventive: "🟢 Профілактика" } as Record<Triage, string>,
    diagnosis: "Діагноз",
    labs: "Аналізи",
    prognosis: "Прогноз",
    rx: "Рецепт",
    health: "Індекс здоров'я",
    savings: "Потенційна економія",
    perMonth: "/міс",
    healthy: "Скарг немає. Пацієнт здоровий.",
    opinion: (s: number): string =>
      s >= 90 ? "Відмінний стан. Потрібна лише профілактика." : s >= 70 ? "Стабільний стан, але кілька проблем потребують терапії." : s >= 40 ? "Пацієнт потребує лікування найближчим часом." : "Критичний стан. Почніть з червоних карток просто зараз.",
    since: (d: number): string => (d === 0 ? "без змін з минулого візиту" : d > 0 ? `+${d} з минулого візиту` : `${d} з минулого візиту`),
    autoFix: "є автофікс",
    manual: "ручне лікування",
  },
};

export type UiText = (typeof ui)["en"];
export const cards = (lang: Lang) => (lang === "uk" ? uk : en);
export const t = (lang: Lang): UiText => ui[lang];
export const resolveLang = (x?: string): Lang => ((x ?? process.env.CTXMEDIC_LANG ?? "en").startsWith("uk") ? "uk" : "en");
