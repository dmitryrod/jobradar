---
name: idempotency
description: Idempotency patterns for Python/SQLAlchemy/asyncio. Use when writing signal deduplication, DB upserts, state machines, or any operation that must be safe to retry.
---

# Idempotency

Паттерны идемпотентности для проекта (Python, SQLAlchemy, asyncio). Применяется в `worker` при работе с сигналами, мониторингом пар, записью в БД.

## Pattern 1: Дедупликация сигналов (Telegram / UI)

Проверяй наличие активного состояния перед созданием, не полагайся на уникальный ключ как единственную защиту:

```python
# Перед отправкой сигнала — проверь timeout
async def _send_signal(self, symbol: str) -> None:
    if self._timeout_tracker.is_blocked(symbol):
        return
    # ... отправка
    self._timeout_tracker.mark(symbol)
```

Для `MonitoredPairORM` — проверяй exists перед insert:

```python
exists = await monitored_pair_repo.exists_active(settings_id, symbol)
if not exists:
    await monitored_pair_repo.create(settings_id=settings_id, symbol=symbol, ...)
```

## Pattern 2: UPSERT в PostgreSQL (SQLAlchemy)

При записи сигналов предпочитай `ON CONFLICT DO NOTHING` или `ON CONFLICT DO UPDATE` вместо try/except на IntegrityError:

```python
from sqlalchemy.dialects.postgresql import insert

stmt = insert(SignalORM).values(**data)
stmt = stmt.on_conflict_do_nothing(index_elements=["settings_id", "symbol", "created_at"])
await session.execute(stmt)
```

Для обновления при конфликте:

```python
stmt = insert(MonitoredPairORM).values(**data)
stmt = stmt.on_conflict_do_update(
    index_elements=["settings_id", "symbol"],
    set_={"status": "monitoring", "expires_at": data["expires_at"]},
    where=MonitoredPairORM.status == "expired",
)
await session.execute(stmt)
```

## Pattern 3: State Machine для MonitoredPair

Переходы состояний — явные, с проверкой допустимости:

```python
VALID_TRANSITIONS = {
    "monitoring": ["signaled", "expired", "invalidated"],
    "signaled":   ["expired"],
    "expired":    [],
    "invalidated": [],
}

async def transition_status(pair: MonitoredPairORM, new_status: str) -> None:
    allowed = VALID_TRANSITIONS.get(pair.status, [])
    if new_status not in allowed:
        raise ValueError(f"Invalid transition {pair.status} -> {new_status}")
    pair.status = new_status
```

Никогда не обновляй статус напрямую через `pair.status = ...` без проверки — это обходит логику state machine.

## Pattern 4: Idempotent create (exists_active)

Метод репозитория `exists_active` должен учитывать все не-терминальные статусы:

```python
async def exists_active(self, settings_id: int, symbol: str) -> bool:
    result = await self._session.execute(
        select(MonitoredPairORM).where(
            MonitoredPairORM.settings_id == settings_id,
            MonitoredPairORM.symbol == symbol,
            MonitoredPairORM.status.in_(["monitoring"]),
            MonitoredPairORM.expires_at > datetime.utcnow(),
        )
    )
    return result.scalar_one_or_none() is not None
```

## Pattern 5: Retry-safe async операции

Если операция может быть вызвана повторно (retry, reconnect), убедись что она идемпотентна:

```python
async def ensure_subscription(self, symbol: str) -> None:
    """Подписка идемпотентна — повторный вызов безопасен."""
    if symbol in self._subscribed:
        return
    await self._ws.subscribe(symbol)
    self._subscribed.add(symbol)
```

## Чеклист

- [ ] Создание записи защищено от дублей (`exists_active` или `ON CONFLICT`)?
- [ ] Переходы состояний проходят через явный state machine?
- [ ] Telegram/UI сигналы защищены от дублей через `TimeoutTracker`?
- [ ] Retry-операции (WebSocket reconnect) идемпотентны?
- [ ] Тест покрывает сценарий повторного вызова?
