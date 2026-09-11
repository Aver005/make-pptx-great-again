#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
HTML -> PPTX, 1 HTML .slide = 1 PPTX slide.

Главный принцип:
- HTML рендерится настоящим Chromium/Playwright.
- Каждый .slide снимается отдельно в PNG в точном размере 1600x900.
- PNG вставляется на слайд PPTX 16:9 БЕЗ растяжения/обрезки.
- В результате PPTX визуально соответствует браузерному HTML.

Установка:
    python -m pip install playwright python-pptx
    python -m playwright install chromium

Запуск:
    python html_to_pptx.py "setevye_informatsionnye_resursy_visual_mockup_v7(1).html"

Результат:
    рядом с HTML появится файл <имя>_converted.pptx
"""

import asyncio
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches
from playwright.async_api import async_playwright


# ---------- Настройки рендера ----------
VIEW_W = 1600
VIEW_H = 900

# PPTX 16:9.
PPT_W_IN = 13.333333
PPT_H_IN = 7.5

# PNG будет ровно 1600x900.
# Это важно: не используем "full_page" и не снимаем весь document.
PNG_W = 1600
PNG_H = 900


async def render_slides(html_file: Path, png_dir: Path):
    png_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ],
        )

        context = await browser.new_context(
            viewport={"width": VIEW_W, "height": VIEW_H},
            device_scale_factor=1,
        )

        page = await context.new_page()

        # file:// позволяет HTML работать локально.
        await page.goto(
            html_file.resolve().as_uri(),
            wait_until="networkidle",
        )

        # Убираем только панель сверху и служебные отступы.
        # Сам дизайн .slide НЕ переписываем.
        await page.add_style_tag(content="""
            .toolbar {
                display: none !important;
            }

            html, body {
                margin: 0 !important;
            }

            .deck {
                padding-top: 0 !important;
            }

            .slide {
                margin-top: 0 !important;
            }
        """)

        # Даём внешним иконкам/шрифтам дорисоваться.
        await page.wait_for_timeout(1200)

        slides = page.locator("section.slide")
        count = await slides.count()

        if count == 0:
            await browser.close()
            raise RuntimeError(
                "В HTML не найдено ни одного элемента section.slide"
            )

        print(f"Найдено слайдов: {count}")

        png_files = []

        for i in range(count):
            slide = slides.nth(i)

            # Прокручиваем конкретный слайд в область viewport.
            await slide.scroll_into_view_if_needed()
            await page.wait_for_timeout(100)

            # Берём фактический bounding box.
            box = await slide.bounding_box()

            if not box:
                raise RuntimeError(f"Не удалось получить размеры слайда {i + 1}")

            # В HTML слайды 16:9. Снимаем только сам элемент.
            # scale 1600 / фактическая ширина позволяет получить ровно 1600x900.
            scale = PNG_W / box["width"]

            png = png_dir / f"slide_{i + 1:02d}.png"

            await slide.screenshot(
                path=str(png),
                animations="disabled",
                scale="css",
            )

            # Playwright scale="css" даст фактический CSS-размер.
            # Поэтому, если CSS-слайд не ровно 1600x900, приводим PNG к точному
            # 1600x900 только если это действительно необходимо.
            from PIL import Image

            im = Image.open(png).convert("RGB")

            if im.size != (PNG_W, PNG_H):
                # Ресайзим ВЕСЬ слайд пропорционально в 1600x900.
                # Так как исходный slide = 16:9, искажения не будет.
                im = im.resize((PNG_W, PNG_H), Image.Resampling.LANCZOS)
                im.save(png, "PNG", optimize=True)

            print(f"  {i + 1:02d}: {im.size[0]}x{im.size[1]} -> {png.name}")
            png_files.append(png)

        await browser.close()

    return png_files


def make_pptx(png_files, output_file: Path):
    prs = Presentation()

    # Жёстко задаём 16:9.
    prs.slide_width = Inches(PPT_W_IN)
    prs.slide_height = Inches(PPT_H_IN)

    blank_layout = prs.slide_layouts[6]

    for png in png_files:
        slide = prs.slides.add_slide(blank_layout)

        # Картинка занимает ВЕСЬ слайд:
        # x=0, y=0, width=slide_width, height=slide_height.
        slide.shapes.add_picture(
            str(png),
            0,
            0,
            width=prs.slide_width,
            height=prs.slide_height,
        )

    prs.save(output_file)


async def main():
    if len(sys.argv) < 2:
        print(
            'Использование:\n'
            '  python html_to_pptx.py "presentation.html"\n'
        )
        sys.exit(1)

    html_file = Path(sys.argv[1]).expanduser().resolve()

    if not html_file.exists():
        raise FileNotFoundError(f"Файл не найден: {html_file}")

    if html_file.suffix.lower() != ".html":
        raise ValueError("Нужен именно .html файл")

    work_dir = html_file.parent / f".{html_file.stem}_rendered"
    png_dir = work_dir / "png"

    output_file = html_file.with_name(
        html_file.stem + "_converted.pptx"
    )

    print(f"HTML:    {html_file}")
    print(f"Output:  {output_file}")
    print()

    png_files = await render_slides(html_file, png_dir)
    make_pptx(png_files, output_file)

    print()
    print("Готово!")
    print(f"Слайдов: {len(png_files)}")
    print(f"PPTX:    {output_file}")
    print()
    print("Каждый слайд вставлен как PNG 1600x900 на полный слайд 16:9.")


if __name__ == "__main__":
    asyncio.run(main())
