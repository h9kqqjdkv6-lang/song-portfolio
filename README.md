# Song Portfolio — Low-Altitude Economy Solution Generator

> Live demo: [songzongyuan.com](https://songzongyuan.com)
>
> Author: Song Zongyuan (Song Sterling) — Low-Altitude Economy Solution Engineer

An AI-powered **Low-Altitude Economy (低空经济)** proposal generation platform. Select a drone operation scenario, configure parameters, and instantly generate professional-grade solutions — from executive briefs to full technical proposals.

Built as a job-seeking portfolio demonstrating full-stack AI application development in the UAM / eVTOL / drone service domain.

---

## Features

### Scenario-Based Proposal Generation
- **20+ pre-built scenarios**: high-rise firefighting, logistics, agricultural spraying, power line inspection, emergency rescue, etc.
- Custom scenario mode with free-form input
- Wind speed auto-fetch (Qingdao local weather via real-time API)

### Three-Level AI Writing (Distinct Prompt Pipelines)
| Level | Output | Length | Audience |
|-------|--------|--------|----------|
| Overview | Executive brief — one-pager for leadership | ~800 tokens | Decision makers |
| Technical | Deep-dive with specs, implementation steps | ~8192 tokens | Engineering teams |
| Full | Complete proposal — from policy to ops timeline | ~8192 tokens | All stakeholders |

Each level uses its own system prompt and template, not a single prompt with length tweaks.

### AI-Driven Multi-Plan Comparison
- 4-dimensional scoring (feasibility, cost, efficiency, safety) across 2–4 aircraft candidates
- Radar chart visualization (pure Canvas, no external libs)
- Plan cards with pros/cons breakdown and score bars
- Side-by-side comparison table
- AI-generated analysis note with recommendation logic

### Compliance Check
- Regulation / airspace / certification checklist generation
- Scene-specific regulatory references

### Built-in Intelligence Pipeline
- Curated intel items on the UAM / low-altitude economy industry
- Mentor/colleague profiles from real industry mapping
- Usage tracking (via Supabase)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla JS, CSS custom properties, Canvas API |
| **Backend** | Netlify Functions (ESM · `.mjs`) |
| **AI** | DeepSeek API, streaming (SSE) + non-streaming (JSON) |
| **Data** | Supabase (PostgreSQL) |
| **Deployment** | Netlify, manual deploy (no CI/CD connected yet) |

### Architecture Highlights
- Zero external chart libraries — radar chart hand-drawn via Canvas API
- 3-tier prompt system (Overview / Technical / Full) for consistent multi-audience writing
- Global `AbortController` pattern prevents stale AI requests during scenario switching
- Compare mode returns structured JSON for deterministic rendering; all other modes stream HTML via SSE

---

## Getting Started

```bash
# 1. Clone
git clone git@github.com:h9kqqjdkv6-lang/song-portfolio.git

# 2. Install functions dependencies
cd song-portfolio
npm install

# 3. Set environment variables (Netlify or local .env)
# DEEPSEEK_API_KEY, SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY

# 4. Run locally with Netlify CLI
npx netlify dev
```

**Note:** The app requires API keys to function. The live demo runs on the author's own infrastructure.

---

## Project Structure

```
song-portfolio/
├── index.html                    # Landing page
├── generator.html                # Main proposal generator (SPA)
├── about.html                    # About / resume page
├── css/
│   └── generator-workbench.css   # All generator styles (4222 lines)
├── js/
│   └── generator/
│       └── briefing-app.js       # Generator SPA logic (3800+ lines)
├── netlify/
│   └── functions/
│       ├── generate.mjs          # AI generation (proposal/compare/compliance)
│       ├── weather.mjs           # Wind speed API proxy
│       ├── scenes.mjs            # Scenario CRUD
│       ├── intel.mjs             # Intelligence pipeline
│       ├── mentors.mjs           # Mentor profiles
│       ├── health.mjs            # Service health check
│       ├── usage.mjs             # Usage logging
│       └── cron-intel.mjs        # Scheduled intel updates
├── data/
│   ├── aircrafts.json            # Aircraft database
│   ├── scenes.json               # Scenario definitions
│   ├── regulations.json          # Regulation references
│   └── city_planning.json        # Urban planning references
├── netlify.toml
├── LICENSE                       # Apache 2.0
└── README.md
```

---

## License

[Apache 2.0](LICENSE) — © 2026 Song Zongyuan (Song Sterling)

You are free to use, modify, and distribute this code with proper attribution. Commercial use is permitted under the license terms.

---

## Contact

- Email: 834104063@qq.com
- Website: [songzongyuan.com](https://songzongyuan.com)
- Location: Qingdao, China
- Seeking: Low-Altitude Economy / UAM / eVTOL Solution Engineering roles
