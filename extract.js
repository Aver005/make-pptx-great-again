(() => {
  const px = v => parseFloat(v) || 0;
  function hex(c){
    if(!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/); if(!m) return null;
    const p = m[1].split(',').map(s=>parseFloat(s));
    const a = p.length>3 ? p[3] : 1;
    if(a===0) return null;
    return p.slice(0,3).map(x=>Math.round(x).toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  const slidesEls = [...document.querySelectorAll('section.slide')];
  const RESULT = [];

  slidesEls.forEach((slide, si) => {
    const S = slide.getBoundingClientRect();
    const ox = S.left, oy = S.top;
    const boxes=[], texts=[], images=[];

    const cbBar = getComputedStyle(slide, '::before');
    boxes.push({x:0,y:0,w:px(cbBar.width)||7,h:S.height, fill: hex(cbBar.backgroundColor)||'43637E', radius:0});

    const rasterRoots = new Set();
    slide.querySelectorAll('svg.lucide').forEach(el=>rasterRoots.add(el));
    const diagSvgs = [...slide.querySelectorAll('svg')].filter(v=>!v.classList.contains('lucide'));
    diagSvgs.forEach(el=>rasterRoots.add(el));
    const catCard = slide.querySelector('.cat-card');
    if(catCard) rasterRoots.add(catCard);

    const insideRaster = el => { for(const r of rasterRoots){ if(r!==el && r.contains(el)) return true; } return false; };
    const hasDirectText = el => { for(const n of el.childNodes){ if(n.nodeType===3 && n.textContent.trim()!=='') return true; } return false; };
    const rangeRect = el => { const rg=document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect(); };

    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_ELEMENT);
    const all=[]; let cur=walker.currentNode; while(cur){ all.push(cur); cur=walker.nextNode(); }

    for(const el of all){
      const tag = el.tagName.toLowerCase();
      if(tag==='style'||tag==='script'||tag==='br') continue;
      if(rasterRoots.has(el) || insideRaster(el)) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if(r.width<1 || r.height<1) continue;

      const fill = hex(cs.backgroundColor);
      const sides = ['Top','Right','Bottom','Left'].map(s=>({w:px(cs['border'+s+'Width']), c:hex(cs['border'+s+'Color']), s:s.toLowerCase()}));
      const visSides = sides.filter(b=>b.w>0.4 && b.c);
      const uniform = visSides.length===4 && visSides.every(b=>Math.abs(b.w-visSides[0].w)<0.5 && b.c===visSides[0].c);
      const rad = px(cs.borderTopLeftRadius);
      const isOval = rad>0 && rad>=Math.min(r.width,r.height)/2 - 1;
      if(fill || visSides.length){
        const box = {x:r.left-ox, y:r.top-oy, w:r.width, h:r.height, fill: fill||null, radius: isOval?-1:rad};
        if(uniform){ box.stroke=visSides[0].c; box.strokeW=visSides[0].w; }
        boxes.push(box);
        if(!uniform){
          for(const b of visSides){
            let bx=r.left-ox, by=r.top-oy, bw=r.width, bh=r.height;
            if(b.s==='top') bh=b.w;
            else if(b.s==='bottom'){ by=r.bottom-oy-b.w; bh=b.w; }
            else if(b.s==='left') bw=b.w;
            else if(b.s==='right'){ bx=r.right-ox-b.w; bw=b.w; }
            boxes.push({x:bx,y:by,w:bw,h:bh, fill:b.c, radius:0});
          }
        }
      }

      if(hasDirectText(el)){
        const tr = rangeRect(el);
        if(tr.width>0 && tr.height>0){
          const fs=px(cs.fontSize), fw=cs.fontWeight;
          texts.push({x:tr.left-ox, y:tr.top-oy, w:tr.width, h:tr.height, text:el.innerText,
            size:fs, bold:(fw==='bold'||(parseInt(fw)||400)>=600), color:hex(cs.color)||'000000',
            align:cs.textAlign, lh:px(cs.lineHeight)||fs*1.2, spacing:px(cs.letterSpacing)||0});
        }
      }
    }

    diagSvgs.forEach((svg,k)=>{
      const id='diag-'+si+'-'+k; svg.setAttribute('data-cap', id);
      const sr = svg.getBoundingClientRect();
      const vb = (svg.getAttribute('viewBox')||'0 0 1 1').split(/\s+/).map(Number);
      const scale = sr.width / (vb[2]||1);
      images.push({type:'diag', id, x:sr.left-ox, y:sr.top-oy, w:sr.width, h:sr.height});
      svg.querySelectorAll('text').forEach(t=>{
        const tr=t.getBoundingClientRect(); if(tr.width<1) return;
        const tcs=getComputedStyle(t);
        const anchor=(t.getAttribute('text-anchor')||tcs.textAnchor||'start');
        const fsUser=px(tcs.fontSize);
        const fw=t.getAttribute('font-weight')||tcs.fontWeight;
        texts.push({x:tr.left-ox, y:tr.top-oy, w:tr.width, h:tr.height, text:t.textContent,
          size:fsUser*scale, bold:(fw==='bold'||(parseInt(fw)||400)>=600),
          color:hex(tcs.fill)||hex(tcs.color)||'000000',
          align:(anchor==='middle'?'center':anchor==='end'?'right':'left'),
          lh:fsUser*scale*1.2, spacing:0, svgText:true});
      });
    });

    slide.querySelectorAll('svg.lucide').forEach((el,k)=>{
      const id='ic-'+si+'-'+k; el.setAttribute('data-cap', id);
      const r=el.getBoundingClientRect();
      images.push({type:'icon', id, x:r.left-ox, y:r.top-oy, w:r.width, h:r.height});
    });

    if(catCard){
      catCard.setAttribute('data-cap','catcard-'+si);
      const r=catCard.getBoundingClientRect();
      images.push({type:'cat', id:'catcard-'+si, x:r.left-ox, y:r.top-oy, w:r.width, h:r.height});
      const cap=catCard.querySelector('.cat-caption');
      if(cap){ const cr=cap.getBoundingClientRect(); const ccs=getComputedStyle(cap);
        texts.push({x:cr.left-ox, y:cr.top-oy, w:cr.width, h:cr.height, text:cap.innerText,
          size:px(ccs.fontSize), bold:true, color:hex(ccs.color)||'43637E', align:'center',
          lh:px(ccs.fontSize)*1.2, spacing:0}); }
    }

    RESULT.push({index:si, w:S.width, h:S.height, boxes, texts, images});
  });
  return {epx: 12192000/1160, slides: RESULT};
})()
