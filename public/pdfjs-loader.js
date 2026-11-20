import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.mjs";

window.csPdfjsLib = pdfjsLib;
