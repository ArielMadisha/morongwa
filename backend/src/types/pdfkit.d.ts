declare module "pdfkit" {
  import { EventEmitter } from "events";

  interface PDFDocumentOptions {
    margin?: number;
  }

  class PDFDocument extends EventEmitter {
    constructor(opts?: PDFDocumentOptions);
    fontSize(points: number): this;
    text(text: string, options?: { align?: string; width?: number }): this;
    moveDown(lines?: number): this;
    end(): void;
  }

  export default PDFDocument;
}
