import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, FileSpreadsheet, Loader2, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Definição da Rota
export const Route = createFileRoute('/_app/reports')({
  component: ReportsExecutivePage,
});

// --- DADOS E METODOLOGIA MOCKADOS ---
// Substitua esta seção pelas chamadas reais da sua API/Supabase
const mockResultados = [
  { colaborador: 'Ana Silva', departamento: 'Vendas', notaAuto: 4.5, notaGestor: 4.2, notaPares: 4.6, mediaFinal: 4.43 },
  { colaborador: 'Carlos Souza', departamento: 'TI', notaAuto: 3.8, notaGestor: 4.0, notaPares: 3.9, mediaFinal: 3.90 },
  { colaborador: 'Mariana Costa', departamento: 'Marketing', notaAuto: 4.8, notaGestor: 4.7, notaPares: 4.9, mediaFinal: 4.80 },
];

const metodologiaDeCalculo = `
Metodologia de Cálculo - Avaliação 360:
O modelo de cálculo utilizado para compor a Média Final de cada colaborador segue uma média ponderada das avaliações recebidas, visando equilíbrio e justiça nos resultados.

Pesos aplicados:
- Autoavaliação: Peso 1 (20%)
- Avaliação do Gestor: Peso 2 (40%)
- Avaliação dos Pares: Peso 2 (40%)

Fórmula aplicada:
Média Final = ((Autoavaliação * 1) + (Avaliação Gestor * 2) + (Avaliação Pares * 2)) / 5

As notas variam de 1 (Necessita Melhoria) a 5 (Excede Expectativas). Resultados acima de 4.0 são considerados indicativos de alta performance.
`;

function ReportsExecutivePage() {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);

  // --- GERAÇÃO DE PDF EXECUTIVO ---
  const handleGeneratePDF = async () => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF('p', 'pt', 'a4');
      const margin = 40;
      let startY = margin;

      // Cabeçalho / Título
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(33, 37, 41);
      doc.text('Relatório Executivo - Avaliação 360', margin, startY);
      startY += 30;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(\`Data de Emissão: \${new Date().toLocaleDateString('pt-BR')}\`, margin, startY);
      startY += 40;

      // Seção: Metodologia
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(33, 37, 41);
      doc.text('1. Metodologia e Critérios de Cálculo', margin, startY);
      startY += 20;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const splitMetodologia = doc.splitTextToSize(metodologiaDeCalculo.trim(), doc.internal.pageSize.getWidth() - margin * 2);
      doc.text(splitMetodologia, margin, startY);
      startY += (splitMetodologia.length * 12) + 40;

      // Seção: Resultados
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(33, 37, 41);
      doc.text('2. Resultados da Avaliação', margin, startY);
      startY += 15;

      // Tabela de Resultados
      const tableData = mockResultados.map((r) => [
        r.colaborador,
        r.departamento,
        r.notaAuto.toFixed(2),
        r.notaGestor.toFixed(2),
        r.notaPares.toFixed(2),
        r.mediaFinal.toFixed(2),
      ]);

      autoTable(doc, {
        startY: startY,
        head: [['Colaborador', 'Departamento', 'Autoavaliação', 'Gestor', 'Pares', 'Média Final']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 6 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      // Salvar PDF
      doc.save('Relatorio_Executivo_Avaliacao_360.pdf');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // --- GERAÇÃO DE EXCEL EXECUTIVO ---
  const handleGenerateExcel = async () => {
    setIsGeneratingExcel(true);
    try {
      const workbook = XLSX.utils.book_new();

      // Aba 1: Resultados
      const worksheetData = mockResultados.map(r => ({
        'Colaborador': r.colaborador,
        'Departamento': r.departamento,
        'Autoavaliação (Peso 1)': r.notaAuto,
        'Avaliação Gestor (Peso 2)': r.notaGestor,
        'Avaliação Pares (Peso 2)': r.notaPares,
        'Média Final (Calculada)': r.mediaFinal
      }));
      const worksheetResultados = XLSX.utils.json_to_sheet(worksheetData);
      
      // Ajuste de largura das colunas
      worksheetResultados['!cols'] = [
        { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 25 }
      ];
      XLSX.utils.book_append_sheet(workbook, worksheetResultados, 'Resultados_360');

      // Aba 2: Metodologia
      const metodologiaRows = metodologiaDeCalculo.split('\n').map(line => ({ 'Detalhes da Metodologia': line }));
      const worksheetMetodologia = XLSX.utils.json_to_sheet(metodologiaRows);
      worksheetMetodologia['!cols'] = [{ wch: 100 }];
      XLSX.utils.book_append_sheet(workbook, worksheetMetodologia, 'Metodologia_e_Calculos');

      // Salvar Excel
      XLSX.writeFile(workbook, 'Relatorio_Executivo_Avaliacao_360.xlsx');
    } catch (error) {
      console.error('Erro ao gerar Excel:', error);
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 p-8 max-w-7xl mx-auto w-full animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Relatório Executivo</h1>
          <p className="text-slate-500 mt-1">Gere relatórios completos de desempenho com metodologias integradas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card PDF */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-lg flex items-center justify-center mb-4">
              <FileText size={24} />
            </div>
            <CardTitle>Relatório em PDF</CardTitle>
            <CardDescription>
              Documento formatado ideal para leitura, envio para a Diretoria e arquivamento formal. Contém toda a metodologia e tabelas de resultados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleGeneratePDF} 
              disabled={isGeneratingPdf} 
              className="w-full bg-slate-900 hover:bg-slate-800"
            >
              {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {isGeneratingPdf ? 'Gerando Documento...' : 'Baixar PDF Executivo'}
            </Button>
          </CardContent>
        </Card>

        {/* Card Excel */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
              <FileSpreadsheet size={24} />
            </div>
            <CardTitle>Relatório em Planilha (Excel)</CardTitle>
            <CardDescription>
              Extração de dados brutos organizada em abas (Resultados e Metodologia). Ideal para aprofundamento analítico e cruzamento de dados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleGenerateExcel} 
              disabled={isGeneratingExcel} 
              variant="outline"
              className="w-full border-slate-300 hover:bg-slate-50"
            >
              {isGeneratingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />}
              {isGeneratingExcel ? 'Processando Planilha...' : 'Baixar Excel'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Preview Section */}
      <Card className="mt-4 border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <BarChart3 className="mr-2 h-5 w-5 text-slate-500" />
            Pré-visualização da Metodologia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 p-6 rounded-lg text-sm text-slate-700 whitespace-pre-wrap font-mono border border-slate-100">
            {metodologiaDeCalculo}
          </div>
        </CardContent>
      </Card>
    </div>
  );
