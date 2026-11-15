# FleetForward

**See the pollution and community impact behind every freight route.** FleetForward helps dispatchers compare truck routes around Los Angeles and Long Beach while keeping diesel pollution, estimated CO₂, and miles driven through disadvantaged communities visible alongside time and cost.

**Live demo:** [fleetforward-nine.vercel.app](https://fleetforward-nine.vercel.app)

## What it does

- Plan a trip from a port to a destination, with optional stops.
- Compare routes by travel time, fuel cost, estimated tailpipe CO₂, miles through high-diesel-burden tracts, and **DAC miles**: miles through disadvantaged communities.
- Explore how closures, slowdowns, departure times, and weather change those trade-offs.
- Save a route to **Today’s Plan** to see the day’s total miles, cost, CO₂, high-diesel miles, and DAC miles.

Truck routes come from ArcGIS. Community indicators come from [CalEnviroScreen 4.0](https://oehha.ca.gov/calenviroscreen/maps-data). DAC miles use tracts in the top quartile of its overall score as a demo approximation; diesel burden describes existing tract conditions, not pollution emitted by one truck. Fuel cost and CO₂ are estimates. Disruptions are simulated, and traffic uses historical patterns rather than live conditions.

## Local AI

The optional AI assistant turns plain-language requests into simulated disruptions or route priorities. It also writes a short explanation of a selected route and a summary of the saved day plan. ArcGIS and app code calculate every route and metric; the model requests tools, while code validates changes and chooses routes. Route explanations and day summaries check generated claims against the input data.

The default model is **`bolt-instruct-v2`**, served locally through [LM Studio](https://lmstudio.ai/docs/developer/core/server). The tasks are short summaries and tool calls, so a smaller instruction model with reliable tool calling could also work in principle. For example, [Qwen3 4B Instruct](https://ollama.com/library/qwen3:4b-instruct) or [Qwen3 8B](https://ollama.com/library/qwen3:8b) are possible alternatives; they have **not** been validated with this app. Set `LLM_MODEL` to the exact model ID exposed by your server. The app uses OpenAI-compatible `/v1/chat/completions` for chat and for non-Bolt summaries; Bolt summaries use `/v1/completions` with its answer-channel template.

To use **LM Studio**, download and load a model, start its server from the Developer tab (or run `lms server start`), and check `http://localhost:1234/v1/models`. Keep these values in `.env` for the default setup:

```dotenv
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=bolt-instruct-v2
```

**Ollama** exposes the same OpenAI-compatible `/v1` API on a different port. For example, run `ollama pull qwen3:4b-instruct`, start `ollama serve` if it is not already running, and use:

```dotenv
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen3:4b-instruct
```

See the [LM Studio](https://lmstudio.ai/docs/developer/openai-compat) and [Ollama](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx) API guides. **To use local AI, run this app and the model server on your own machine.** The hosted demo cannot reach a model running on a visitor’s computer, so its local AI features will not work with your LM Studio or Ollama server.

## Privacy

No login or driver profile is required. Saved trips live in this browser’s local storage; assistant chat history stays in page memory and clears on refresh or route change. When the whole app runs locally, chats travel only from the browser to the local Next.js server and local model; no external AI provider is used. The hosted demo sends chat requests to its hosted app server. Route searches send locations to ArcGIS, and day summaries include saved stop names, so **do not enter personal information or residential addresses**. The app cannot guarantee that user-entered text contains no PII.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Add ArcGIS keys to `.env` for server routing and the browser basemap, then open [localhost:3000](http://localhost:3000). AI is optional; route planning works without a model server.
