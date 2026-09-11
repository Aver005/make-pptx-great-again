# -*- coding: utf-8 -*-
"""
HTML v7 -> PPTX
================
Основа этого скрипта — ИСХОДНЫЙ HTML v7 без пересборки дизайна.
HTML/CSS ниже сохранены как есть. Вверху файла находится CONFIG:
там можно менять содержимое и визуальные параметры.

Важно:
- содержимое v7 не переписано и не "улучшено";
- рендерится именно HTML через Chromium;
- каждый .slide снимается целиком и ставится в PPTX 1:1 по пропорции 16:9;
- PPTX содержит слайды как изображения, поэтому внешний вид HTML сохраняется максимально точно.
"""

from pathlib import Path
import html as html_lib
import re
import sys

CONFIG = {
    # ---------- ФАЙЛЫ ----------
    "output_name": "presentation_v7_edited.pptx",

    # ---------- РАЗМЕР PPTX ----------
    # 13.333333 x 7.5 = 16:9
    "ppt_width_in": 13.333333,
    "ppt_height_in": 7.5,

    # ---------- ТЕКСТ ----------
    # Меняйте значения справа. Ключи слева соответствуют исходному v7.
    "text": {
        'Визуальный макет v5': 'Визуальный макет v5',
        'Научное наполнение · разнообразные карточки · палитра 70/20/10': 'Научное наполнение · разнообразные карточки · палитра 70/20/10',
        'Слайд 1 · Понятие': 'Слайд 1 · Понятие',
        'Сетевые информационные ресурсы': 'Сетевые информационные ресурсы',
        'Сетевые информационные ресурсы — цифровые ресурсы, доступ к которым осуществляется по компьютерной сети.': 'Сетевые информационные ресурсы — цифровые ресурсы, доступ к которым осуществляется по компьютерной сети.',
        'Электронные библиотеки': 'Электронные библиотеки',
        'Базы данных': 'Базы данных',
        'Электронные каталоги': 'Электронные каталоги',
        'Сетевые документы': 'Сетевые документы',
        'Веб-сайты и порталы': 'Веб-сайты и порталы',
        'Слайд 2 · Классификация': 'Слайд 2 · Классификация',
        'Основные группы сетевых ресурсов': 'Основные группы сетевых ресурсов',
        'Разные типы ресурсов решают разные задачи: одни обеспечивают поиск и навигацию, другие — хранение документов или доступ к структурированным данным. Поэтому сетевую среду целесообразно рассматривать как совокупность взаимосвязанных ресурсов.': 'Разные типы ресурсов решают разные задачи: одни обеспечивают поиск и навигацию, другие — хранение документов или доступ к структурированным данным. Поэтому сетевую среду целесообразно рассматривать как совокупность взаимосвязанных ресурсов.',
        'Многофункциональные сетевые системы': 'Многофункциональные сетевые системы',
        'Собрания и коллекции документов': 'Собрания и коллекции документов',
        'Организованные массивы данных': 'Организованные массивы данных',
        'Каталоги, указатели и записи': 'Каталоги, указатели и записи',
        'Публикации и издания в цифровой форме': 'Публикации и издания в цифровой форме',
        'Сетевые функции и информационные услуги': 'Сетевые функции и информационные услуги',
        'По Г. Л. Левину: сайты и порталы, электронные библиотеки, коллекции, веб-сервисы, базы данных и сетевые электронные документы.': 'По Г. Л. Левину: сайты и порталы, электронные библиотеки, коллекции, веб-сервисы, базы данных и сетевые электронные документы.',
        'Слайд 3 · Электронная библиотека': 'Слайд 3 · Электронная библиотека',
        'От цифровой коллекции к документу': 'От цифровой коллекции к документу',
        'Электронная библиотека связывает коллекцию цифровых документов с инструментами поиска. Пользователь работает не с массивом файлов напрямую, а с каталогом и библиографическими данными, которые ведут к конкретному документу.': 'Электронная библиотека связывает коллекцию цифровых документов с инструментами поиска. Пользователь работает не с массивом файлов напрямую, а с каталогом и библиографическими данными, которые ведут к конкретному документу.',
        'ЦИФРОВАЯ КОЛЛЕКЦИЯ': 'ЦИФРОВАЯ КОЛЛЕКЦИЯ',
        'ЭЛЕКТРОННЫЙ КАТАЛОГ': 'ЭЛЕКТРОННЫЙ КАТАЛОГ',
        'Автор / название / тема': 'Автор / название / тема',
        'Библиографическая запись': 'Библиографическая запись',
        'Полный текст / доступ': 'Полный текст / доступ',
        'Электронно-форматные библиографические ресурсы включают базы данных и электронные каталоги; их задача — учет, поиск и навигация по документам.': 'Электронно-форматные библиографические ресурсы включают базы данных и электронные каталоги; их задача — учет, поиск и навигация по документам.',
        'Слайд 4 · Научные базы': 'Слайд 4 · Научные базы',
        'Поиск в распределённом массиве': 'Поиск в распределённом массиве',
        'Научный поиск объединяет публикации, материалы конференций, диссертации и библиографические записи.': 'Научный поиск объединяет публикации, материалы конференций, диссертации и библиографические записи.',
        'Статьи журналов': 'Статьи журналов',
        'Материалы конференций': 'Материалы конференций',
        'Диссертации и ВКР': 'Диссертации и ВКР',
        'Библиографические записи': 'Библиографические записи',
        'ПОИСК': 'ПОИСК',
        'ОТБОР': 'ОТБОР',
        'ДОСТУП': 'ДОСТУП',
        'Электронные библиографические ресурсы обеспечивают учёт, поиск и ориентирование в цифровом массиве документов.': 'Электронные библиографические ресурсы обеспечивают учёт, поиск и ориентирование в цифровом массиве документов.',
        'Слайд 5 · Поиск': 'Слайд 5 · Поиск',
        'От запроса к источнику': 'От запроса к источнику',
        'Эффективный поиск проходит несколько последовательных этапов: от формулирования информационной потребности до выбора конкретного документа.': 'Эффективный поиск проходит несколько последовательных этапов: от формулирования информационной потребности до выбора конкретного документа.',
        'Запрос': 'Запрос',
        'Поиск': 'Поиск',
        'Отбор': 'Отбор',
        'Источник': 'Источник',
        'Определить тему, ключевые понятия и цель поиска.': 'Определить тему, ключевые понятия и цель поиска.',
        'Использовать каталоги, базы данных и поисковые средства.': 'Использовать каталоги, базы данных и поисковые средства.',
        'Сопоставить результаты с задачей и оценить качество источников.': 'Сопоставить результаты с задачей и оценить качество источников.',
        'Перейти к документу, полному тексту или библиографической записи.': 'Перейти к документу, полному тексту или библиографической записи.',
        'ПОТРЕБНОСТЬ': 'ПОТРЕБНОСТЬ',
        'ИСТОЧНИК': 'ИСТОЧНИК',
        'Слайд 6 · Оценка': 'Слайд 6 · Оценка',
        'Как оценивать сетевой источник': 'Как оценивать сетевой источник',
        'Сетевой доступ не гарантирует научную ценность: источник нужно проверить по ключевым критериям.': 'Сетевой доступ не гарантирует научную ценность: источник нужно проверить по ключевым критериям.',
        'АВТОР / ОРГАНИЗАЦИЯ': 'АВТОР / ОРГАНИЗАЦИЯ',
        'АКТУАЛЬНОСТЬ': 'АКТУАЛЬНОСТЬ',
        'ДОСТОВЕРНОСТЬ': 'ДОСТОВЕРНОСТЬ',
        'НАУЧНЫЙ СТАТУС': 'НАУЧНЫЙ СТАТУС',
        'КАЧЕСТВО': 'КАЧЕСТВО',
        'ИСТОЧНИКА': 'ИСТОЧНИКА',
        'Автор и организация': 'Автор и организация',
        'Идентифицируемый автор или учреждение-издатель.': 'Идентифицируемый автор или учреждение-издатель.',
        'Научный статус': 'Научный статус',
        'Публикация в научном издании, учебном издании или академическом ресурсе.': 'Публикация в научном издании, учебном издании или академическом ресурсе.',
        'Актуальность': 'Актуальность',
        'Соответствие материала цели поиска и состоянию предметной области.': 'Соответствие материала цели поиска и состоянию предметной области.',
        'Достоверность': 'Достоверность',
        'Проверяемость сведений, ссылок и библиографических данных.': 'Проверяемость сведений, ссылок и библиографических данных.',
        'Слайд 7 · Значение': 'Слайд 7 · Значение',
        'Сетевая информационная среда': 'Сетевая информационная среда',
        'Для пользователя важна не отдельная база или библиотека, а связанная информационная среда. Она объединяет поиск, доступ к документам и работу разных участников образовательного и исследовательского процесса.': 'Для пользователя важна не отдельная база или библиотека, а связанная информационная среда. Она объединяет поиск, доступ к документам и работу разных участников образовательного и исследовательского процесса.',
        'Студент': 'Студент',
        'Преподаватель': 'Преподаватель',
        'Исследователь': 'Исследователь',
        'Библиотека': 'Библиотека',
        'поиск и самостоятельная работа': 'поиск и самостоятельная работа',
        'учебные материалы': 'учебные материалы',
        'публикации и данные': 'публикации и данные',
        'доступ и навигация': 'доступ и навигация',
        'СЕТЕВАЯ': 'СЕТЕВАЯ',
        'ИНФОРМАЦИОННАЯ': 'ИНФОРМАЦИОННАЯ',
        'СРЕДА': 'СРЕДА',
        'Интеграция ресурсов формирует единое информационное пространство, в котором поиск, хранение и предоставление электронных документов связаны между собой.': 'Интеграция ресурсов формирует единое информационное пространство, в котором поиск, хранение и предоставление электронных документов связаны между собой.',
        'Слайд 8 · Выводы': 'Слайд 8 · Выводы',
        'Что определяет эффективность сетевых ресурсов': 'Что определяет эффективность сетевых ресурсов',
        'Эффективность сетевого ресурса определяется не только объёмом представленной информации. Важны структура ресурса, качество средств поиска и возможность оценить надёжность найденных сведений.': 'Эффективность сетевого ресурса определяется не только объёмом представленной информации. Важны структура ресурса, качество средств поиска и возможность оценить надёжность найденных сведений.',
        'Структура': 'Структура',
        'Ресурс должен иметь понятную организацию, метаданные и средства навигации.': 'Ресурс должен иметь понятную организацию, метаданные и средства навигации.',
        'Каталоги и базы данных сокращают путь от информационного запроса к документу.': 'Каталоги и базы данных сокращают путь от информационного запроса к документу.',
        'Качество': 'Качество',
        'Научная ценность определяется авторством, актуальностью и проверяемостью сведений.': 'Научная ценность определяется авторством, актуальностью и проверяемостью сведений.',
        'Сетевой информационный ресурс — это не просто доступ к данным, а организованная система поиска, хранения и использования информации.': 'Сетевой информационный ресурс — это не просто доступ к данным, а организованная система поиска, хранения и использования информации.',
        'Источники': 'Источники',
        'Научная литература': 'Научная литература',
        'Левин Г. Л.': 'Левин Г. Л.',
        'Сетевые информационные ресурсы как объект библиографирования // Библиотековедение. 2017. Т. 66, № 4. С. 396–402.': 'Сетевые информационные ресурсы как объект библиографирования // Библиотековедение. 2017. Т. 66, № 4. С. 396–402.',
        'Левин Г.': 'Левин Г.',
        'Электронные библиографические ресурсы и их библиографирование // Библиография. 2017. № 4. С. 46–54.': 'Электронные библиографические ресурсы и их библиографирование // Библиография. 2017. № 4. С. 46–54.',
        'Панов А. В.': 'Панов А. В.',
        'Сетевые информационные ресурсы: учебное пособие. М.: МГТУ МИРЭА, 2011. 119 с.': 'Сетевые информационные ресурсы: учебное пособие. М.: МГТУ МИРЭА, 2011. 119 с.',
        'Цветков В. Я., Семушкина С. Г.': 'Цветков В. Я., Семушкина С. Г.',
        'Электронные ресурсы и электронные услуги // Современные проблемы науки и образования. 2009. № 6-1. С. 39–40.': 'Электронные ресурсы и электронные услуги // Современные проблемы науки и образования. 2009. № 6-1. С. 39–40.',
        'Использованы научные статьи и учебное издание, посвящённые сетевым, электронным и библиографическим информационным ресурсам.': 'Использованы научные статьи и учебное издание, посвящённые сетевым, электронным и библиографическим информационным ресурсам.',
        'Завершение': 'Завершение',
        'КемГИК · Сетевые информационные ресурсы': 'КемГИК · Сетевые информационные ресурсы',
        'Спасибо': 'Спасибо',
        'за внимание!': 'за внимание!',
        'Пусть поиск информации всегда приводит': 'Пусть поиск информации всегда приводит',
        'к хорошим источникам.': 'к хорошим источникам.',
        'информация найдена ✓': 'информация найдена ✓',
    },

    # ---------- ОСНОВНАЯ ПАЛИТРА ----------
    # Эти значения подставляются поверх оригинального CSS.
    "colors": {
        "body_bg": "#f3f5f4",
        "slide_bg": "#fcfdfc",
        "primary": "#321e48",
        "accent": "#43637e",
        "accent_dark": "#254c6e",
        "accent_2": "#6f8ca4",
        "accent_light": "#edf4f9",
        "card_bg": "#f7f9fb",
        "white": "#ffffff",
        "text_muted": "#687687",
        "text_muted_2": "#8b96a5",
        "border": "#d7dde5",
        "border_2": "#d5dde6",
        "line": "#9aabba",
        "turquoise": "#65dcd5",
    },

    # ---------- ШРИФТ ----------
    "font": {
        "family": "Arial, sans-serif",
        "svg_family": "Arial",
    },

    # ---------- РАЗМЕРЫ / ОТСТУПЫ ----------
    # Это наиболее часто меняемые параметры исходного v7.
    "layout": {
        "slide_width_px": 1160,
        "slide_padding_top_px": 44,
        "slide_padding_right_px": 62,
        "slide_padding_bottom_px": 44,
        "slide_padding_left_px": 62,
        "slide_margin_bottom_px": 28,
        "left_bar_width_px": 7,
        "h1_size_px": 46,
        "h2_size_px": 32,
        "body_size_px": 16,
        "eyebrow_size_px": 11,
        "explain_size_px": 13,
        "card_title_size_px": 16,
        "card_text_size_px": 12,
        "source_size_px": 10,
        "slide_number_size_px": 11,
        "card_gap_px": 14,
        "card_padding_y_px": 18,
        "card_padding_x_px": 20,
        "card_height_px": 132,
        "visual_height_px": 290,
        "source_left_px": 62,
        "source_bottom_px": 17,
        "number_right_px": 30,
        "number_bottom_px": 17,
    },

    # ---------- ФОРМЫ ----------
    "shape": {
        "card_radius_px": 0,          # базовые карточки v7 были квадратными
        "map_card_radius_px": 12,
        "flow_radius_px": 0,
        "explain_border_width_px": 4,
    },

    # ---------- ТЕНИ ----------
    "shadow": {
        "slide": "0 10px 28px #00000012",
        "thanks_card": "0 12px 30px #321e4812",
    },

    # ---------- ИКОНКИ ----------
    "icons": {
        "card_px": 23,
        "node_px": 21,
        "stroke_width": 1.8,
    },

    # ---------- РЕНДЕР ----------
    "render": {
        "browser": "chromium",
        "wait_ms": 250,
        "device_scale_factor": 1,
        "keep_intermediate": True,
    },
}

# =====================================================================
# НИЖЕ — ЯДРО ОРИГИНАЛЬНОГО HTML v7.
# Не требуется редактировать этот блок для обычной настройки презентации.
# =====================================================================

ORIGINAL_HTML = r'<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Сетевые информационные ресурсы — макет v7</title>\n<style>\n*{box-sizing:border-box}body{margin:0;background:#f3f5f4;color:#321e48;font-family:Arial,sans-serif}\n.toolbar{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #d7dde5;padding:17px 28px;display:flex;justify-content:space-between;font-size:14px}.toolbar span{color:#687687}\n.deck{padding:30px 0 60px}.slide{width:min(1160px,calc(100vw - 40px));aspect-ratio:16/9;background:#fcfdfc;margin:0 auto 28px;border:1px solid #d7dde5;box-shadow:0 10px 28px #00000012;position:relative;overflow:hidden;padding:44px 62px}.slide:before{content:"";position:absolute;left:0;top:0;bottom:0;width:7px;background:#43637e}\n.ey{font-size:11px;font-weight:bold;letter-spacing:.14em;color:#43637e;text-transform:uppercase;margin-bottom:10px}h1{color:#321e48;font-size:46px;margin:0 0 14px;line-height:1.05}h2{color:#321e48;font-size:32px;margin:0 0 18px;line-height:1.08}p{font-size:16px;line-height:1.4}.num{position:absolute;right:30px;bottom:17px;font-size:11px;color:#8b96a5}.src{position:absolute;left:62px;bottom:17px;font-size:10px;color:#8b96a5;max-width:72%}\n.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:#f7f9fb;border:1px solid #d5dde6;padding:18px 20px;height:132px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.card .ico{font-size:25px;color:#43637e;margin:0 0 10px;line-height:1}.card .lucide{width:23px;height:23px;margin:0 0 9px;color:#43637e;stroke-width:1.8}.card b{font-size:16px;line-height:1.18}.card small{display:block;color:#687687;font-size:12px;line-height:1.3;margin-top:7px}\nsvg{display:block;width:100%;height:100%}.visual{height:290px}\n.cols{display:grid;grid-template-columns:1fr 1fr;gap:35px;align-items:center}.list{display:grid;gap:11px}.item{border:1px solid #d5dde6;background:#f7f9fb;padding:13px 16px}.item b{font-size:15px}.item span{display:block;font-size:12px;color:#687687;margin-top:4px}\n.flow{display:flex;align-items:center;justify-content:center;gap:18px;height:290px}.flowbox{width:205px;height:145px;border:2px solid #6f8ca4;background:#f7f9fb;padding:20px;text-align:center;display:flex;flex-direction:column;justify-content:center}.arrow{font-size:35px;color:#6f8ca4}\n.four{display:grid;grid-template-columns:1fr 1fr;gap:14px}.mini{padding:15px;border-left:5px solid #6f8ca4;background:#f5f8fa}.mini b{font-size:15px}.mini span{display:block;color:#687687;font-size:12px;margin-top:4px}\n@media(max-width:800px){.slide{aspect-ratio:auto;min-height:620px;padding:34px 40px}.cards,.cols,.four{grid-template-columns:1fr}h2{font-size:27px}.visual{height:250px}}\n</style><script src="https://unpkg.com/lucide@latest"></script>\n<style>\n.lucide{width:22px;height:22px;stroke-width:1.8;display:block;margin:0 auto 9px}\n.node-card{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px 18px;box-sizing:border-box}\n.node-card .lucide{width:21px;height:21px;margin-bottom:7px}\n.node-card b{line-height:1.15}\n.node-card small{line-height:1.25;margin-top:6px}\n.explain{margin:14px 0 0;padding:12px 18px;background:#f7f9fb;border-left:4px solid #254c6e;color:#536273;font-size:13px;line-height:1.45}\n</style>\n<style>\n.cards .card:nth-child(1){background:#f2f6f8}\n.cards .card:nth-child(2){background:#eef7f6}\n.cards .card:nth-child(3){background:#f4f1f8}\n.cards .card:nth-child(4){background:#f3f5f8}\n.cards .card:nth-child(5){background:#edf7f5}\n.cards .card:nth-child(6){background:#f5f3f7}\n.cards .card:nth-child(1) .lucide,.cards .card:nth-child(2) .lucide,.cards .card:nth-child(3) .lucide,\n.cards .card:nth-child(4) .lucide,.cards .card:nth-child(5) .lucide,.cards .card:nth-child(6) .lucide{color:#43637e}\n</style>\n\n<style>\n.slide5-cards .item:nth-child(1){background:#f1f6f8;border-color:#d8e2e8}\n.slide5-cards .item:nth-child(2){background:#eef7f5;border-color:#d5e8e5}\n.slide5-cards .item:nth-child(3){background:#f5f1f8;border-color:#e1d8e8}\n.slide5-cards .item:nth-child(4){background:#f3f5f7;border-color:#dbe1e6}\n.slide5-cards .item:nth-child(5){background:#f0f7f6;border-color:#d6e9e6}\n.slide5-cards .item:nth-child(6){background:#f6f3f7;border-color:#e2dbe7}\n</style>\n\n<style>\n.slide6-right .item{background:#321e48!important;border-color:#321e48!important;color:#fff!important}\n.slide6-right .item b{color:#fff!important}\n.slide6-right .item span{color:#e9e4ef!important}\n</style>\n</head><body>\n<div class="toolbar"><b>Визуальный макет v5</b><span>Научное наполнение · разнообразные карточки · палитра 70/20/10</span></div><main class="deck">\n\n<section class="slide"><div class="ey">Слайд 1 · Понятие</div><h2>Сетевые информационные ресурсы</h2>\n<div class="explain">Сетевые информационные ресурсы — цифровые ресурсы, доступ к которым осуществляется по компьютерной сети.</div>\n<div class="resource-map">\n<style>\n.resource-map{position:relative;height:300px;margin-top:8px}\n\n.resource-map .n{position:absolute;width:205px;height:74px;background:#f7f9fb;border:1px solid #cbd5df;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:10px 14px}\n.resource-map .n i{width:20px;height:20px;margin:0 0 6px;color:#43637e;stroke-width:1.8}\n.resource-map .n b{font-size:13px;line-height:1.12;color:#321e48}\n.resource-map .n1{left:2%;top:12px}.resource-map .n2{left:50%;top:0;transform:translateX(-50%)}.resource-map .n3{right:2%;top:12px}\n.resource-map .n4{left:15%;bottom:4px}.resource-map .n5{right:15%;bottom:4px}\n.resource-map .core{position:absolute;left:50%;top:116px;transform:translateX(-50%);width:275px;height:96px;border-radius:50%;background:#edf4f9;border:4px solid #43637e;display:flex;align-items:center;justify-content:center;text-align:center}\n.resource-map .core span{font-size:18px;font-weight:800;letter-spacing:.03em;color:#321e48;white-space:nowrap}\n\n\n\n\n\n</style>\n\n<div class="n n1"><i data-lucide="library"></i><b>Электронные библиотеки</b></div>\n<div class="n n2"><i data-lucide="database"></i><b>Базы данных</b></div>\n<div class="n n3"><i data-lucide="list"></i><b>Электронные каталоги</b></div>\n<div class="n n4"><i data-lucide="file-text"></i><b>Сетевые документы</b></div>\n<div class="n n5"><i data-lucide="globe"></i><b>Веб-сайты и порталы</b></div>\n<div class="core"><span>СЕТЕВОЙ РЕСУРС</span></div></div>\n<div class="src">Левин Г. Л. Сетевые информационные ресурсы как объект библиографирования // Библиотековедение. 2017. Т. 66, № 4. С. 396–402.</div><div class="num">1</div></section>\n\n<section class="slide"><div class="ey">Слайд 2 · Классификация</div><h2>Основные группы сетевых ресурсов</h2>\n<div class="explain">Разные типы ресурсов решают разные задачи: одни обеспечивают поиск и навигацию, другие — хранение документов или доступ к структурированным данным. Поэтому сетевую среду целесообразно рассматривать как совокупность взаимосвязанных ресурсов.</div>\n<div class="cards">\n<div class="card"><i data-lucide="globe"></i><b>Веб-сайты и порталы</b><small>Многофункциональные сетевые системы</small></div>\n<div class="card"><i data-lucide="library"></i><b>Электронные библиотеки</b><small>Собрания и коллекции документов</small></div>\n<div class="card"><i data-lucide="database"></i><b>Базы данных</b><small>Организованные массивы данных</small></div>\n<div class="card"><i data-lucide="list"></i><b>Библиографические ресурсы</b><small>Каталоги, указатели и записи</small></div>\n<div class="card"><i data-lucide="file-text"></i><b>Сетевые документы</b><small>Публикации и издания в цифровой форме</small></div>\n<div class="card"><i data-lucide="search"></i><b>Веб-сервисы</b><small>Сетевые функции и информационные услуги</small></div>\n</div><div class="src">По Г. Л. Левину: сайты и порталы, электронные библиотеки, коллекции, веб-сервисы, базы данных и сетевые электронные документы.</div><div class="num">2</div></section>\n\n<section class="slide"><div class="ey">Слайд 3 · Электронная библиотека</div><h2>От цифровой коллекции к документу</h2><div class="explain">Электронная библиотека связывает коллекцию цифровых документов с инструментами поиска. Пользователь работает не с массивом файлов напрямую, а с каталогом и библиографическими данными, которые ведут к конкретному документу.</div><div class="visual" style="height:290px;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 900 290" style="max-width:900px">\n<rect x="90" y="48" width="215" height="185" fill="#f4f7f9" stroke="#254c6e" stroke-width="4" rx="10"/>\n<g stroke="#9aabba" stroke-width="4"><line x1="112" y1="108" x2="283" y2="108"/><line x1="112" y1="170" x2="283" y2="170"/></g>\n<g fill="#d2dce5" stroke="#9eabb8"><rect x="118" y="64" width="20" height="44"/><rect x="145" y="57" width="25" height="51"/><rect x="177" y="69" width="18" height="39"/><rect x="202" y="61" width="27" height="47"/><rect x="238" y="66" width="19" height="42"/><rect x="264" y="58" width="19" height="50"/>\n<rect x="118" y="122" width="24" height="42"/><rect x="150" y="130" width="18" height="34"/><rect x="178" y="119" width="27" height="45"/><rect x="214" y="127" width="18" height="37"/><rect x="242" y="121" width="25" height="43"/></g>\n<text x="197" y="263" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700">ЦИФРОВАЯ КОЛЛЕКЦИЯ</text>\n<path d="M335 140H420" stroke="#6f8ca4" stroke-width="5"/><path d="M404 125l20 15-20 15" fill="none" stroke="#6f8ca4" stroke-width="5"/>\n<rect x="450" y="48" width="360" height="185" rx="10" fill="#fff" stroke="#cbd5df" stroke-width="2"/>\n<text x="475" y="78" font-family="Arial" font-size="14" font-weight="700">ЭЛЕКТРОННЫЙ КАТАЛОГ</text>\n<rect x="475" y="93" width="310" height="38" rx="4" fill="#fff" stroke="#6f8ca4" stroke-width="3"/><text x="492" y="117" font-family="Arial" font-size="13" fill="#7a8794">Автор / название / тема</text>\n<rect x="475" y="146" width="310" height="32" fill="#f7f9fb" stroke="#d9e0e7"/><text x="490" y="167" font-family="Arial" font-size="12" font-weight="700">Библиографическая запись</text>\n<rect x="475" y="187" width="310" height="32" fill="#f7f9fb" stroke="#d9e0e7"/><text x="490" y="208" font-family="Arial" font-size="12" font-weight="700">Полный текст / доступ</text>\n</svg></div><div class="src">Электронно-форматные библиографические ресурсы включают базы данных и электронные каталоги; их задача — учет, поиск и навигация по документам.</div><div class="num">3</div></section>\n\n<section class="slide"><div class="ey">Слайд 4 · Научные базы</div><h2>Поиск в распределённом массиве</h2>\n<div class="explain">Научный поиск объединяет публикации, материалы конференций, диссертации и библиографические записи.</div>\n<div class="source-map">\n<style>\n.source-map{position:relative;height:282px;margin-top:10px}\n\n.source-map .s{position:absolute;width:225px;height:68px;background:#f7f9fb;border:1px solid #cbd5df;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px 14px}\n.source-map .s i{width:21px;height:21px;margin:0 0 5px;color:#43637e;stroke-width:1.8}.source-map .s b{font-size:13px;line-height:1.12;color:#321e48}\n.source-map .s1{left:4%;top:15px}.source-map .s2{right:4%;top:15px}.source-map .s3{left:4%;bottom:8px}.source-map .s4{right:4%;bottom:8px}\n.source-map .process{position:absolute;left:50%;top:78px;transform:translateX(-50%);width:250px;height:125px;border-radius:22px;background:#43637e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px}\n.source-map .step{height:25px;min-width:120px;border-radius:13px;background:#f7f9fb;color:#321e48;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}\n\n\n</style>\n\n<div class="s s1"><i data-lucide="file-text"></i><b>Статьи журналов</b></div>\n<div class="s s2"><i data-lucide="presentation"></i><b>Материалы конференций</b></div>\n<div class="s s3"><i data-lucide="graduation-cap"></i><b>Диссертации и ВКР</b></div>\n<div class="s s4"><i data-lucide="list"></i><b>Библиографические записи</b></div>\n<div class="process"><div class="step">ПОИСК</div><div class="step">ОТБОР</div><div class="step">ДОСТУП</div></div>\n</div><div class="src">Электронные библиографические ресурсы обеспечивают учёт, поиск и ориентирование в цифровом массиве документов.</div><div class="num">4</div></section>\n\n<section class="slide"><div class="ey">Слайд 5 · Поиск</div><h2>От запроса к источнику</h2>\n<div class="explain">Эффективный поиск проходит несколько последовательных этапов: от формулирования информационной потребности до выбора конкретного документа.</div>\n<div class="slide5-cards" style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:25px">\n<div class="item" style="min-height:145px;border:1px solid;border-radius:12px;padding:18px;text-align:center;box-sizing:border-box"><div style="font-size:25px;font-weight:800;color:#321e48">01</div><b>Запрос</b><span style="display:block;margin-top:9px;color:#657383;font-size:12px;line-height:1.35">Определить тему, ключевые понятия и цель поиска.</span></div>\n<div class="item" style="min-height:145px;border:1px solid;border-radius:12px;padding:18px;text-align:center;box-sizing:border-box"><div style="font-size:25px;font-weight:800;color:#321e48">02</div><b>Поиск</b><span style="display:block;margin-top:9px;color:#657383;font-size:12px;line-height:1.35">Использовать каталоги, базы данных и поисковые средства.</span></div>\n<div class="item" style="min-height:145px;border:1px solid;border-radius:12px;padding:18px;text-align:center;box-sizing:border-box"><div style="font-size:25px;font-weight:800;color:#321e48">03</div><b>Отбор</b><span style="display:block;margin-top:9px;color:#657383;font-size:12px;line-height:1.35">Сопоставить результаты с задачей и оценить качество источников.</span></div>\n<div class="item" style="min-height:145px;border:1px solid;border-radius:12px;padding:18px;text-align:center;box-sizing:border-box"><div style="font-size:25px;font-weight:800;color:#321e48">04</div><b>Источник</b><span style="display:block;margin-top:9px;color:#657383;font-size:12px;line-height:1.35">Перейти к документу, полному тексту или библиографической записи.</span></div>\n</div>\n<div style="margin-top:22px;display:flex;align-items:center;justify-content:center;gap:10px;color:#43637e;font-size:13px;font-weight:700"><span>ПОТРЕБНОСТЬ</span><span>→</span><span>ПОИСК</span><span>→</span><span>ОТБОР</span><span>→</span><span>ИСТОЧНИК</span></div>\n<div class="num">5</div></section>\n\n<section class="slide"><div class="ey">Слайд 6 · Оценка</div><h2>Как оценивать сетевой источник</h2><div class="explain">Сетевой доступ не гарантирует научную ценность: источник нужно проверить по ключевым критериям.</div><div class="cols"><div style="height:285px"><svg viewBox="0 0 500 285">\n<circle cx="250" cy="142" r="58" fill="#edf4f9" stroke="#254c6e" stroke-width="4"/>\n<g stroke="#9aabba" stroke-width="3"><line x1="250" y1="84" x2="250" y2="42"/><line x1="308" y1="142" x2="410" y2="142"/><line x1="250" y1="200" x2="250" y2="242"/><line x1="192" y1="142" x2="90" y2="142"/></g>\n<g fill="#f7f9fb" stroke="#b9c7d5" stroke-width="2"><rect x="175" y="14" width="150" height="42" rx="9"/><rect x="365" y="121" width="120" height="42" rx="9"/><rect x="175" y="229" width="150" height="42" rx="9"/><rect x="15" y="121" width="120" height="42" rx="9"/></g>\n<g font-family="Arial" text-anchor="middle" fill="#182534" font-size="12" font-weight="700"><text x="250" y="40">АВТОР / ОРГАНИЗАЦИЯ</text><text x="425" y="147">АКТУАЛЬНОСТЬ</text><text x="250" y="255">ДОСТОВЕРНОСТЬ</text><text x="75" y="147">НАУЧНЫЙ СТАТУС</text></g>\n<g font-family="Arial" text-anchor="middle" fill="#254c6e" font-weight="700"><text x="250" y="137">КАЧЕСТВО</text><text x="250" y="157">ИСТОЧНИКА</text></g></svg></div><div class="list slide6-right"><div class="item"><b>Автор и организация</b><span>Идентифицируемый автор или учреждение-издатель.</span></div><div class="item"><b>Научный статус</b><span>Публикация в научном издании, учебном издании или академическом ресурсе.</span></div><div class="item"><b>Актуальность</b><span>Соответствие материала цели поиска и состоянию предметной области.</span></div><div class="item"><b>Достоверность</b><span>Проверяемость сведений, ссылок и библиографических данных.</span></div></div></div><div class="num">6</div></section>\n\n<section class="slide"><div class="ey">Слайд 7 · Значение</div><h2>Сетевая информационная среда</h2><div class="explain">Для пользователя важна не отдельная база или библиотека, а связанная информационная среда. Она объединяет поиск, доступ к документам и работу разных участников образовательного и исследовательского процесса.</div><div class="visual"><svg viewBox="0 0 900 290">\n<g stroke="#9aabba" stroke-width="3"><line x1="450" y1="145" x2="165" y2="65"/><line x1="450" y1="145" x2="735" y2="65"/><line x1="450" y1="145" x2="165" y2="225"/><line x1="450" y1="145" x2="735" y2="225"/></g>\n<circle cx="450" cy="145" r="105" fill="#edf4f9" stroke="#254c6e" stroke-width="4"/>\n<g fill="#fff" stroke="#cbd6e0" stroke-width="2"><rect x="60" y="35" width="210" height="60" rx="9"/><rect x="630" y="35" width="210" height="60" rx="9"/><rect x="60" y="195" width="210" height="60" rx="9"/><rect x="630" y="195" width="210" height="60" rx="9"/></g>\n<g font-family="Arial" text-anchor="middle"><g font-size="15" font-weight="700"><text x="165" y="61">Студент</text><text x="735" y="61">Преподаватель</text><text x="165" y="221">Исследователь</text><text x="735" y="221">Библиотека</text></g>\n<g font-size="12" fill="#687687"><text x="165" y="81">поиск и самостоятельная работа</text><text x="735" y="81">учебные материалы</text><text x="165" y="241">публикации и данные</text><text x="735" y="241">доступ и навигация</text></g>\n<g fill="#254c6e" font-weight="700" font-size="14"><text x="450" y="133">СЕТЕВАЯ</text><text x="450" y="154">ИНФОРМАЦИОННАЯ</text><text x="450" y="175">СРЕДА</text></g></g></svg></div>\n<div class="src">Интеграция ресурсов формирует единое информационное пространство, в котором поиск, хранение и предоставление электронных документов связаны между собой.</div><div class="num">7</div></section>\n\n<section class="slide"><div class="ey">Слайд 8 · Выводы</div><h2>Что определяет эффективность сетевых ресурсов</h2><div class="explain">Эффективность сетевого ресурса определяется не только объёмом представленной информации. Важны структура ресурса, качество средств поиска и возможность оценить надёжность найденных сведений.</div>\n<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:26px">\n<div style="border-top:6px solid #254c6e;background:#f7f9fb;border:1px solid #d5dde6;padding:22px 20px;min-height:205px;text-align:center">\n<div style="font-size:28px;color:#43637e;margin-bottom:14px">01</div><b style="font-size:18px">Структура</b><p style="font-size:13px;color:#687687">Ресурс должен иметь понятную организацию, метаданные и средства навигации.</p></div>\n<div style="border-top:6px solid #43637e;background:#f7f9fb;border:1px solid #d5dde6;padding:22px 20px;min-height:205px;text-align:center">\n<div style="font-size:28px;color:#43637e;margin-bottom:14px">02</div><b style="font-size:18px">Поиск</b><p style="font-size:13px;color:#687687">Каталоги и базы данных сокращают путь от информационного запроса к документу.</p></div>\n<div style="border-top:6px solid #321e48;background:#f7f9fb;border:1px solid #d5dde6;padding:22px 20px;min-height:205px;text-align:center">\n<div style="font-size:28px;color:#43637e;margin-bottom:14px">03</div><b style="font-size:18px">Качество</b><p style="font-size:13px;color:#687687">Научная ценность определяется авторством, актуальностью и проверяемостью сведений.</p></div>\n</div>\n<div style="margin-top:22px;background:#edf4f9;border:1px solid #cbd8e3;padding:18px 24px;text-align:center;font-size:18px;font-weight:700;color:#43637e">Сетевой информационный ресурс — это не просто доступ к данным, а организованная система поиска, хранения и использования информации.</div>\n<div class="num">8</div></section>\n\n<section class="slide"><div class="ey">Источники</div><h2>Научная литература</h2><div class="four">\n<div class="mini"><b>Левин Г. Л.</b><span>Сетевые информационные ресурсы как объект библиографирования // Библиотековедение. 2017. Т. 66, № 4. С. 396–402.</span></div>\n<div class="mini"><b>Левин Г.</b><span>Электронные библиографические ресурсы и их библиографирование // Библиография. 2017. № 4. С. 46–54.</span></div>\n<div class="mini"><b>Панов А. В.</b><span>Сетевые информационные ресурсы: учебное пособие. М.: МГТУ МИРЭА, 2011. 119 с.</span></div>\n<div class="mini"><b>Цветков В. Я., Семушкина С. Г.</b><span>Электронные ресурсы и электронные услуги // Современные проблемы науки и образования. 2009. № 6-1. С. 39–40.</span></div>\n</div><div style="margin-top:25px;padding:16px;background:#f5f8fa;border-left:5px solid #254c6e;font-size:13px">Использованы научные статьи и учебное издание, посвящённые сетевым, электронным и библиографическим информационным ресурсам.</div><div class="num">9</div></section>\n</main><script>lucide.createIcons();</script><section class="slide thanks"><div class="ey">Завершение</div>\n<div class="thanks-wrap">\n<div class="thanks-copy"><div class="tiny">КемГИК · Сетевые информационные ресурсы</div><h1>Спасибо<br>за внимание!</h1>\n<p>Пусть поиск информации всегда приводит<br>к хорошим источникам.</p>\n<div class="thanks-line"><span></span><i data-lucide="cat"></i><span></span></div></div>\n<div class="cat-card"><div class="cat-ear left"></div><div class="cat-ear right"></div><div class="cat-face"><div class="cat-eye e1"></div><div class="cat-eye e2"></div><div class="cat-nose"></div><div class="cat-mouth"></div><div class="whisk w1"></div><div class="whisk w2"></div><div class="whisk w3"></div><div class="whisk w4"></div></div><div class="cat-caption">информация найдена ✓</div></div>\n</div><div class="num">10</div></section>\n<style>\n.thanks{background:#fcfdfc}.thanks-wrap{height:100%;display:flex;align-items:center;justify-content:center;gap:85px;margin-top:-12px}\n.thanks-copy{text-align:left}.tiny{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#43637e;font-weight:700;margin-bottom:18px}\n.thanks h1{font-size:55px;line-height:.98;margin:0 0 18px;color:#321e48}.thanks p{font-size:17px;color:#5b6977;line-height:1.4}\n.thanks-line{display:flex;align-items:center;gap:12px;margin-top:22px}.thanks-line span{display:block;width:65px;height:3px;background:#65dcd5;border-radius:3px}.thanks-line i{width:25px;height:25px;color:#43637e}\n.cat-card{position:relative;width:280px;height:220px;border-radius:30px;background:#edf4f9;border:2px solid #cbd8e3;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 30px #321e4812}\n.cat-face{position:relative;width:145px;height:125px;border-radius:48% 48% 44% 44%;background:#65dcd5;border:3px solid #43637e}\n.cat-ear{position:absolute;top:33px;width:62px;height:62px;background:#65dcd5;border:3px solid #43637e;transform:rotate(45deg);z-index:0}.cat-ear.left{left:55px}.cat-ear.right{right:55px}\n.cat-face{z-index:1}.cat-eye{position:absolute;top:47px;width:10px;height:14px;border-radius:50%;background:#321e48}.cat-eye.e1{left:40px}.cat-eye.e2{right:40px}\n.cat-nose{position:absolute;left:67px;top:67px;width:10px;height:8px;background:#321e48;transform:rotate(45deg);border-radius:2px}.cat-mouth{position:absolute;left:72px;top:75px;width:2px;height:12px;background:#321e48}\n.whisk{position:absolute;width:37px;height:2px;background:#43637e}.w1{left:3px;top:70px;transform:rotate(8deg)}.w2{left:1px;top:80px;transform:rotate(-4deg)}.w3{right:3px;top:70px;transform:rotate(-8deg)}.w4{right:1px;top:80px;transform:rotate(4deg)}\n.cat-caption{position:absolute;bottom:18px;font-size:12px;font-weight:700;color:#43637e}\n</style></body></html>'

def css_color(value):
    return str(value)

def apply_text_config(source: str) -> str:
    """
    Меняет только известные текстовые фрагменты.
    Структура HTML, SVG и CSS при этом не пересобираются.
    """
    result = source
    # Сначала длинные строки, чтобы не ломать их заменой коротких фрагментов.
    pairs = sorted(CONFIG["text"].items(), key=lambda p: len(p[0]), reverse=True)
    for old, new in pairs:
        result = result.replace(old, html_lib.escape(str(new), quote=False))
    return result

def build_override_css():
    c = CONFIG["colors"]
    l = CONFIG["layout"]
    f = CONFIG["font"]
    s = CONFIG["shape"]
    sh = CONFIG["shadow"]
    ic = CONFIG["icons"]

    return f"""
<style id="python-config-overrides">
* {{ box-sizing: border-box; }}
body {{
    background: {c["body_bg"]} !important;
    color: {c["primary"]} !important;
    font-family: {f["family"]} !important;
}}
.slide {{
    width: {l["slide_width_px"]}px !important;
    background: {c["slide_bg"]} !important;
    margin-bottom: {l["slide_margin_bottom_px"]}px !important;
    border-color: {c["border"]} !important;
    box-shadow: {sh["slide"]} !important;
    padding: {l["slide_padding_top_px"]}px {l["slide_padding_right_px"]}px
             {l["slide_padding_bottom_px"]}px {l["slide_padding_left_px"]}px !important;
}}
.slide:before {{
    width: {l["left_bar_width_px"]}px !important;
    background: {c["accent"]} !important;
}}
.ey {{
    font-size: {l["eyebrow_size_px"]}px !important;
    color: {c["accent"]} !important;
}}
h1, h2 {{
    color: {c["primary"]} !important;
}}
h1 {{ font-size: {l["h1_size_px"]}px !important; }}
h2 {{ font-size: {l["h2_size_px"]}px !important; }}
p {{ font-size: {l["body_size_px"]}px !important; }}
.explain {{
    border-left-width: {s["explain_border_width_px"]}px !important;
    background: {c["card_bg"]} !important;
    border-left-color: {c["accent_dark"]} !important;
    color: {c["text_muted"]} !important;
    font-size: {l["explain_size_px"]}px !important;
}}
.cards {{
    gap: {l["card_gap_px"]}px !important;
}}
.card {{
    background: {c["card_bg"]} !important;
    border-color: {c["border_2"]} !important;
    padding: {l["card_padding_y_px"]}px {l["card_padding_x_px"]}px !important;
    height: {l["card_height_px"]}px !important;
}}
.card b {{ font-size: {l["card_title_size_px"]}px !important; }}
.card small {{
    color: {c["text_muted"]} !important;
    font-size: {l["card_text_size_px"]}px !important;
}}
.card .lucide {{
    width: {ic["card_px"]}px !important;
    height: {ic["card_px"]}px !important;
    color: {c["accent"]} !important;
    stroke-width: {ic["stroke_width"]} !important;
}}
.visual {{ height: {l["visual_height_px"]}px !important; }}
.src {{
    left: {l["source_left_px"]}px !important;
    bottom: {l["source_bottom_px"]}px !important;
    color: {c["text_muted_2"]} !important;
    font-size: {l["source_size_px"]}px !important;
}}
.num {{
    right: {l["number_right_px"]}px !important;
    bottom: {l["number_bottom_px"]}px !important;
    color: {c["text_muted_2"]} !important;
    font-size: {l["slide_number_size_px"]}px !important;
}}
.node-card .lucide {{
    width: {ic["node_px"]}px !important;
    height: {ic["node_px"]}px !important;
    stroke-width: {ic["stroke_width"]} !important;
}}
.resource-map .n, .source-map .s {{
    background: {c["card_bg"]} !important;
    border-color: {c["line"]} !important;
}}
.resource-map .n b, .source-map .s b {{
    color: {c["primary"]} !important;
}}
.resource-map .n i, .source-map .s i {{
    color: {c["accent"]} !important;
    stroke-width: {ic["stroke_width"]} !important;
}}
.resource-map .core {{
    background: {c["accent_light"]} !important;
    border-color: {c["accent"]} !important;
}}
.resource-map .core span {{
    color: {c["primary"]} !important;
}}
.source-map .process {{
    background: {c["accent"]} !important;
}}
.source-map .step {{
    background: {c["card_bg"]} !important;
    color: {c["primary"]} !important;
}}
.slide6-right .item {{
    background: {c["primary"]} !important;
    border-color: {c["primary"]} !important;
}}
.thanks {{
    background: {c["slide_bg"]} !important;
}}
.thanks h1 {{ color: {c["primary"]} !important; }}
.thanks p {{ color: {c["text_muted"]} !important; }}
.thanks-line span {{ background: {c["turquoise"]} !important; }}
.cat-card {{
    background: {c["accent_light"]} !important;
    border-color: {c["border"]} !important;
    box-shadow: {sh["thanks_card"]} !important;
}}
.cat-face, .cat-ear {{
    background: {c["turquoise"]} !important;
    border-color: {c["accent"]} !important;
}}
.cat-eye, .cat-nose, .cat-mouth {{
    background: {c["primary"]} !important;
}}
.whisk {{ background: {c["accent"]} !important; }}
.cat-caption {{ color: {c["accent"]} !important; }}
</style>
"""

def make_html():
    result = apply_text_config(ORIGINAL_HTML)

    # CONFIG overrides are inserted immediately before </head>.
    result = result.replace("</head>", build_override_css() + "</head>", 1)

    # The original HTML is a page with a toolbar and centered 1160px slides.
    # We keep this behavior to preserve v7's geometry. Screenshotting the element
    # itself below guarantees that the PPT slide is not cropped or squashed.
    return result

def render_to_pptx():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit(
            "Не найден Playwright. Установите: pip install playwright python-pptx pillow "
            "и затем: playwright install chromium"
        )

    try:
        from pptx import Presentation
        from pptx.util import Inches
    except ImportError:
        raise SystemExit(
            "Не найден python-pptx. Установите: pip install python-pptx"
        )

    base = Path(__file__).resolve().parent
    generated_html = base / "_v7_generated.html"
    render_dir = base / "_v7_rendered"
    render_dir.mkdir(exist_ok=True)

    generated_html.write_text(make_html(), encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1600, "height": 1000},
            device_scale_factor=CONFIG["render"]["device_scale_factor"],
        )
        page.goto(generated_html.as_uri(), wait_until="networkidle")
        page.wait_for_timeout(CONFIG["render"]["wait_ms"])

        slides = page.locator(".slide")
        count = slides.count()
        if count == 0:
            browser.close()
            raise RuntimeError("В HTML не найдено ни одного элемента .slide")

        image_paths = []
        for i in range(count):
            slide = slides.nth(i)
            # Screenshot the actual slide element, not the whole browser viewport.
            # This is the critical part that preserves v7's proportions.
            out = render_dir / f"slide_{{i+1:02d}}.png"
            slide.screenshot(path=str(out))
            image_paths.append(out)

        browser.close()

    prs = Presentation()
    prs.slide_width = Inches(CONFIG["ppt_width_in"])
    prs.slide_height = Inches(CONFIG["ppt_height_in"])

    # Remove the default first slide.
    while len(prs.slides):
        rId = prs.slides._sldIdLst[0].rId
        prs.part.drop_rel(rId)
        del prs.slides._sldIdLst[0]

    blank = prs.slide_layouts[6]

    for image_path in image_paths:
        slide = prs.slides.add_slide(blank)
        slide.shapes.add_picture(
            str(image_path),
            0, 0,
            width=prs.slide_width,
            height=prs.slide_height,
        )

    output = base / CONFIG["output_name"]
    prs.save(str(output))

    print(f"Готово: {{output}}")
    print(f"Слайдов: {{len(image_paths)}}")
    print("Основа: исходный HTML v7, без пересборки содержимого.")

    if not CONFIG["render"]["keep_intermediate"]:
        try:
            generated_html.unlink()
            for pth in render_dir.glob("*.png"):
                pth.unlink()
            render_dir.rmdir()
        except OSError:
            pass

if __name__ == "__main__":
    render_to_pptx()
