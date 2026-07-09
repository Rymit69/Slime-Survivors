# 📦 Сборка APK — Slime Survivors

## Предварительные требования

- **Node.js 18+** и **pnpm** (`npm i -g pnpm`)
- **Android Studio** с Android SDK (API 22+)
- **Java JDK 17** (`java -version` должен показать 17)
- Переменная окружения `ANDROID_HOME` указывает на папку SDK

---

## Шаг 1 — Сборка веб-приложения

```bash
# В папке проекта (корень репозитория)
cd artifacts/slime-survivors
pnpm vite build --config vite.capacitor.config.ts
```

После этого появится папка `dist/public/` с собранной игрой.

---

## Шаг 2 — Добавить Android-платформу (один раз)

```bash
cd artifacts/slime-survivors
npx cap add android
```

Это создаст папку `android/` со всем нужным проектом для Android Studio.

---

## Шаг 3 — Синхронизировать сборку с Android

```bash
cd artifacts/slime-survivors
npx cap sync android
```

Запускай эту команду каждый раз после `pnpm vite build`.

---

## Шаг 4 — Открыть в Android Studio

```bash
npx cap open android
```

Откроется Android Studio. Дождись, пока Gradle синхронизируется.

---

## Шаг 5 — Собрать APK

В Android Studio:
1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Готовый файл: `android/app/build/outputs/apk/debug/app-debug.apk`

Или через командную строку (без Android Studio):

```bash
cd artifacts/slime-survivors/android
./gradlew assembleDebug
```

APK будет в `app/build/outputs/apk/debug/app-debug.apk`.

---

## Шаг 6 — Установить на телефон

```bash
# Включи «Режим разработчика» и «Отладку по USB» на телефоне
adb install app/build/outputs/apk/debug/app-debug.apk
```

Или просто перекинь APK на телефон и открой файловым менеджером.

---

## PWA (без APK — прямо сейчас)

Если просто хочешь установить игру на телефон без сборки APK:

1. Открой игру в **Chrome на Android**: `https://c4y.sisko.replit.dev`
2. Нажми `⋮` → **«Добавить на главный экран»**
3. Игра появится как иконка на рабочем столе и откроется в полноэкранном режиме без браузера

---

## Структура файлов

| Файл | Назначение |
|------|-----------|
| `capacitor.config.ts` | Настройки Capacitor (appId, webDir) |
| `vite.capacitor.config.ts` | Vite-конфиг для APK-сборки (base: `./`) |
| `public/manifest.json` | PWA manifest |
| `public/sw.js` | Service Worker (офлайн-кеш) |
| `public/icons/icon-192.png` | Иконка приложения 192×192 |
| `public/icons/icon-512.png` | Иконка приложения 512×512 |
