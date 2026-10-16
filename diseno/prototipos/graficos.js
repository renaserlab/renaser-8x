/* Gráficos del prototipo. Cada uno se dibuja desde sus datos (atributos data-*): nada es una imagen pegada.
   Un valor null es «sin dato»: se dibuja rayado o como hueco, nunca como cero. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const soles = (v) => "S/ " + Math.round(v).toLocaleString("es-PE");

  /* MEDIDOR SEMICIRCULAR SEGMENTADO: catorce cápsulas sobre un arco; las llenas van de azul claro a azul. */
  document.querySelectorAll("[data-medidor]").forEach((svg) => {
    const pct = Number(svg.dataset.medidor);
    const n = 14, cx = 130, cy = 128, r1 = 84, r2 = 116;
    const llenas = Math.round((pct / 100) * n);
    for (let i = 0; i < n; i++) {
      const a = Math.PI - (i * Math.PI) / (n - 1);
      const x1 = cx + r1 * Math.cos(a), y1 = cy - r1 * Math.sin(a);
      const x2 = cx + r2 * Math.cos(a), y2 = cy - r2 * Math.sin(a);
      const t = llenas > 1 ? i / (llenas - 1) : 1;
      const color = i < llenas ? `color-mix(in srgb, #2f6fe4 ${Math.round(35 + 65 * t)}%, #b9cff7)` : "#e3ebfc";
      svg.appendChild(el("line", { x1, y1, x2, y2, stroke: color, "stroke-width": 15, "stroke-linecap": "round" }));
    }
    svg.setAttribute("viewBox", "0 0 260 140");
  });

  /* BARRAS FINAS: una por periodo; la última con dato, en azul fuerte; las de periodos sin dato, rayadas. */
  document.querySelectorAll("[data-barras]").forEach((caja) => {
    const datos = caja.dataset.barras.split(",").map((v) => (v.trim() === "" ? null : Number(v)));
    const max = Math.max(...datos.filter((v) => v != null), 1);
    const ultima = datos.map((v) => v != null).lastIndexOf(true);
    datos.forEach((v, i) => {
      const s = document.createElement("span");
      if (v == null) s.className = "vacia";
      else if (v === 0) s.className = "cero";
      else { s.style.height = Math.max(8, (v / max) * 100) + "%"; if (i >= ultima - 2) s.className = "fuerte"; }
      caja.appendChild(s);
    });
  });

  /* MATRIZ DE PUNTOS: un punto por tarea. */
  document.querySelectorAll("[data-puntos]").forEach((caja) => {
    const [hechas, curso, pendientes] = caja.dataset.puntos.split(",").map(Number);
    const total = hechas + curso + pendientes;
    for (let i = 0; i < total; i++) {
      const p = document.createElement("i");
      if (i < hechas) p.className = "hecho"; else if (i < hechas + curso) p.className = "curso";
      caja.appendChild(p);
    }
  });

  /* LÍNEA CON BARRAS VERTICALES DEBAJO, Y UN GLOBO QUE SIGUE AL DEDO O AL CURSOR (también con flechas). */
  document.querySelectorAll("[data-linea]").forEach((caja, n) => {
    const puntos = JSON.parse(caja.dataset.linea); // [{e: "Abr", v: 74200}, ...] v null = sin dato
    const unidad = caja.dataset.unidad || "soles";
    const sufijo = caja.dataset.sufijo ? " " + caja.dataset.sufijo : "";
    const svg = caja.querySelector("svg");
    const globo = caja.querySelector(".globo");
    const W = 600, H = 210, izq = 34, der = 6, arr = 14, aba = 26;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const valores = puntos.map((p) => p.v).filter((v) => v != null);
    const max = Math.max(...valores) * 1.1, min = 0; // la escala arranca en cero: el peine no exagera
    const x = (i) => izq + (i * (W - izq - der)) / (puntos.length - 1);
    const y = (v) => arr + (1 - (v - min) / (max - min)) * (H - arr - aba);

    const eje = el("g", { class: "eje" });
    [0.2, 0.4, 0.6, 0.8, 1].forEach((f) => {
      const yy = arr + (1 - f) * (H - arr - aba);
      eje.appendChild(el("line", { x1: izq, x2: W - der, y1: yy, y2: yy, stroke: "#eef2f9", "stroke-width": 1 }));
      const t = el("text", { x: 0, y: yy + 3.5 });
      t.textContent = unidad === "soles" ? Math.round((min + f * (max - min)) / 1000) + "k" : Math.round(min + f * (max - min));
      eje.appendChild(t);
    });
    puntos.forEach((p, i) => {
      const t = el("text", { x: x(i), y: H - 6, "text-anchor": "middle" });
      t.textContent = p.e;
      eje.appendChild(t);
    });
    svg.appendChild(eje);

    // Barras verticales finas bajo la curva: interpolan entre puntos para dar el «peine» de la referencia.
    // Donde falta un punto no se inventa la curva: una sola banda rayada cubre el tramo sin dato.
    const defs = el("defs", {});
    const pat = el("pattern", { id: `rayado-${n}`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    pat.appendChild(el("rect", { width: 1.5, height: 6, fill: "#cbd4e3" }));
    defs.appendChild(pat);
    svg.appendChild(defs);
    const peine = el("g", {});
    puntos.forEach((p, i) => {
      if (p.v != null) return;
      const desde = i > 0 ? x(i - 1) : x(i), hasta = i < puntos.length - 1 ? x(i + 1) : x(i);
      peine.appendChild(el("rect", { x: desde + 6, y: arr, width: Math.max(hasta - desde - 12, 4), height: H - arr - aba, rx: 8, fill: `url(#rayado-${n})` }));
    });
    const pasos = (puntos.length - 1) * 9;
    for (let k = 0; k <= pasos; k++) {
      const f = k / 9, i = Math.floor(f), d = f - i;
      const a = puntos[i]?.v, b = puntos[Math.min(i + 1, puntos.length - 1)]?.v;
      if (a == null || (b == null && d > 0)) continue;
      const v = b == null ? a : a + (b - a) * (0.5 - Math.cos(Math.PI * d) / 2);
      const xx = izq + (k * (W - izq - der)) / pasos;
      peine.appendChild(el("line", { x1: xx, x2: xx, y1: y(v) + 4, y2: H - aba, stroke: "#d3e0fa", "stroke-width": 1.4, "data-k": k, "vector-effect": "non-scaling-stroke" }));
    }
    svg.appendChild(peine);

    // Curva suave por tramos con dato.
    let d = "", abierto = false;
    puntos.forEach((p, i) => {
      if (p.v == null) { abierto = false; return; }
      if (!abierto) { d += `M${x(i)},${y(p.v)}`; abierto = true; return; }
      const prev = puntos[i - 1];
      const cx1 = x(i - 1) + (x(i) - x(i - 1)) / 2;
      d += ` C${cx1},${y(prev.v)} ${cx1},${y(p.v)} ${x(i)},${y(p.v)}`;
    });
    svg.appendChild(el("path", { d, fill: "none", stroke: "#2f6fe4", "stroke-width": 2.4, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" }));
    const guia = el("line", { y1: arr, y2: H - aba, stroke: "#0e1a2b", "stroke-width": 1, "stroke-dasharray": "2 3", opacity: 0, "vector-effect": "non-scaling-stroke" });
    const punto = el("circle", { r: 5.5, fill: "#fff", stroke: "#2f6fe4", "stroke-width": 2.5, opacity: 0, "vector-effect": "non-scaling-stroke" });
    svg.appendChild(guia);
    svg.appendChild(punto);

    const ultimoConDato = puntos.map((p) => p.v != null).lastIndexOf(true);
    let actual = Number(caja.dataset.inicio ?? ultimoConDato);
    // El globo nunca se sale de la tarjeta: se centra en el punto salvo cerca de los bordes.
    const ubicar = (px, py, ancho) => {
      const w = globo.offsetWidth;
      globo.style.left = Math.min(Math.max(px, w / 2), ancho - w / 2) + "px";
      globo.style.top = py + "px";
    };
    const mostrar = (i) => {
      const p = puntos[i];
      if (!p) return;
      actual = i;
      const caja2 = svg.getBoundingClientRect();
      const px = (x(i) / W) * caja2.width;
      if (p.v == null) {
        punto.setAttribute("opacity", 0);
        guia.setAttribute("x1", x(i)); guia.setAttribute("x2", x(i)); guia.setAttribute("opacity", 0.35);
        globo.innerHTML = `${p.l || p.e} · <b>sin dato</b>`;
        ubicar(px, (arr / H) * caja2.height + 40, caja2.width);
        peine.querySelectorAll("line").forEach((ln) => ln.setAttribute("stroke", "#d3e0fa"));
        return;
      }
      const py = (y(p.v) / H) * caja2.height;
      punto.setAttribute("cx", x(i)); punto.setAttribute("cy", y(p.v)); punto.setAttribute("opacity", 1);
      guia.setAttribute("x1", x(i)); guia.setAttribute("x2", x(i)); guia.setAttribute("opacity", 0.35);
      globo.innerHTML = `${p.l || p.e} · <b>${unidad === "soles" ? soles(p.v) : p.v + sufijo}</b>`;
      ubicar(px, py, caja2.width);
      peine.querySelectorAll("line").forEach((ln) => {
        const k = Number(ln.dataset.k);
        ln.setAttribute("stroke", Math.abs(k / 9 - i) <= 0.5 ? "#7ea3ef" : "#d3e0fa");
      });
    };
    const cerca = (ev) => {
      const r = svg.getBoundingClientRect();
      const xx = ((ev.clientX - r.left) / r.width) * W;
      let mejor = 0;
      puntos.forEach((_, i) => { if (Math.abs(x(i) - xx) < Math.abs(x(mejor) - xx)) mejor = i; });
      return mejor;
    };
    svg.addEventListener("pointermove", (ev) => mostrar(cerca(ev)));
    svg.addEventListener("pointerdown", (ev) => mostrar(cerca(ev)));
    svg.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowRight") { mostrar(Math.min(actual + 1, puntos.length - 1)); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { mostrar(Math.max(actual - 1, 0)); ev.preventDefault(); }
    });
    const pintar = () => mostrar(actual);
    window.addEventListener("resize", pintar);
    requestAnimationFrame(pintar);
  });
})();
