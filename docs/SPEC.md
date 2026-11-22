# ctxmedic: вихідна специфікація продукту

> Це оригінальний текст специфікації, за яким збудовано v0.1. Він **обривається на
> Етапі 2, пункті 3** (ClinicalEngine). Етапи 3+ (CLI, сервер, UI, реліз) виведено з
> розділу 2 і зафіксовано в `docs/ADR.md`. Решту тексту треба дописати: issue #14.
>
> Ім'я автора тут виправлено на паспортне написання (Vitalii; раніше — Vitaliy).

---

# AUTONOMY & ORCHESTRATION DIRECTIVE

**AUTONOMY DIRECTIVE:** Усі архітектурні, продуктові та юридичні рішення зафіксовані в специфікації нижче. Не зупиняйся для уточнюючих питань. Якщо під час реалізації виникають дрібні технічні дилеми, приймай найнадійніше інженерне рішення самостійно, фіксуй його в `docs/ADR.md` і послідовно рухайся далі за планом.

Ти — Principal Software Architect, Product Strategist та Tech Lead. Твоє завдання — спроєктувати та побудувати з нуля open-source продукт **ctxmedic** для автора **Vitalii Ponomarenko** (`https://github.com/ponomarenko`, репозиторій: `https://github.com/ponomarenko/ctxmedic`, npm-пакет: `https://www.npmjs.com/package/ctxmedic`) під ліцензією **FSL-1.1-MIT**.

Працюй у режимі **оркестратора**. Розбий розробку на послідовні етапи, суворо дотримуйся контрактів даних (`TypeScript` + `Zod`) і перед написанням коду кожного етапу фіксуй архітектурні рішення. Якщо твоє середовище підтримує субагентів — делегуй їм окремі пакети монорепо зі збереженням єдиних інтерфейсів.

---

# 1. PRODUCT VISION, CLINICAL PERSONA & BUSINESS MODEL

## Концепція продукту
**ctxmedic** — агностичний локальний діагностичний центр, лінтер, автофіксер, **FinOps-оптимізатор витрат токенів** та візуальний control-plane для AI-налаштувань розробника (Claude Code, Cursor, Windsurf, Codex CLI, OpenCode, Cline, GitHub Copilot).

## Унікальний UX: «Справжній лікар-терапевт» (Clinical Persona & Triage)
Інструмент веде прийом як досвідчений, емпатичний та прагматичний лікар-діагност (мова інтерфейсу за замовчуванням — англійська, з архітектурною підтримкою локалізації `en` / `uk` через прапорець `--lang`):
- **Тріаж стану пацієнта (проєкту):** класифікує проблеми за рівнями невідкладності — 🔴 **Resuscitation / Critical** (негайне втручання), 🟡 **Therapy / Warning** (потребує лікування), 🟢 **Preventive / Info** (профілактика).
- **Клінічна картка кожного діагнозу:**
  - *Diagnosis (Діагноз)* — медично-інженерна метафора + код правила (напр. `Context Obesity [WARN_CONTEXT_BLOAT]`, `Toxic MCP Syndrome [FIN_UNUSED_MCP]`).
  - *Vitals & Lab Results (Аналізи)* — точні цифри: кількість токенів, шляхи до файлів, відсоток попадання в кеш, статистика викликів із логів.
  - *Prognosis (Прогноз без лікування)* — як це впливає на деградацію уваги моделі (Lost in the Middle), галюцинації та прямі фінансові втрати ($/міс).
  - *Prescription (Рецепт `Rx`)* — конкретна дія з прогнозом покращення **Health Score** та економії бюджету, яку можна виконати в один крок (`ctxmedic treat RX-01`).
- **Динаміка одужання:** збереження історії оглядів у `~/.ctxmedic/history.json`, щоб порівнювати поточний Health Score із попередніми візитами.
- **Інтерактивний прийом (`ctxmedic consult`):** режим опитування розробника (збір анамнезу: пріоритет економії vs максимальної якості, основний харнес, місячний бюджет) для формування індивідуального курсу лікування.

## Бізнес-модель та юридичний захист автора
- **Licensor / Original Author:** Vitalii Ponomarenko (`https://github.com/ponomarenko`)
- **Copyright Year:** 2026
- **Модель Open-Core / Source Available:**
  - *Community Edition (CLI + Local Web UI):* відкритий код під ліцензією **FSL-1.1-MIT** (Functional Source License 1.1 з автоматичним переходом у MIT через 2 роки) + **CLA.md** + **TRADEMARKS.md** (захист назви `ctxmedic` та бренду).
  - *Team / Enterprise Edition (архітектурний заділ):* майбутній комерційний рівень (командна синхронізація еталонних скілів, CI/CD security gates, централізований FinOps-моніторинг).
- **100% Privacy & Local-First:** жодна телеметрія, промти, логи сесій чи секрети ніколи не залишають машину користувача.

---

# 2. TECHNICAL ARCHITECTURE & MONOREPO STACK

- **Збірка та сумісність:** `pnpm workspaces` + TypeScript + `tsup`. CLI-пакет `ctxmedic` має запускатися через `npx ctxmedic` у стандартному **Node.js 20+** без зовнішніх системних залежностей. Зібраний фронтенд (`packages/ui/dist`) копіюється в `packages/cli/public` під час білду і роздається локальним сервером Hono при запуску `ctxmedic ui`.
- **Структура монорепо:**
  - `packages/core` — сканер ФС, резолвер симлінків, парсери (Markdown, YAML frontmatter, JSON/JSONC), підрахунок токенів (`js-tiktoken`), граф залежностей, Rule Engine та безпечний `FixEngine` (обов'язкові бекапи у `.ctxmedic/backups/<timestamp>/` перед модифікацією файлів + перевірка `git status`).
  - `packages/harnesses` — декларативний реєстр профілів харнесів (Claude Code, Cursor, Windsurf, Codex CLI, OpenCode, GitHub Copilot): глобальні та проєктні шляхи конфігів, ліміти контексту, правила завантаження скілів.
  - `packages/finops` — офлайн-аналізатор логів використання AI та економії токенів (з інкрементальним кешуванням пропарсених файлів у `~/.ctxmedic/cache.json` за `mtime` + розміром).
  - `packages/clinical` — рушій медичної інтерпретації: перетворює сирі метрики та спрацювання правил у клінічні діагнози, прогнози, рецепти (`Rx`), розраховує Health Score (0–100) та керує опитувальником `consult`.
  - `packages/cli` — термінальний інтерфейс (`commander` або `citty` + `@clack/prompts` + стилізовані медичні картки виводу).
  - `packages/server` — легкий локальний HTTP/WebSocket API-сервер (Hono) для Web UI.
  - `packages/ui` — SPA на React + Vite + Tailwind CSS + Lucide Icons + React Flow.

---

# 3. DIAGNOSTIC & FINOPS ENGINE SPECIFICATIONS

## Модуль А: Діагностика конфігурацій та архітектури (`packages/core`)
1. **Broken Links & Symlink Drift (`ERR_BROKEN_LINK`):** биті симлінки, циклічні посилання, абсолютні шляхи замість відносних.
2. **Context Obesity (`WARN_CONTEXT_BLOAT`):** перевищення порогів токенів у базових інструкціях (>3,500 токенів на старті сесії).
3. **Instruction Duplication (`WARN_DUPLICATE_RULES`):** дублювання тексту (>75% схожості) між `CLAUDE.md`, `AGENTS.md` та `.cursorrules` із рецептом міграції у канонічну структуру Hub-and-Spoke (`.ai/` + симлінки).
4. **Skill Schema & Trigger Hygiene (`ERR_INVALID_SKILL`):** валідація `SKILL.md` (YAML frontmatter, унікальність імен, якість описів тригерів).
5. **Secret Exposure (`CRIT_SECRET_LEAK`):** пошук API-ключів у незаігнорених конфігах або MCP.
6. **Cross-Harness Syntax Conflict (`INFO_UNSUPPORTED_SYNTAX`):** виявлення специфічних директив одного агента (напр. `@import` або `alwaysApply`) у файлах, які читає інший агент без їх підтримки.
7. **Опційний AI-консиліум (`ctxmedic consult --ai`):** підключення локальної моделі (Ollama) або BYOK (Anthropic/OpenAI) за явним запитом для пошуку логічних суперечностей між правилами та застарілих промт-костилів.

## Модуль Б: FinOps & Економія токенів (`packages/finops`)
Офлайн-парсинг локальних логів сесій:
- **Claude Code:** `~/.claude/projects/**/*.jsonl`
- **Codex CLI:** `~/.codex/sessions/**/rollout-*.jsonl`
- **Cursor:** `~/.cursor/projects/*/agent-transcripts/*.jsonl`

Виявлення патернів перевитрат і генерація рецептів економії ($ та %):
1. **Toxic / Unused MCP Syndrome (`FIN_UNUSED_MCP`):** підключений MCP-сервер додає тисячі токенів схем у кожен запит, але викликався 0 разів за 14/30 днів. *Рецепт:* перенести з глобального конфігу у локальний для конкретного проєкту.
2. **Model Overkill (`FIN_MODEL_OVERKILL`):** використання дорогих frontier/reasoning моделей (Opus, o3) для тривіальних одноходових задач або рутинних скілів. *Рецепт:* перепризначити легші моделі (Sonnet/Haiku/mini) для відповідних скілів/субагентів.
3. **Context Snowball (`FIN_CONTEXT_SNOWBALL`):** затяжні сесії (>35 кроків) без `/clear` або `/compact`, де кожен крок тягне 100k+ токенів історії. *Рецепт:* рекомендації щодо точок скидання контексту та налаштування автокомпактизації.
4. **Prompt Cache Thrashing (`FIN_CACHE_MISS`):** низький `Cache Hit Ratio` (<40%) через динамічні вставки на початку системних інструкцій або часте перемикання моделей. *Рецепт:* реструктуризація порядку інструкцій для максимального кешування.
5. **Bloat Indexing (`FIN_BLOAT_IGNORE`):** відсутність `.cursorignore` або правил виключення для `lock`-файлів, `dist/`, артефактів білду. *Рецепт:* автогенерація оптимального ignore-файлу.

---

# 4. EXECUTION PLAN (ПОЕТАПНЕ ВИКОНАННЯ)

### Етап 1: Ініціалізація монорепо, Legal-захист та Схеми даних
1. Налаштуй `pnpm` монорепо (`packages/core`, `harnesses`, `finops`, `clinical`, `cli`, `server`, `ui`), `tsconfig.base.json`, `vitest` та скрипти збірки/публікації в npm (`ctxmedic`) із метаданими автора: `Vitalii Ponomarenko <https://github.com/ponomarenko>`.
2. Згенеруй повний пакет юридичних файлів у корені репозиторію:
   - `LICENSE` — повний текст **FSL-1.1-MIT** із зазначенням правовласника: `Copyright (c) 2026 Vitalii Ponomarenko (https://github.com/ponomarenko)`.
   - `NOTICE` — офіційне повідомлення про авторство Vitalii Ponomarenko.
   - `LICENSE_COMMERCIAL.md` — умови отримання комерційної/командної ліцензії від Vitalii Ponomarenko.
   - `CLA.md` — Contributor License Agreement для захисту прав Vitalii Ponomarenko.
   - `TRADEMARKS.md` — захист назви `ctxmedic` та бренду.
   - `SECURITY.md`, `CONTRIBUTING.md` та `.github/workflows/ci.yml`.
3. Реалізуй базові контракти даних у `packages/core` та `packages/clinical` (`ClinicalDiagnosis`, `PrescriptionRx`, `PatientVitals`, `FinOpsReport`, `HarnessProfile`).

### Етап 2: Core Scanner, FinOps Engine & Clinical Persona
1. Реалізуй сканер ФС і профілі 6 харнесів (`packages/harnesses`).
2. Реалізуй 7 правил діагностики конфігів та парсери логів (`packages/finops`) з розрахунком реальних витрат, Cache Hit Ratio та потенційної економії в доларах.
3. Реалізуй `ClinicalEngine` (`packages/clinical`), який формує **

<!-- Текст специфікації обривається тут. Продовження: issue #14. -->
