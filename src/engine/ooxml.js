(() => {
  // PptxGenJS не умеет градиентные заливки, переходы между слайдами и анимацию
  // появления, хотя в самом формате всё это есть. Дописываем их в уже собранный
  // файл: pptx — это zip, а JSZip лежит в том же бандле, что и PptxGenJS.

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pct = (v) => Math.round(clamp(v, 0, 1) * 100000);

  const esc = (v) =>
    String(v).replace(
      /[<>&"]/g,
      (c) => `&${{ "<": "lt", ">": "gt", "&": "amp", '"': "quot" }[c]};`,
    );

  function colorXml(hexValue, alpha) {
    const body = alpha != null && alpha < 1 ? `<a:alpha val="${pct(alpha)}"/>` : "";
    return `<a:srgbClr val="${esc(hexValue)}">${body}</a:srgbClr>`;
  }

  // CSS считает угол от «вверх» по часовой, OOXML — от «вправо» по часовой.
  function gradXml(grad) {
    const stops = grad.stops
      .map((s) => `<a:gs pos="${pct(s.pos)}">${colorXml(s.hex, s.alpha)}</a:gs>`)
      .join("");
    if (grad.kind === "radial") {
      const l = pct(grad.center.x / 100);
      const t = pct(grad.center.y / 100);
      // В заливке по пути нулевая позиция — центр (fillToRect), а не край:
      // проверено рендером, обратный порядок давал вывернутый наизнанку фон.
      return (
        `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst>` +
        `<a:path path="circle"><a:fillToRect l="${l}" t="${t}" r="${100000 - l}" b="${100000 - t}"/></a:path>` +
        "</a:gradFill>"
      );
    }
    const ang = Math.round((((grad.angle - 90) % 360) + 360) % 360) * 60000;
    return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`;
  }

  // Своя геометрия: путь задаётся в долях от размера фигуры, поэтому
  // растягивается вместе с ней — как и должна вести себя фигура PowerPoint.
  function custGeomXml(points) {
    const pt = ([x, y]) => `<a:pt x="${pct(x)}" y="${pct(y)}"/>`;
    const body =
      `<a:moveTo>${pt(points[0])}</a:moveTo>` +
      points
        .slice(1)
        .map((p) => `<a:lnTo>${pt(p)}</a:lnTo>`)
        .join("") +
      "<a:close/>";
    return (
      "<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>" +
      '<a:rect l="0" t="0" r="r" b="b"/>' +
      `<a:pathLst><a:path w="100000" h="100000">${body}</a:path></a:pathLst></a:custGeom>`
    );
  }

  // Скругление разными радиусами по углам: в готовых фигурах PowerPoint такого
  // нет, зато есть своя геометрия с дугами. Путь считается в EMU самой фигуры,
  // иначе круглые углы стали бы овальными на неквадратном блоке.
  function cornerGeomXml(corners, size) {
    const w = Math.max(1, Math.round(size.w));
    const h = Math.max(1, Math.round(size.h));
    const [tl, tr, br, bl] = corners.map((v) => Math.max(0, Math.round(v)));
    const pt = (x, y) => `<a:pt x="${Math.round(x)}" y="${Math.round(y)}"/>`;
    const arc = (radius, start) =>
      radius > 0
        ? `<a:arcTo wR="${radius}" hR="${radius}" stAng="${start * 60000}" swAng="${90 * 60000}"/>`
        : "";
    const body =
      `<a:moveTo>${pt(tl, 0)}</a:moveTo>` +
      `<a:lnTo>${pt(w - tr, 0)}</a:lnTo>${arc(tr, 270)}` +
      `<a:lnTo>${pt(w, h - br)}</a:lnTo>${arc(br, 0)}` +
      `<a:lnTo>${pt(bl, h)}</a:lnTo>${arc(bl, 90)}` +
      `<a:lnTo>${pt(0, tl)}</a:lnTo>${arc(tl, 180)}` +
      "<a:close/>";
    return (
      "<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>" +
      '<a:rect l="0" t="0" r="r" b="b"/>' +
      `<a:pathLst><a:path w="${w}" h="${h}">${body}</a:path></a:pathLst></a:custGeom>`
    );
  }

  // Вертикальный текст и колонки живут в атрибутах bodyPr — библиотека их не
  // выставляет, а формат понимает.
  function retypeBody(xml, name, body) {
    const at = xml.indexOf(`name="${name}"`);
    if (at < 0) return xml;
    const start = xml.indexOf("<a:bodyPr", at);
    if (start < 0) return xml;
    const end = xml.indexOf(">", start);
    if (end < 0) return xml;
    let head = xml.slice(start, end);
    if (body.vert && !head.includes(" vert=")) head += ` vert="${body.vert}"`;
    if (body.numCol > 1 && !head.includes(" numCol=")) {
      head += ` numCol="${body.numCol}"`;
      if (body.spcCol > 0) head += ` spcCol="${body.spcCol}"`;
    }
    return xml.slice(0, start) + head + xml.slice(end);
  }

  // Произвольный путь: тот же custGeom, только с кривыми и несколькими
  // подпутями — так выглядит любая схема и любая иконка.
  function pathGeomXml(subs) {
    const pt = ([x, y]) => `<a:pt x="${pct(x)}" y="${pct(y)}"/>`;
    const paths = subs
      .map((sub) => {
        const body =
          `<a:moveTo>${pt(sub.start)}</a:moveTo>` +
          sub.segs
            .map((seg) =>
              seg.type === "L"
                ? `<a:lnTo>${pt(seg.to)}</a:lnTo>`
                : `<a:cubicBezTo>${pt(seg.c1)}${pt(seg.c2)}${pt(seg.to)}</a:cubicBezTo>`,
            )
            .join("") +
          (sub.closed ? "<a:close/>" : "");
        return `<a:path w="100000" h="100000">${body}</a:path>`;
      })
      .join("");
    return (
      "<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>" +
      '<a:rect l="0" t="0" r="r" b="b"/>' +
      `<a:pathLst>${paths}</a:pathLst></a:custGeom>`
    );
  }

  // Скруглённые концы и стыки линий библиотека не выставляет, а без них
  // иконки выглядят обрубленными.
  function retypeLine(xml, name, cap, join) {
    const at = xml.indexOf(`name="${name}"`);
    if (at < 0) return xml;
    const start = xml.indexOf("<a:ln ", at);
    if (start < 0) return xml;
    const end = xml.indexOf(">", start);
    if (end < 0) return xml;
    let head = xml.slice(start, end);
    if (cap && !head.includes(" cap=")) head += ` cap="${cap}"`;
    let tail = xml.slice(end);
    if (join === "rnd" && !tail.startsWith("><a:round/>")) {
      const close = tail.indexOf("</a:ln>");
      if (close > 0) tail = tail.slice(0, close) + "<a:round/>" + tail.slice(close);
    }
    return xml.slice(0, start) + head + tail;
  }

  const TRANSITION = {
    fade: "<p:fade/>",
    cut: "<p:cut/>",
    dissolve: "<p:dissolve/>",
    push: '<p:push dir="u"/>',
    pull: '<p:pull dir="u"/>',
    wipe: '<p:wipe dir="r"/>',
    cover: '<p:cover dir="d"/>',
    split: '<p:split orient="horz" dir="out"/>',
    blinds: '<p:blinds dir="horz"/>',
    checker: '<p:checker dir="horz"/>',
    comb: '<p:comb dir="horz"/>',
    circle: "<p:circle/>",
    diamond: "<p:diamond/>",
    plus: "<p:plus/>",
    wedge: "<p:wedge/>",
    newsflash: "<p:newsflash/>",
    strips: '<p:strips dir="ld"/>',
    wheel: '<p:wheel spokes="1"/>',
    zoom: '<p:zoom dir="in"/>',
    random: "<p:random/>",
  };

  // Только те эффекты появления, что задаются фильтром animEffect: их XML
  // короткий и одинаковый, а значит нечему тихо сломаться.
  const ANIM = {
    fade: { id: 10, filter: "fade" },
    wipe: { id: 22, filter: "wipe(up)", subtype: 4 },
    split: { id: 13, filter: "barn(inVertical)", subtype: 26 },
    appear: { id: 1, filter: null },
    blinds: { id: 3, filter: "blinds(horizontal)", subtype: 10 },
    dissolve: { id: 9, filter: "dissolve" },
    wheel: { id: 21, filter: "wheel(1)", subtype: 1 },
  };

  // Один щелчок — одна группа: все фигуры, помеченные общим data-anim,
  // появляются вместе. Номера cTn обязаны расти по порядку документа, иначе
  // PowerPoint не соберёт таймлайн.
  function timingXml(steps) {
    if (!steps.length) return "";
    const byKey = [];
    for (const step of steps) {
      const same = byKey.find((g) => g.key === step.key);
      if (same) same.spids.push(step.spid);
      else byKey.push({ key: step.key, anim: step.anim, dur: step.dur, spids: [step.spid] });
    }

    let id = 2;
    const next = () => ++id;
    const groups = byKey
      .map((group) => {
        const effect = ANIM[group.anim] || ANIM.fade;
        const groupId = next();
        const innerId = next();
        const body = group.spids
          .map((spid) => {
            const effectId = next();
            const setId = next();
            const filter =
              effect.filter === null
                ? ""
                : `<p:animEffect transition="in" filter="${effect.filter}"><p:cBhvr>` +
                  `<p:cTn id="${next()}" dur="${group.dur}"/>` +
                  `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`;
            return (
              `<p:par><p:cTn id="${effectId}" presetID="${effect.id}" presetClass="entr" ` +
              `presetSubtype="${effect.subtype || 0}" fill="hold" grpId="0" nodeType="${
                effectId === innerId + 1 ? "clickEffect" : "withEffect"
              }">` +
              '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>' +
              `<p:set><p:cBhvr><p:cTn id="${setId}" dur="1" fill="hold">` +
              '<p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>' +
              `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
              "<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>" +
              '</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>' +
              filter +
              "</p:childTnLst></p:cTn></p:par>"
            );
          })
          .join("");
        return (
          `<p:par><p:cTn id="${groupId}" fill="hold">` +
          '<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>' +
          `<p:par><p:cTn id="${innerId}" fill="hold">` +
          '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>' +
          body +
          "</p:childTnLst></p:cTn></p:par>" +
          "</p:childTnLst></p:cTn></p:par>"
        );
      })
      .join("");
    const spids = byKey.flatMap((g) => g.spids);

    return (
      "<p:timing><p:tnLst><p:par>" +
      '<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
      '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq">' +
      `<p:childTnLst>${groups}</p:childTnLst></p:cTn>` +
      '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>' +
      '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>' +
      "</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>" +
      `<p:bldLst>${spids.map((spid) => `<p:bldP spid="${spid}" grpId="0" animBg="1"/>`).join("")}</p:bldLst>` +
      "</p:timing>"
    );
  }

  // Группа фигур. Рамка группы совпадает с рамкой детей (chOff/chExt равны
  // off/ext), поэтому координаты внутри пересчитывать не нужно — дети
  // переезжают в группу как есть.
  function blockOf(xml, name) {
    const at = xml.indexOf(`name="${name}"`);
    if (at < 0) return null;
    const start = xml.lastIndexOf("<p:sp>", at);
    const end = xml.indexOf("</p:sp>", at);
    if (start < 0 || end < 0) return null;
    return { start, end: end + "</p:sp>".length };
  }

  function extentOf(block) {
    const off = block.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
    const ext = block.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!off || !ext) return null;
    const x = Number(off[1]);
    const y = Number(off[2]);
    return { x, y, right: x + Number(ext[1]), bottom: y + Number(ext[2]) };
  }

  function makeGroup(xml, names, id) {
    const blocks = [];
    for (const name of names) {
      const at = blockOf(xml, name);
      if (!at) return xml;
      blocks.push({ name, ...at, text: xml.slice(at.start, at.end) });
    }
    blocks.sort((a, b) => a.start - b.start);
    // Резать можно только подряд идущие фигуры: иначе в группу затесалось бы
    // чужое, а порядок наложения поехал бы.
    for (let i = 1; i < blocks.length; i++) {
      if (xml.slice(blocks[i - 1].end, blocks[i].start).trim() !== "") return xml;
    }

    let box = null;
    for (const block of blocks) {
      const ext = extentOf(block.text);
      if (!ext) return xml;
      box = box
        ? {
            x: Math.min(box.x, ext.x),
            y: Math.min(box.y, ext.y),
            right: Math.max(box.right, ext.right),
            bottom: Math.max(box.bottom, ext.bottom),
          }
        : ext;
    }
    if (!box) return xml;

    const frame =
      `<a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.right - box.x}" cy="${box.bottom - box.y}"/>` +
      `<a:chOff x="${box.x}" y="${box.y}"/><a:chExt cx="${box.right - box.x}" cy="${box.bottom - box.y}"/>`;
    const group =
      "<p:grpSp><p:nvGrpSpPr>" +
      `<p:cNvPr id="${id}" name="Рисунок ${id}"/><p:cNvGrpSpPr/><p:nvPr/>` +
      `</p:nvGrpSpPr><p:grpSpPr><a:xfrm>${frame}</a:xfrm></p:grpSpPr>` +
      blocks.map((b) => b.text).join("") +
      "</p:grpSp>";
    return xml.slice(0, blocks[0].start) + group + xml.slice(blocks[blocks.length - 1].end);
  }

  function shapeIdOf(xml, name) {
    const at = xml.indexOf(`name="${name}"`);
    if (at < 0) return null;
    const head = xml.lastIndexOf("<p:cNvPr ", at);
    if (head < 0) return null;
    const id = xml.slice(head, at).match(/id="(\d+)"/);
    return id ? id[1] : null;
  }

  function reshape(xml, name, geom) {
    const at = xml.indexOf(`name="${name}"`);
    if (at < 0) return xml;
    const start = xml.indexOf("<a:prstGeom", at);
    const tail = xml.indexOf("</a:prstGeom>", start);
    if (start < 0 || tail < 0) return xml;
    return xml.slice(0, start) + geom + xml.slice(tail + "</a:prstGeom>".length);
  }

  function paintGradient(xml, name, grad) {
    const at = xml.indexOf(`name="${name}"`);
    if (at < 0) return xml;
    const start = xml.indexOf("<p:spPr>", at);
    const end = xml.indexOf("</p:spPr>", start);
    if (start < 0 || end < 0) return xml;
    const head = xml.slice(start, end);
    const filled = head.replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/, gradXml(grad));
    if (filled === head) return xml;
    return xml.slice(0, start) + filled + xml.slice(end);
  }

  async function applyOoxml(blob, ir, patches = []) {
    const JSZipRef = window.JSZip;
    if (!JSZipRef) return blob;

    try {
      const zip = await JSZipRef.loadAsync(await blob.arrayBuffer());
      for (const slide of ir.slides) {
        const path = `ppt/slides/slide${slide.index + 1}.xml`;
        const file = zip.file(path);
        if (!file) continue;
        let xml = await file.async("string");

        for (const patch of patches) {
          if (patch.slide !== slide.index) continue;
          if (patch.grad) xml = paintGradient(xml, patch.name, patch.grad);
          if (patch.path) xml = reshape(xml, patch.name, pathGeomXml(patch.path));
          else if (patch.clip) xml = reshape(xml, patch.name, custGeomXml(patch.clip));
          else if (patch.corners)
            xml = reshape(xml, patch.name, cornerGeomXml(patch.corners, patch.size));
          if (patch.body) xml = retypeBody(xml, patch.name, patch.body);
          if (patch.cap || patch.join) xml = retypeLine(xml, patch.name, patch.cap, patch.join);
        }

        let groupId = 9000;
        for (const patch of patches) {
          if (patch.slide !== slide.index || !patch.names) continue;
          xml = makeGroup(xml, patch.names, groupId++);
        }

        const steps = [];
        for (const patch of patches) {
          if (patch.slide !== slide.index || !patch.anim) continue;
          const spid = shapeIdOf(xml, patch.name);
          if (spid)
            steps.push({
              spid,
              key: patch.anim.key,
              anim: patch.anim.kind,
              dur: patch.anim.dur,
            });
        }

        const tail =
          (slide.transition && TRANSITION[slide.transition]
            ? `<p:transition spd="med">${TRANSITION[slide.transition]}</p:transition>`
            : "") + timingXml(steps);
        if (tail) {
          const anchor = "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>";
          xml = xml.includes(anchor)
            ? xml.replace(anchor, anchor + tail)
            : xml.replace("</p:cSld>", `</p:cSld>${anchor}${tail}`);
        }
        zip.file(path, xml);
      }
      // Перепаковка нужна и сама по себе: PptxGenJS кладёт файлы в архив без
      // сжатия, а XML жмётся в разы — студент отдаёт файл вчетверо легче.
      return await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        compression: "DEFLATE",
      });
    } catch {
      // Файл уже собран и рабочий — эффекты не стоят того, чтобы его потерять.
      return blob;
    }
  }

  window.MPGA = window.MPGA || {};
  window.MPGA.applyOoxml = applyOoxml;
  window.MPGA.TRANSITIONS = Object.keys(TRANSITION);
  window.MPGA.ANIMATIONS = Object.keys(ANIM);
})();
