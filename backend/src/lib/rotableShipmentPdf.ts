import PDFDocument from "pdfkit";
import type { Client, RotableEquipment, RotableRepairOrder, FailureCode } from "@prisma/client";

/**
 * Ficha de envio (remessa) de um equipamento recondicionavel para reparo, garantia ou
 * simples remessa - puxa os dados ja cadastrados do equipamento (codigo, tipo, fabricante,
 * modelo, numero de serie, peso, valor, ficha tecnica) para a area que emite a nota fiscal
 * de remessa nao precisar perguntar tudo de novo por telefone/WhatsApp.
 *
 * Documento de apoio, nao fiscal: quem emite a NF confere os dados aqui e usa como
 * referencia - o sistema nao substitui o ERP fiscal da empresa.
 */

const NAVY = "#13223c";
const GRAPHITE = "#4a505c";
const LIGHT = "#e5e7ea";
const BLUE = "#0060c0";

const MARGIN = 42;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_W = PAGE_WIDTH - MARGIN * 2;

const PURPOSE_LABELS: Record<string, string> = {
  REPAIR: "Conserto / reparo",
  WARRANTY: "Garantia",
  SIMPLE_SHIPMENT: "Remessa simples",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtWeight(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

const ROTULOS_DE_ATRIBUTO: Record<string, string> = {};

export interface RotableShipmentPdfData {
  rotable: RotableEquipment;
  repairOrder: RotableRepairOrder;
  client: Client;
  failureCode: FailureCode | null;
  /** Rotulo de cada chave em specificAttributes, ja resolvido pelo chamador (o mapa
   * chave->rotulo depende do tipo, e essa logica ja existe no lib de campos por tipo). */
  atributoLabels: Record<string, string>;
}

export function buildRotableShipmentPdf(data: RotableShipmentPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica").fillColor(GRAPHITE);

    const { rotable, repairOrder, client, failureCode, atributoLabels } = data;
    const specificAttributes = (rotable.specificAttributes as Record<string, string> | null) ?? {};

    let y = MARGIN;

    // ---------------------------------------------------------------- cabecalho
    doc.font("Helvetica-Bold").fontSize(15).fillColor(NAVY);
    doc.text("FICHA DE ENVIO", MARGIN, y);
    doc.font("Helvetica").fontSize(9).fillColor(GRAPHITE);
    doc.text("Equipamento recondicionável - documento de apoio para emissão da nota fiscal de remessa", MARGIN, y + 20);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE);
    doc.text(PURPOSE_LABELS[repairOrder.purpose] ?? repairOrder.purpose, MARGIN, y + 34);
    y += 54;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(1.6).strokeColor(BLUE).stroke();
    y += 12;

    const sectionTitle = (title: string) => {
      if (y > 720) {
        doc.addPage();
        y = MARGIN;
      }
      doc.rect(MARGIN, y, CONTENT_W, 17).fillColor(NAVY).fill();
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#ffffff");
      doc.text(title.toUpperCase(), MARGIN + 8, y + 4.5);
      y += 24;
    };

    /** Grade de rotulo/valor. cols = quantas colunas por linha. */
    const fieldGrid = (fields: { label: string; value: string }[], cols = 3) => {
      const colW = CONTENT_W / cols;
      let i = 0;
      while (i < fields.length) {
        const row = fields.slice(i, i + cols);
        let rowH = 0;
        row.forEach((f, c) => {
          const x = MARGIN + c * colW;
          doc.font("Helvetica").fontSize(7).fillColor(GRAPHITE);
          doc.text(f.label.toUpperCase(), x, y, { width: colW - 10 });
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#22252b");
          const h = doc.heightOfString(f.value, { width: colW - 10 });
          doc.text(f.value, x, y + 10, { width: colW - 10 });
          rowH = Math.max(rowH, 10 + h);
        });
        y += rowH + 9;
        i += cols;
        if (y > 740) {
          doc.addPage();
          y = MARGIN;
        }
      }
    };

    const paragraph = (label: string, value: string) => {
      doc.font("Helvetica").fontSize(7).fillColor(GRAPHITE);
      doc.text(label.toUpperCase(), MARGIN, y);
      doc.font("Helvetica").fontSize(9).fillColor("#22252b");
      const h = doc.heightOfString(value, { width: CONTENT_W });
      doc.text(value, MARGIN, y + 10, { width: CONTENT_W });
      y += h + 20;
      if (y > 740) {
        doc.addPage();
        y = MARGIN;
      }
    };

    // -------------------------------------------------------------- 1. remetente
    sectionTitle("1. Remetente");
    fieldGrid(
      [
        { label: "Razão social", value: client.companyName },
        { label: "CNPJ", value: client.cnpj || "-" },
        { label: "Inscrição estadual", value: client.stateRegistration || "-" },
      ],
      3,
    );
    const endereco = [client.addressStreet, client.addressNumber].filter(Boolean).join(", ");
    const cidadeUf = [client.addressCity, client.addressState].filter(Boolean).join("/");
    fieldGrid(
      [
        { label: "Endereço", value: endereco || "-" },
        { label: "Cidade / UF", value: cidadeUf || "-" },
        { label: "CEP", value: client.addressZip || "-" },
      ],
      3,
    );

    // ----------------------------------------------------------- 2. destinatario
    sectionTitle("2. Destinatário");
    fieldGrid(
      [
        { label: "Empresa / oficina", value: repairOrder.vendor || "Não informado" },
        { label: "Motivo do envio", value: PURPOSE_LABELS[repairOrder.purpose] ?? repairOrder.purpose },
        { label: "Data de envio", value: fmtDate(repairOrder.sentAt) },
      ],
      3,
    );
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(GRAPHITE);
    doc.text("Endereço do destinatário e dados da operação fiscal (CFOP, natureza) a preencher pela área responsável.", MARGIN, y);
    y += 20;

    // ------------------------------------------------------------- 3. equipamento
    sectionTitle("3. Equipamento");
    fieldGrid(
      [
        { label: "Código", value: rotable.code },
        { label: "Tipo", value: rotable.type },
        { label: "Fabricante", value: rotable.manufacturer || "-" },
      ],
      3,
    );
    fieldGrid(
      [
        { label: "Modelo", value: rotable.model || "-" },
        { label: "Número de série", value: rotable.serialNumber || "-" },
        { label: "Peso", value: fmtWeight(rotable.weightKg) },
      ],
      3,
    );
    fieldGrid(
      [
        { label: "Valor do equipamento", value: fmtCurrency(rotable.acquisitionCost) },
        { label: "Valor orçado do reparo", value: fmtCurrency(repairOrder.budgetValue) },
        { label: "Nº do orçamento", value: repairOrder.budgetNumber || "-" },
      ],
      3,
    );

    // ------------------------------------------------------ 4. ficha tecnica
    const atributosPreenchidos = Object.entries(specificAttributes).filter(([, v]) => v?.trim());
    if (atributosPreenchidos.length > 0) {
      sectionTitle("4. Ficha técnica");
      fieldGrid(
        atributosPreenchidos.map(([chave, valor]) => ({ label: atributoLabels[chave] ?? ROTULOS_DE_ATRIBUTO[chave] ?? chave, value: valor })),
        3,
      );
    }

    // --------------------------------------------------------- 5. defeito/motivo
    sectionTitle(atributosPreenchidos.length > 0 ? "5. Defeito informado" : "4. Defeito informado");
    if (repairOrder.defectReported) paragraph("Defeito relatado", repairOrder.defectReported);
    if (failureCode) paragraph("Código de falha", `${failureCode.code} - ${failureCode.description}`);
    if (!repairOrder.defectReported && !failureCode) {
      doc.font("Helvetica").fontSize(9).fillColor(GRAPHITE);
      doc.text("Nenhum defeito informado no momento do envio.", MARGIN, y);
      y += 20;
    }

    // -------------------------------------------------------------- assinaturas
    if (y > 680) {
      doc.addPage();
      y = MARGIN;
    }
    y += 30;
    const metadeW = (CONTENT_W - 20) / 2;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + metadeW, y).lineWidth(0.7).strokeColor(LIGHT).stroke();
    doc.moveTo(MARGIN + metadeW + 20, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.7).strokeColor(LIGHT).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(GRAPHITE);
    doc.text("Responsável pelo envio", MARGIN, y + 4);
    doc.text("Conferência / expedição", MARGIN + metadeW + 20, y + 4);

    // ------------------------------------------------------------------ rodape
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7).fillColor(GRAPHITE);
      doc.text(
        `Gerado pelo RLP Maintenance CMMS em ${fmtDate(new Date())} - documento de apoio, não substitui a nota fiscal.`,
        MARGIN,
        780,
        { width: CONTENT_W, align: "center" },
      );
    }

    doc.end();
  });
}
