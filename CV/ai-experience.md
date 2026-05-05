# AI / LLM Experience

## Основной фокус
- LLM-приложения под реальные бизнес-задачи, а не research ради research.
- Prompt engineering, orchestration, retrieval, tool use, observability, качество и интеграция в продакшн.

## Prompt engineering
- Системные промпты, многошаговые цепочки, few-shot, structured outputs, tool/function calling, ReAct.
- Управление контекстом, уменьшение галлюцинаций, итеративная донастройка по логам и обратной связи.
- Использование LLM-as-a-judge и прикладных quality-критериев для оценки ответа.

## Agents / orchestration
- Мультиагентные сценарии на LangChain / LangGraph.
- Workflow-автоматизация через n8n, Flowise, Make.
- MCP-интеграции для подключения внешних инструментов к AI-агентам.

## RAG / search
- Проектирование RAG-пайплайнов: ingestion, чанкинг, embeddings, retrieval, hybrid search, reranking.
- Векторные БД и storage: Qdrant, Supabase pgvector, LightRAG, Pinecone.
- Практика построения внутреннего поиска и knowledge assistants для компаний.

## Backend / infra
- FastAPI для AI API и service layer.
- Docker + Linux для деплоя и поддержки.
- Nginx, Postgres, MongoDB, Redis, GitHub Actions.
- Интеграции через REST API, webhooks, Telegram Bot API, Bitrix24, Google Sheets.

## Observability / quality
- LangFuse для трассировки и мониторинга LLM-пайплайнов.
- Регрессионные проверки и собственные метрики качества.
- Подход: сначала быстро проверить гипотезу, затем добавить наблюдаемость и стабилизировать результат.

## Модельный стек
- Claude, GPT, Gemini.
- Ollama-стек: Llama, Mistral, Qwen.
- Выбор модели делаю от задачи: качество, цена, latency, controllability, требования к приватности.
