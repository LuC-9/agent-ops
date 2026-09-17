# Technical Proposal: Onboarding Smart Search & i-Assist Voice Bot to Northstar Observability

**Author:** Aarsh Mishra  
**Date:** 2026-09-17  
**Status:** Draft — Pending Review  

---

## Executive Summary

This technical proposal details the end-to-end onboarding strategy for two critical enterprise AI platforms at **ICICI Prudential Asset Management Company (AMC)** under the **Northstar Observability Platform**:

1. **Smart Search Platform**: A hybrid semantic and lexical AI search engine powering mutual fund discovery, document resolution, and intelligent re-ranking across AMC web, mobile, and virtual assistant touchpoints.
2. **i-Assist Digital Voice Bot**: A real-time, voice-first conversational AI assistant powered by LiveKit audio streams, photorealistic interactive digital avatars, and Model Context Protocol (MCP) microservice gateways for portfolio valuation, transaction tracking, and scheme recommendations.

By leveraging the onboarding framework established in the master [Northstar Technical Proposal](file:///c:/Users/LuC/Downloads/agent-ops/docs/AGENT_ONBOARDING_70_TECHNICAL_PROPOSAL.md), both platforms will be integrated using **Approach A (Northstar SDK)** with specialized middleware and protocol handlers (REST Gateway Middleware for Smart Search; LiveKit + MCP Event Hooks for i-Assist). All telemetry will be funneled into Northstar's **Centralized Unified Database** via the **Medallion Data Pipeline (Bronze → Silver → Gold)**.

---

## Table of Contents

1. [System Overview & Capability Comparison](#1-system-overview--capability-comparison)
2. [Project 1: Smart Search Platform Onboarding Strategy](#2-project-1-smart-search-platform-onboarding-strategy)
3. [Project 2: i-Assist Digital Voice Bot Onboarding Strategy](#3-project-2-i-assist-digital-voice-bot-onboarding-strategy)
4. [Centralized Medallion Data Pipeline Integration](#4-centralized-medallion-data-pipeline-integration)
5. [Regulatory Compliance, PII Masking & Security](#5-regulatory-compliance-pii-masking--security)
6. [Rollout Plan & 14-Week Schedule Alignment](#6-rollout-plan--14-week-schedule-alignment)
7. [Verification & Validation Plan](#7-verification--validation-plan)

---

## 1. System Overview & Capability Comparison

| Dimension | Smart Search Platform | i-Assist Digital Voice Bot |
|:---|:---|:---|
| **Primary Function** | Hybrid semantic & lexical search engine with AI re-ranking | Voice-first conversational AI assistant & interactive digital avatar |
| **Interaction Paradigm** | Asynchronous / RESTful API query & result cards | Real-time bi-directional audio streaming (LiveKit WebSockets / WebRTC) |
| **Backend Integration** | Vector search DB, CMS, fund factsheet repositories | Model Context Protocol (MCP) gateway to AMC portfolio/transaction engines |
| **Key Metrics Tracked** | Multi-phase latency (query encoding, vector search, re-ranking), match confidence, zero-results | Turn-by-turn latencies (STT, LLM reasoning, MCP tools, TTS), audio session state, XIRR % |
| **Compliance Requirement** | SEBI financial guardrails against biased queries ("best fund") | Investor PII masking (PAN, Folio, Nominee details), financial advice disclaimers |
| **Primary Onboarding Approach** | **Approach A (SDK REST Gateway Middleware)** | **Approach A (SDK LiveKit & MCP Plugin)** |

```mermaid
flowchart TB
    subgraph Clients["Digital Touchpoints"]
        Web["AMC Website"]
        Mobile["Investor Mobile App"]
        Avatar["Digital Avatar UI"]
    end

    subgraph EnterprisePlatforms["Enterprise AI Systems"]
        SmartSearch["Smart Search Platform<br/>(REST Channel Gateway)"]
        VoiceBot["i-Assist Digital Voice Bot<br/>(LiveKit Voice Engine)"]
        MCP["MCP Gateway<br/>(Portfolio & Transaction Microservices)"]
        
        VoiceBot -->|"Tool Execution"| MCP
    end

    subgraph InstrumentationLayer["Northstar Integration Layer"]
        SearchMiddleware["Northstar Search SDK Middleware<br/>(captures encoding, retrieval & rerank)"]
        VoicePlugin["Northstar LiveKit + MCP Plugin<br/>(captures STT, LLM, MCP tools & TTS)"]
        
        SmartSearch --> SearchMiddleware
        VoiceBot --> VoicePlugin
    end

    subgraph CentralEngine["Centralized Northstar Platform"]
        IngestGateway["Ingestion Gateway<br/>(POST /api/ingest)"]
        Bronze["🥉 Bronze Raw Layer"]
        Silver["🥈 Silver Cleaning & Parameter Harmonization Engine"]
        Gold["🥇 Gold Analytics Engine (GoldSpan, GoldLog, GoldMetric)"]
        Dashboard["Northstar Fleet Dashboard"]
        
        SearchMiddleware -->|"HTTPS"| IngestGateway
        VoicePlugin -->|"HTTPS"| IngestGateway
        IngestGateway --> Bronze --> Silver --> Gold --> Dashboard
    end

    Web --> SmartSearch
    Mobile --> SmartSearch
    Web --> VoiceBot
    Mobile --> Avatar --> VoiceBot
```

---

## 2. Project 1: Smart Search Platform Onboarding Strategy

### 2.1 Onboarding Approach Selection

* **Primary Approach**: **Approach A (Northstar SDK via API Gateway Middleware)**.
* **Fallback Approach**: **Approach C (Fluent Bit Log Shipper)** if source code changes are restricted on production API gateways.
* **Tier Classification**: **Tier 1 (Full Source Access)**.

Smart Search executes multi-phase search workflows (Query Representation → Vector Retrieval → Intelligent Re-Ranking → Response Payload Construction). By inserting the Northstar SDK middleware directly into the API gateway (FastAPI / Express), each search query is recorded as a trace with granular step timings and match relevance scores.

### 2.2 Integration Architecture & Code Specification

#### Python (FastAPI) API Gateway Integration

```python
from fastapi import FastAPI, Request
from northstar_sdk import NorthstarClient, Recorder
from northstar_sdk.integrations.fastapi import NorthstarMiddleware

app = FastAPI(title="Smart Search API Gateway")

# Initialize Central Northstar Client
ns_client = NorthstarClient(
    northstar_url="https://northstar.internal:43147",
    api_key="ns_key_smart_search_prod_01"
)

# Register Agent Identity & Graph Topology on startup
ns_client.register(
    slug="smart-search-platform",
    name="Smart Search Platform",
    role="semantic_search",
    version="3.2.0",
    graph={
        "nodes": ["query_encoding", "vector_search", "re_ranking", "compliance_screen"],
        "edges": [
            {"from": "START", "to": "query_encoding"},
            {"from": "query_encoding", "to": "vector_search"},
            {"from": "vector_search", "to": "re_ranking"},
            {"from": "re_ranking", "to": "compliance_screen"},
            {"from": "compliance_screen", "to": "END"}
        ]
    }
)
ns_client.start_heartbeat()

@app.post("/api/v1/search")
async def handle_search(request: Request):
    data = await request.json()
    user_query = data.get("query", "")
    channel = data.get("channel", "web")
    
    recorder = Recorder(ns_client, slug="smart-search-platform")
    recorder.start(request=f"[{channel.upper()}] {user_query}")
    
    try:
        # Phase 1: Query Representation
        with recorder.node("query_encoding"):
            expanded_query = query_encoder.expand_synonyms_and_acronyms(user_query)
            recorder.log("info", "Query expanded", {"expanded": expanded_query})
        
        # Phase 2: Vector & Lexical Retrieval
        with recorder.node("vector_search"):
            candidates = search_engine.retrieve_candidates(expanded_query)
            recorder.log("info", f"Retrieved {len(candidates)} candidates")
        
        # Phase 3: Intelligent Re-Ranking
        with recorder.node("re_ranking"):
            ranked_results, top_confidence = reranker.score_and_rank(candidates, user_query)
            recorder.log("info", "Re-ranking complete", {"top_confidence": top_confidence})
        
        # Phase 4: Compliance Screen & Guardrails
        with recorder.node("compliance_screen"):
            is_blocked, warning_msg = compliance_guard.screen_query(user_query)
            if is_blocked:
                recorder.log("warn", "Non-compliant query screened", {"rule": warning_msg})
        
        # Determine status & response summary
        response_summary = f"Returned {len(ranked_results)} items (Top confidence: {top_confidence:.2f})"
        recorder.end(
            response=response_summary,
            status="ok" if not is_blocked else "degraded",
            accuracy=int(top_confidence * 100)
        )
        return {"results": ranked_results, "confidence": top_confidence}
        
    except Exception as e:
        recorder.end(response=f"Search Error: {str(e)}", status="error", error=str(e))
        raise e
```

### 2.3 Telemetry Mapping & Parameter Harmonization

| Smart Search Telemetry Field | Northstar Harmonized Field (Silver Layer) | Target Gold Field (`GoldSpan`) | Transformation & Business Logic |
|:---|:---|:---|:---|
| `user_query` / `raw_query` | `request` | `input_text` | Prefixed with channel indicator e.g. `[WEB] how to save tax` |
| `top_result_summary` | `response` | `output_text` | Summary of top ranked scheme/document and confidence score |
| `query_encoding_ms` | `logs[node="query_encoding"]` | `attributes_json.encoding_ms` | Formatted as structured step log in trace |
| `vector_search_ms` | `logs[node="vector_search"]` | `attributes_json.retrieval_ms` | Captures vector retrieval duration |
| `re_ranking_ms` | `logs[node="re_ranking"]` | `attributes_json.rerank_ms` | Captures AI re-rank model latency |
| `total_search_latency` | `duration_ms` | `duration_ms` | Sum of all search phase execution durations |
| `top_confidence_score` | `accuracy` | `attributes_json.confidence` | Mapped to 0-100 scale for Trust Scoring |
| `screened_query_flag` | `degraded` | `status_code` | Set to `"degraded"` if regulatory guardrail triggered |
| `zero_result_flag` | `logs[level="warn"]` | `attributes_json.zero_results` | Logged as warning for content gap analysis |

---

## 3. Project 2: i-Assist Digital Voice Bot Onboarding Strategy

### 3.1 Onboarding Approach Selection

* **Primary Approach**: **Approach A (Northstar SDK with LiveKit & MCP Plugin)**.
* **Tier Classification**: **Tier 1 (Full Source Access - Real-Time Audio Agent)**.

i-Assist operates as a voice-first conversational AI agent that streams real-time speech over WebRTC/LiveKit and executes financial operations via the Model Context Protocol (MCP) gateway. This directly aligns with **Scenario 2 (LiveKit Real-Time Agent)** of the master proposal. Each conversational turn produces a Northstar trace, capturing sub-second phase latencies across Speech-to-Text (STT), LLM reasoning, MCP tool calls, and Text-to-Speech (TTS).

### 3.2 Integration Architecture & Code Specification

```mermaid
sequenceDiagram
    participant Investor as Investor (Voice / Avatar)
    participant VoiceBot as i-Assist Voice Bot Engine
    participant MCP as MCP Microservice Gateway
    participant SDK as Northstar SDK (LiveKit Plugin)
    participant CentralNS as Central Northstar Engine
    
    Investor->>VoiceBot: Speaks input query ("What is my NAV and portfolio value?")
    VoiceBot->>SDK: plugin.on_turn_start(session_id)
    
    Note over VoiceBot: Step 1: STT Transcription
    VoiceBot->>SDK: log_node("stt", transcript="What is my NAV...")
    
    Note over VoiceBot: Step 2: Reasoning & MCP Tool Call
    VoiceBot->>MCP: Call mcp_get_portfolio_valuation(pan="*****")
    MCP-->>VoiceBot: Return {aum: "₹12.4L", xirr: "14.2%"}
    VoiceBot->>SDK: log_node("mcp_gateway", tool="get_portfolio", latency=45ms)
    
    Note over VoiceBot: Step 3: Response Generation & TTS Synthesis
    VoiceBot->>SDK: log_node("tts", text="Your portfolio valuation is ₹12.4 Lakhs...")
    
    VoiceBot->>Investor: Plays vocalized audio response & avatar animation
    VoiceBot->>SDK: plugin.on_turn_complete()
    SDK->>CentralNS: POST /api/ingest (Full turn-by-turn trace)
```

#### Python LiveKit + MCP Integration Code

```python
from northstar_sdk import NorthstarClient
from northstar_sdk.integrations.livekit import NorthstarLiveKitPlugin
from northstar_sdk.integrations.mcp import NorthstarMCPTracer

# Initialize Client
client = NorthstarClient(
    northstar_url="https://northstar.internal:43147",
    api_key="ns_key_i_assist_voicebot_prod_02"
)

# Register i-Assist Voice Bot
client.register(
    slug="i-assist-voice-bot",
    name="i-Assist Digital Voice Bot",
    role="voice_assistant",
    version="4.1.0",
    graph={
        "nodes": ["stt", "cognitive_reasoning", "mcp_gateway", "tts"],
        "edges": [
            {"from": "START", "to": "stt"},
            {"from": "stt", "to": "cognitive_reasoning"},
            {"from": "cognitive_reasoning", "to": "mcp_gateway"},
            {"from": "mcp_gateway", "to": "cognitive_reasoning"},
            {"from": "cognitive_reasoning", "to": "tts"},
            {"from": "tts", "to": "END"}
        ]
    }
)
client.start_heartbeat()

# Attach LiveKit & MCP Plugins
voice_plugin = NorthstarLiveKitPlugin(client, slug="i-assist-voice-bot")
mcp_tracer = NorthstarMCPTracer(client, slug="i-assist-voice-bot")

@voice_plugin.on_conversational_turn
def handle_voice_turn(turn_event):
    """Fired automatically upon completion of each conversational voice turn."""
    recorder = client.create_recorder(slug="i-assist-voice-bot")
    
    recorder.start(
        request=turn_event.user_transcript,
        thread_id=turn_event.session_id
    )
    
    # Node 1: STT Performance
    recorder.add_log(
        node="stt",
        message=f"STT completed in {turn_event.stt_latency_ms}ms",
        data={"detected_language": turn_event.language, "confidence": turn_event.stt_confidence}
    )
    
    # Node 2: Cognitive Reasoning & LLM Tokens
    recorder.add_log(
        node="cognitive_reasoning",
        message=f"LLM generated turn response in {turn_event.llm_latency_ms}ms",
        data={"model": turn_event.llm_model}
    )
    recorder.log_llm_call(
        model=turn_event.llm_model,
        prompt_tokens=turn_event.prompt_tokens,
        completion_tokens=turn_event.completion_tokens
    )
    
    # Node 3: MCP Tool Call Executions
    for tool_call in turn_event.mcp_calls:
        recorder.add_log(
            node="mcp_gateway",
            message=f"Executed MCP Tool: {tool_call.name}",
            data={
                "tool": tool_call.name,
                "latency_ms": tool_call.duration_ms,
                "status": tool_call.status,
                "sanitized_params": tool_call.sanitized_args
            }
        )
    
    # Node 4: TTS Synthesis & Voice Delivery
    recorder.add_log(
        node="tts",
        message=f"TTS audio synthesized in {turn_event.tts_latency_ms}ms",
        data={"voice_id": turn_event.voice_id}
    )
    
    # Finalize Trace Submission
    recorder.end(
        response=turn_event.agent_vocalized_text,
        status="ok" if turn_event.error is None else "error",
        error=turn_event.error,
        latency_ms=turn_event.total_turn_latency_ms
    )
```

### 3.3 Telemetry Mapping & Parameter Harmonization

| i-Assist Voice Bot Telemetry Field | Northstar Harmonized Field (Silver Layer) | Target Gold Field (`GoldSpan`) | Transformation & Business Logic |
|:---|:---|:---|:---|
| `user_spoken_transcript` | `request` | `input_text` | Transcribed audio text from STT module |
| `agent_vocalized_response` | `response` | `output_text` | Spoken response text delivered to investor |
| `call_session_id` | `threadId` | `conversation_id` | Maps turns to continuous call session |
| `stt_latency_ms` | `logs[node="stt"]` | `attributes_json.stt_ms` | Speech recognition phase duration |
| `llm_reasoning_ms` | `logs[node="cognitive_reasoning"]` | `attributes_json.llm_ms` | Reasoning & prompt generation duration |
| `mcp_service_latency_ms` | `logs[node="mcp_gateway"]` | `attributes_json.mcp_ms` | MCP portfolio/transaction API retrieval duration |
| `tts_synthesis_ms` | `logs[node="tts"]` | `attributes_json.tts_ms` | Voice synthesis & audio generation duration |
| `total_end_to_end_latency` | `duration_ms` | `duration_ms` | Overall turn duration (user finish -> agent speak) |
| `detected_language` | `attributes_json.language` | `attributes_json.language` | Regional language detected (Hindi, Tamil, Marathi, English) |
| `mcp_tool_name` | `logs[node="mcp_gateway"].tool` | `is_tool = true` | Flagged as tool invocation span in Gold layer |

---

## 4. Centralized Medallion Data Pipeline Integration

Both Smart Search and i-Assist Voice Bot ingest their telemetry into Northstar's **Centralized Unified Database** via the **Medallion Data Pipeline**:

```mermaid
flowchart LR
    subgraph IngestSources["Ingestion Streams"]
        S1["Smart Search Telemetry<br/>(Search Queries & Rerank Scores)"]
        S2["i-Assist Voice Telemetry<br/>(Voice Turns, STT/TTS & MCP Tools)"]
    end

    subgraph BronzeLayer["🥉 Bronze Layer (Raw Ingest)"]
        B_Table[("bronze_telemetry_raw<br/>Immutable append log")]
    end

    subgraph SilverLayer["🥈 Silver Layer (Filtration & Harmonization)"]
        S_Worker["Silver Pipeline Worker"]
        S_Filter["PII Redaction & Sanitization"]
        S_Harmonize["Parameter Harmonizer"]
        S_Spans[("silver_normalized_spans")]
        S_Logs[("silver_normalized_logs")]
    end

    subgraph GoldLayer["🥇 Gold Layer (Analytics Engine)"]
        G_Spans[("GoldSpan")]
        G_Logs[("GoldLog")]
        G_Metrics[("GoldMetric")]
        G_Cost["Financial Cost Engine"]
        G_Trust["Trust Score Engine"]
    end

    S1 -->|"POST /api/ingest"| B_Table
    S2 -->|"POST /api/ingest"| B_Table
    B_Table --> S_Worker
    S_Worker --> S_Filter --> S_Harmonize
    S_Harmonize --> S_Spans
    S_Harmonize --> S_Logs
    S_Spans --> G_Spans
    S_Logs --> G_Logs
    G_Spans --> G_Cost
    G_Spans --> G_Trust
```

### 4.1 Silver Layer Parameter Harmonization Rules

The Silver layer automatically transforms heterogeneous parameter names from both platforms into Northstar standard fields:

```sql
-- Conceptual Silver Pipeline Transformation Logic
INSERT INTO silver_normalized_spans (
    trace_id,
    agent_slug,
    request,
    response,
    duration_ms,
    gen_ai_input_tokens,
    gen_ai_output_tokens,
    model,
    status_code,
    ingested_at
)
SELECT
    COALESCE(raw_payload->>'trace_id', raw_payload->>'session_id', gen_random_uuid()::text) AS trace_id,
    agent_slug,
    -- Harmonize Input Prompts: user_query (Smart Search) OR user_spoken_transcript (i-Assist)
    COALESCE(raw_payload->>'request', raw_payload->>'user_query', raw_payload->>'user_spoken_transcript') AS request,
    -- Harmonize Output Responses: top_result_summary (Smart Search) OR agent_vocalized_response (i-Assist)
    COALESCE(raw_payload->>'response', raw_payload->>'top_result_summary', raw_payload->>'agent_vocalized_response') AS response,
    -- Harmonize Latencies
    COALESCE((raw_payload->>'duration_ms')::numeric, (raw_payload->>'total_search_latency')::numeric, (raw_payload->>'total_turn_latency_ms')::numeric) AS duration_ms,
    -- Token Harmonization
    COALESCE((raw_payload->'tokens'->>'prompt')::int, (raw_payload->>'prompt_tokens')::int, 0) AS gen_ai_input_tokens,
    COALESCE((raw_payload->'tokens'->>'completion')::int, (raw_payload->>'completion_tokens')::int, 0) AS gen_ai_output_tokens,
    COALESCE(raw_payload->>'model', raw_payload->>'llm_model', 'unknown') AS model,
    COALESCE(raw_payload->>'status', 'ok') AS status_code,
    ingested_at
FROM bronze_telemetry_raw;
```

---

## 5. Regulatory Compliance, PII Masking & Security

Operating in the Asset Management domain requires strict adherence to **SEBI guidelines** and financial data privacy standards:

### 5.1 SEBI Financial Guardrail Auditing (Smart Search)
* **Non-Compliant Query Screening**: Queries containing biased or prohibited terms (e.g., *"best performing mutual fund"*, *"guaranteed return scheme"*) trigger regulatory screening guardrails.
* **Audit Trail**: Screened queries are flagged as `degraded` in Northstar with log entries recording the exact rule triggered and the neutral educational guidance presented to the investor.

### 5.2 Automatic Investor PII Redaction (i-Assist Voice Bot)
* **Pre-Storage Masking**: Before telemetry is persisted to the Bronze layer, regex sanitizers mask sensitive investor identifiers:
  * Permanent Account Number (PAN): `[A-Z]{5}[0-9]{4}[A-Z]{1}` ──► `*****1234F`
  * Folio Numbers: `[0-9]{7,10}` ──► `******789`
  * Nominee Names & Bank Account Details: Masked with `[REDACTED_PII]`.

### 5.3 Transport Security & Key Authentication
* **API Authorization**: Each platform receives a unique environment key (`ns_key_smart_search_...`, `ns_key_i_assist_...`) sent as a `Bearer` token header.
* **TLS 1.3 Transport**: All telemetry payloads transmitted over internal HTTPS connections to the Northstar VM.

---

## 6. Rollout Plan & 14-Week Schedule Alignment

The onboarding of Smart Search and i-Assist Voice Bot is integrated into **Phase 2 (Tier 1 SDK Instrumentation)** of the master 14-week rollout schedule:

```mermaid
gantt
    title Onboarding Timeline for Smart Search & i-Assist Voice Bot (14-Week Schedule)
    dateFormat  YYYY-MM-DD
    axisFormat  W%V

    section Phase 1: Infrastructure (W1-3)
    Deploy Central Northstar VM & DB           :a1, 2026-10-01, 14d
    Deploy Medallion Data Pipeline             :a2, after a1, 7d
    
    section Phase 2: Smart Search & i-Assist (W4-6)
    Integrate SDK Middleware into Smart Search :b1, 2026-10-22, 10d
    Integrate LiveKit & MCP Plugin to i-Assist :b2, 2026-10-22, 12d
    Test Silver Harmonization & PII Redaction  :b3, after b2, 5d
    
    section Phase 3-5: Fleet Expansion & Verification (W7-14)
    Onboard remaining Tier 2-5 Agents          :c1, after b3, 35d
    Load Testing (10k traces/day)              :c2, after c1, 7d
    EM Sign-off & Production Launch            :c3, after c2, 7d
```

---

## 7. Verification & Validation Plan

### 7.1 Automated Verification Commands

To verify successful telemetry ingestion and parameter harmonization for both platforms, execute the following verification commands against the Northstar API:

```bash
# 1. Verify Registration Status
curl -s -H "Authorization: Bearer ns_key_smart_search_prod_01" \
     https://northstar.internal:43147/api/agents/smart-search-platform

curl -s -H "Authorization: Bearer ns_key_i_assist_voicebot_prod_02" \
     https://northstar.internal:43147/api/agents/i-assist-voice-bot

# 2. Test Smart Search Telemetry Ingestion
curl -X POST https://northstar.internal:43147/api/ingest \
  -H "Authorization: Bearer ns_key_smart_search_prod_01" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "smart-search-platform",
    "request": "[WEB] tax saving mutual funds",
    "response": "ICICI Prudential ELSS Tax Saver Fund (Confidence: 0.94)",
    "status": "ok",
    "accuracy": 94,
    "latencyMs": 142,
    "logs": [
      {"ts": "2026-09-17T18:10:00Z", "level": "info", "node": "query_encoding", "message": "Expanded to ELSS"},
      {"ts": "2026-09-17T18:10:00Z", "level": "info", "node": "vector_search", "message": "Retrieved 15 items"},
      {"ts": "2026-09-17T18:10:00Z", "level": "info", "node": "re_ranking", "message": "Re-ranking complete"}
    ]
  }'

# 3. Test i-Assist Voice Bot Turn Ingestion
curl -X POST https://northstar.internal:43147/api/ingest \
  -H "Authorization: Bearer ns_key_i_assist_voicebot_prod_02" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "i-assist-voice-bot",
    "request": "What is my current portfolio valuation?",
    "response": "Your total portfolio valuation across 2 folios is ₹12,45,000.",
    "threadId": "voice_session_99218",
    "status": "ok",
    "accuracy": 98,
    "latencyMs": 850,
    "logs": [
      {"ts": "2026-09-17T18:10:00Z", "level": "info", "node": "stt", "message": "STT completed in 210ms"},
      {"ts": "2026-09-17T18:10:00Z", "level": "info", "node": "mcp_gateway", "message": "Executed get_portfolio in 45ms"},
      {"ts": "2026-09-17T18:10:00Z", "level": "info", "node": "tts", "message": "TTS audio generated in 180ms"}
    ]
  }'

# 4. Verify Gold Layer Aggregation & Trust Score Output
curl -s https://northstar.internal:43147/api/dash | jq '.agents[] | select(.slug=="smart-search-platform" or .slug=="i-assist-voice-bot")'
```

---

*This proposal provides a concrete, production-ready blueprint for onboarding the Smart Search Platform and i-Assist Digital Voice Bot under Northstar Observability.*
