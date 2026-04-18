---
name: security-guidelines
description: Проверки безопасности для security-auditor. Use when auditing auth, payments, sensitive data, or validating input handling.
---

# Security Guidelines

Чеклист для security-auditor.

## Секреты

- [ ] Нет хардкода API keys, паролей, токенов
- [ ] Env / secrets manager для конфиденциальных данных

## Входные данные

- [ ] Валидация типа, длины, формата
- [ ] Санитизация перед отображением (XSS)
- [ ] Параметризованные запросы (SQL injection)

## Аутентификация и авторизация

- [ ] Пароли хешированы (bcrypt, argon2)
- [ ] Токены не в localStorage для чувствительных данных
- [ ] Проверка прав доступа на каждом endpoint

## Другие уязвимости

- [ ] CSRF-токены для state-changing форм
- [ ] Rate limiting для публичных API
- [ ] Зависимости без известных CVEs

## Отчёт

По severity: Critical, High, Medium, Low. При Critical/High — debugger для исправления.
