---
name: performance
description: Performance patterns for Python/asyncio. Use when optimizing hot paths, implementing caches, managing concurrency, or reviewing async code for bottlenecks.
---

# Performance

Паттерны производительности для проекта (Python, asyncio, SQLAlchemy). Применяется в `worker` и `reviewer-senior` при работе с парсерами, горячими путями, параллельными задачами.

## Pattern 1: TTL-кеш для часто запрашиваемых данных

Избегай повторных HTTP/DB-запросов для данных с известным временем актуальности:

```python
class FundingRateParser:
    _cache: dict[str, float] = {}
    _cache_ts: dict[str, float] = {}
    _CACHE_TTL = 55  # секунд

    async def get_funding_rate(self, symbol: str) -> float | None:
        now = time.monotonic()
        if symbol in self._cache and now - self._cache_ts[symbol] < self._CACHE_TTL:
            return self._cache[symbol]
        rate = await self._fetch(symbol)
        if rate is not None:
            self._cache[symbol] = rate
            self._cache_ts[symbol] = now
        return rate
```

## Pattern 2: asyncio.gather для параллельных независимых операций

Когда несколько фильтров/проверок не зависят друг от друга — запускай параллельно:

```python
# Медленно — последовательно
result_a = await check_oi_filter(symbol)
result_b = await check_price_filter(symbol)
result_c = await check_liquidation_filter(symbol)

# Быстро — параллельно
result_a, result_b, result_c = await asyncio.gather(
    check_oi_filter(symbol),
    check_price_filter(symbol),
    check_liquidation_filter(symbol),
)
```

Используй `return_exceptions=True` если один из вызовов может упасть и не должен отменять остальные:

```python
results = await asyncio.gather(*tasks, return_exceptions=True)
successes = [r for r in results if not isinstance(r, Exception)]
```

## Pattern 3: Семафор для ограничения параллелизма

Когда нужно обработать N символов параллельно, но не все сразу (нагрузка на биржевой API):

```python
_semaphore = asyncio.Semaphore(4)  # max 4 одновременных запроса

async def process_symbol(symbol: str) -> None:
    async with _semaphore:
        await fetch_and_process(symbol)

await asyncio.gather(*[process_symbol(s) for s in symbols])
```

## Pattern 4: Избегать блокирующих вызовов в async-контексте

Блокирующие операции (CPU-heavy, sync I/O) выносить в executor:

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=2)

async def heavy_computation(data: list) -> float:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _sync_compute, data)
```

Не вызывай `time.sleep()`, `requests.get()`, тяжёлые pandas-вычисления напрямую в async-функциях.

## Pattern 5: Профилирование горячих путей

Для выявления узких мест в asyncio без внешних инструментов:

```python
import time

async def _check_filters(self, symbol: str) -> bool:
    t0 = time.monotonic()
    result = await self._run_all_filters(symbol)
    elapsed = time.monotonic() - t0
    if elapsed > 0.1:  # > 100ms — потенциальный bottleneck
        logger.warning("slow filter check: symbol=%s elapsed=%.3fs", symbol, elapsed)
    return result
```

## Чеклист

- [ ] Повторные HTTP/DB запросы к одним данным заменены TTL-кешем?
- [ ] Независимые async-операции запущены через `asyncio.gather`?
- [ ] Параллелизм к внешним API ограничен семафором?
- [ ] Нет блокирующих вызовов (`time.sleep`, sync requests) в async-функциях?
- [ ] Горячие пути (парсеры, фильтры) имеют метрику времени выполнения?
- [ ] N+1 запросов к БД нет (join/subquery вместо цикла select)?
