/* =========================================================
   EXPORTAÇÃO PARA PDF E EXCEL
   Cada tela registra o que exportar com App.setExport(tela, () => dados):
     {
       titulo:    "Faturamento",
       subtitulo: "Filtros: Pagamento = Em aberto",        (opcional)
       resumo:    [["Total", 12], ["Vencido", 1500, "money"]], (opcional: indicadores)
       colunas:   [{ label: "Valor", type: "money" }, …],
       linhas:    [[1500.5, …], …],
     }
   App.runExport acrescenta `arquivo` (chave da tela, única: duas telas podem ter o mesmo título)
   e `grupo` (seção do menu), usados no nome do arquivo e no cabeçalho.
   Tipos: text | number | money | date ("AAAA-MM-DD") | datetime (ISO) | percent
   Os valores vão crus; a formatação de cada formato fica aqui.
   As bibliotecas (jsPDF, ExcelJS) só carregam no primeiro uso, de /vendor.
   ========================================================= */
const Exporter = {
  _scripts: {},

  loadScript(src){
    if (!this._scripts[src]){
      this._scripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => { delete this._scripts[src]; reject(new Error("Não foi possível carregar o gerador de arquivos")); };
        document.head.appendChild(s);
      });
    }
    return this._scripts[src];
  },

  nomeArquivo(d, ext){
    const base = String(d.arquivo || d.titulo).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exportacao";
    const hoje = new Date().toLocaleDateString("en-CA");
    return `${base}-${hoje}.${ext}`;
  },

  // texto exibido (PDF e resumo)
  texto(valor, type){
    if (valor === null || valor === undefined || valor === "") return "—";
    switch (type){
      case "money": return fmtMoney(valor);
      case "date": return fmtDate(valor);
      case "datetime": return fmtDateTime(valor);
      case "number": return Number(valor).toLocaleString("pt-BR");
      case "percent": return `${Number(valor).toLocaleString("pt-BR")}%`;
      default: return String(valor);
    }
  },

  rodape(){
    const quem = App.meta?.user?.nome ? ` por ${App.meta.user.nome}` : "";
    return `Gerado em ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${quem}`;
  },

  nomePainel(){ return App.meta?.config?.nomePainel || "Painel de Gestão"; },

  origem(d){ return [this.nomePainel(), d.grupo].filter(Boolean).join(" · "); },

  baixar(blob, nome){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },

  /* ---------------- PDF ---------------- */
  async pdf(d){
    await this.loadScript("/vendor/jspdf.js");
    await this.loadScript("/vendor/jspdf-autotable.js");
    const { jsPDF } = window.jspdf;
    const largo = d.colunas.length > 5;
    const doc = new jsPDF({ orientation: largo ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const margem = 36;
    const largura = doc.internal.pageSize.getWidth();
    const destaque = [76, 110, 245];
    let y = margem;

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
    doc.text(this.origem(d), margem, y);
    doc.text(this.rodape(), largura - margem, y, { align: "right" });
    y += 22;
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20);
    doc.text(d.titulo, margem, y);
    y += 8;
    if (d.subtitulo){
      doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(90);
      const linhas = doc.splitTextToSize(d.subtitulo, largura - margem * 2);
      doc.text(linhas, margem, y + 12);
      y += 12 * linhas.length + 2;
    }

    if (d.resumo?.length){
      autoTable(doc, {
        startY: y + 10,
        margin: { left: margem, right: margem },
        theme: "plain",
        styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 6, right: 6 } },
        columnStyles: { 0: { textColor: 90 }, 1: { fontStyle: "bold", halign: "right" } },
        tableWidth: Math.min(320, largura - margem * 2),
        body: d.resumo.map(([rotulo, valor, type]) => [rotulo, this.texto(valor, type)]),
      });
      y = doc.lastAutoTable.finalY;
    }

    const direita = {};
    d.colunas.forEach((c, i) => { if (["number", "money", "percent"].includes(c.type)) direita[i] = { halign: "right" }; });
    autoTable(doc, {
      startY: y + 14,
      margin: { left: margem, right: margem, bottom: 40 },
      head: [d.colunas.map(c => c.label)],
      body: d.linhas.length ? d.linhas.map(l => l.map((v, i) => this.texto(v, d.colunas[i].type))) : [[{ content: "Nenhum registro.", colSpan: d.colunas.length, styles: { halign: "center", textColor: 120 } }]],
      styles: { font: "helvetica", fontSize: largo ? 7.5 : 8.5, cellPadding: 4, overflow: "linebreak", lineColor: [225, 228, 235], lineWidth: 0.5 },
      headStyles: { fillColor: destaque, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 247, 251] },
      columnStyles: direita,
      didDrawPage: () => {
        const alturaPag = doc.internal.pageSize.getHeight();
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(130);
        doc.text(`${d.titulo} · ${d.linhas.length} registro(s)`, margem, alturaPag - 18);
        doc.text(`Página ${doc.getNumberOfPages()}`, largura - margem, alturaPag - 18, { align: "right" });
      },
    });

    this.baixar(doc.output("blob"), this.nomeArquivo(d, "pdf"));
  },

  /* ---------------- Excel ---------------- */
  // ExcelJS grava datas em UTC: "2026-08-18" vira 18/08 em qualquer fuso; data/hora vai no horário local de quem exportou
  celulaExcel(valor, type){
    if (valor === null || valor === undefined || valor === "") return null;
    switch (type){
      case "number":
      case "money":
      case "percent": { const n = Number(valor); return Number.isFinite(n) ? (type === "percent" ? n / 100 : n) : String(valor); }
      case "date": {
        const [a, m, dia] = String(valor).slice(0, 10).split("-").map(Number);
        return a && m && dia ? new Date(Date.UTC(a, m - 1, dia)) : String(valor);
      }
      case "datetime": {
        const t = new Date(valor);
        return Number.isNaN(t.getTime()) ? String(valor)
          : new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes()));
      }
      default: return String(valor);
    }
  },

  formatoExcel(type){
    return { money: '"R$" #,##0.00;[Red]-"R$" #,##0.00', date: "dd/mm/yyyy", datetime: "dd/mm/yyyy hh:mm", percent: "0%", number: "#,##0" }[type];
  },

  async excel(d){
    await this.loadScript("/vendor/exceljs.js");
    const wb = new ExcelJS.Workbook();
    wb.creator = App.meta?.user?.nome || this.nomePainel();
    wb.created = new Date();
    const nomeAba = d.titulo.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Dados";
    const ws = wb.addWorksheet(nomeAba);

    ws.addRow([d.titulo]).font = { bold: true, size: 14 };
    ws.addRow([`${this.origem(d)} · ${this.rodape()}`]).font = { size: 9, color: { argb: "FF707888" } };
    if (d.subtitulo) ws.addRow([d.subtitulo]).font = { size: 9, italic: true, color: { argb: "FF555B66" } };

    if (d.resumo?.length){
      ws.addRow([]);
      for (const [rotulo, valor, type] of d.resumo){
        const r = ws.addRow([rotulo, this.celulaExcel(valor, type)]);
        r.getCell(1).font = { color: { argb: "FF555B66" } };
        r.getCell(2).font = { bold: true };
        r.getCell(2).alignment = { horizontal: "right" };
        if (this.formatoExcel(type)) r.getCell(2).numFmt = this.formatoExcel(type);
      }
    }

    ws.addRow([]);
    const cab = ws.addRow(d.colunas.map(c => c.label));
    cab.eachCell(c => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4C6EF5" } };
      c.alignment = { vertical: "middle" };
    });
    const linhaCab = cab.number;
    // formato célula a célula: numFmt na coluna inteira também atingiria título e resumo
    const formatos = d.colunas.map(c => this.formatoExcel(c.type));
    for (const l of d.linhas){
      const r = ws.addRow(l.map((v, i) => this.celulaExcel(v, d.colunas[i].type)));
      formatos.forEach((f, i) => { if (f) r.getCell(i + 1).numFmt = f; });
    }

    d.colunas.forEach((c, i) => {
      const maior = Math.max(c.label.length, ...d.linhas.map(l => this.texto(l[i], c.type).length));
      ws.getColumn(i + 1).width = Math.min(Math.max(maior + 2, 10), 60);
    });

    if (d.linhas.length) ws.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: linhaCab, column: d.colunas.length } };
    ws.views = [{ state: "frozen", ySplit: linhaCab }];

    const buf = await wb.xlsx.writeBuffer();
    this.baixar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), this.nomeArquivo(d, "xlsx"));
  },
};
