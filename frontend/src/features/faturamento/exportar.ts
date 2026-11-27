export type Planilha = {
  titulo: string;
  colunas: string[];
  linhas: (string | number | null)[][];
  moedas: number[];
};

export async function exportarExcel(ano: number, escopo: string, tabelas: Planilha[]) {
  const { Workbook } = await import('exceljs');
  const livro = new Workbook();
  for (const tabela of tabelas) {
    const aba = livro.addWorksheet(tabela.titulo, { views: [{ state: 'frozen', ySplit: 3 }] });
    aba.addRow([`Histórico de Faturamento Mensal — ${ano}`]).font = { bold: true };
    aba.addRow([escopo]);
    aba.addRow(tabela.colunas).font = { bold: true };
    for (const linha of tabela.linhas) aba.addRow(linha);
    for (const [indice, coluna] of tabela.colunas.entries()) {
      aba.getColumn(indice + 1).width = Math.max(20, coluna.length + 4);
    }
    for (const indice of tabela.moedas) aba.getColumn(indice + 1).numFmt = '"R$" #,##0.00';
  }
  const buffer = await livro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `historico-faturamento-${ano}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportarPDF(ano: number, escopo: string, tabelas: Planilha[]) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ orientation: 'landscape' });
  for (const [indice, tabela] of tabelas.entries()) {
    if (indice) pdf.addPage();
    pdf.setFontSize(16);
    pdf.text(`Histórico de Faturamento Mensal — ${ano}`, 14, 15);
    pdf.setFontSize(9);
    pdf.text(pdf.splitTextToSize(escopo, 268), 14, 22);
    pdf.text(tabela.titulo, 14, 33);
    autoTable(pdf, {
      startY: 37,
      head: [tabela.colunas],
      body: tabela.linhas.map(linha => linha.map((valor, coluna) => valor == null ? '—'
        : typeof valor === 'number' && tabela.moedas.includes(coluna)
          ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : String(valor))),
      styles: { fontSize: 9, overflow: 'linebreak' },
      headStyles: { fillColor: [25, 82, 66] },
    });
  }
  pdf.save(`historico-faturamento-${ano}.pdf`);
}
