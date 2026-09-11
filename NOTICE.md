# Сторонние компоненты

Файл `dist/MPGA.html` собран из исходников этого репозитория и трёх сторонних
библиотек. Их лицензии требуют сохранять уведомление об авторстве в любой
копии, поэтому этот текст также встроен в сам файл и показан в его подвале.

## PptxGenJS 4.0.1 — MIT

Copyright (c) 2015-2025 Brent Ely

Сборка `pptxgen.bundle.js` включает JSZip.

## JSZip — MIT

Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger,
António Afonso

## Lucide 1.45.0 (lucide-static) — ISC

Copyright (c) 2020, Lucide Contributors

Основан на Feather Icons, Copyright (c) 2013-2023 Cole Bemis.

Иконки встроены в MPGA в виде готовой разметки: файл `src/engine/icons.js`
генерируется командой `npm run icons`.

## Шрифты

Ни один шрифт в MPGA не встроен. В собранном PPTX указан Arial — он есть в
Windows и macOS, а в Linux и российских офисных пакетах подменяется метрически
совместимым Liberation Sans. Встраивать Arial в файл нельзя: это проприетарный
шрифт Monotype.

Полные тексты лицензий MIT и ISC — короткие и приведены целиком внутри
`dist/MPGA.html` в шапке соответствующих блоков кода.
