import { App, ItemView, Plugin, SuggestModal, TFile, WorkspaceLeaf } from "obsidian";
import * as pdfjsLib from "pdfjs-dist";

// fake worker 모드: worker 파일 없이 메인 스레드에서 직접 실행
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

const VIEW_TYPE = "book-pdf-viewer";
const STORAGE_KEY_PREFIX = "book-pdf-viewer:page:";

// spread index → [leftPage, rightPage | null]
// spread 0: [1, null] (표지)
// spread 1: [2, 3]
// spread 2: [4, 5] ...
function spreadToPages(spread: number): [number, number | null] {
  if (spread === 0) return [1, null];
  const left = spread * 2;
  const right = spread * 2 + 1;
  return [left, right];
}

function pageToSpread(page: number): number {
  if (page <= 1) return 0;
  return Math.ceil((page - 1) / 2);
}

class BookPdfView extends ItemView {
  private filePath: string;
  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  private totalPages = 0;
  private currentSpread = 0;
  private totalSpreads = 0;
  private scale = 1.0;
  private renderContainer: HTMLElement;

  constructor(leaf: WorkspaceLeaf, filePath: string) {
    super(leaf);
    this.filePath = filePath;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.filePath.split("/").pop() ?? "PDF";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.style.cssText = "background:#1a1a1a;overflow:hidden;position:relative;height:100%;display:flex;flex-direction:column;";

    // 렌더 영역
    this.renderContainer = container.createDiv();
    this.renderContainer.style.cssText = "flex:1;display:flex;justify-content:center;align-items:center;position:relative;overflow:hidden;";

    // 터치 네비게이션: 왼쪽 절반 → 이전, 오른쪽 절반 → 다음
    this.renderContainer.addEventListener("click", (e) => {
      const half = this.renderContainer.clientWidth / 2;
      if (e.clientX < half) {
        this.prevSpread();
      } else {
        this.nextSpread();
      }
    });

    // 핀치 줌
    this.setupPinchZoom();

    await this.loadPdf();
  }

  private setupPinchZoom(): void {
    let lastDist = 0;

    this.renderContainer.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    }, { passive: true });

    this.renderContainer.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const delta = dist / lastDist;
      lastDist = dist;
      this.scale = Math.min(4, Math.max(0.5, this.scale * delta));
      this.applyScale();
    }, { passive: false });
  }

  private applyScale(): void {
    const canvases = this.renderContainer.querySelectorAll("canvas");
    canvases.forEach((c) => {
      (c as HTMLElement).style.transform = `scale(${this.scale})`;
      (c as HTMLElement).style.transformOrigin = "center center";
    });
  }

  private async loadPdf(): Promise<void> {
    const file = this.app.vault.getFileByPath(this.filePath);
    if (!file) return;

    const arrayBuffer = await this.app.vault.readBinary(file);
    this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    this.totalPages = this.pdfDoc.numPages;

    // 총 spread 수 계산
    // spread 0: page 1 / spread 1: 2-3 / spread 2: 4-5 ...
    this.totalSpreads = pageToSpread(this.totalPages);

    // 저장된 위치 복원
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + this.filePath);
    this.currentSpread = saved ? Math.min(parseInt(saved), this.totalSpreads) : 0;

    await this.renderSpread();
  }

  private async renderSpread(): Promise<void> {
    this.renderContainer.empty();
    if (!this.pdfDoc) return;

    const [leftPageNum, rightPageNum] = spreadToPages(this.currentSpread);

    // 가용 공간 계산
    const containerW = this.renderContainer.clientWidth;
    const containerH = this.renderContainer.clientHeight;
    const isDouble = rightPageNum !== null && rightPageNum <= this.totalPages;
    const slotW = isDouble ? containerW / 2 : containerW;

    const wrapper = this.renderContainer.createDiv();
    wrapper.style.cssText = `display:flex;align-items:center;justify-content:center;width:100%;height:100%;`;

    if (isDouble) {
      await this.renderPage(wrapper, leftPageNum, slotW, containerH);
      await this.renderPage(wrapper, rightPageNum, slotW, containerH);
    } else {
      // 단독 페이지: 왼쪽에 렌더, 오른쪽은 빈칸
      await this.renderPage(wrapper, leftPageNum, slotW, containerH);
      if (this.currentSpread > 0) {
        // 마지막 단독 페이지: 오른쪽 빈 슬롯
        const blank = wrapper.createDiv();
        blank.style.cssText = `width:${slotW}px;height:100%;`;
      }
    }

    // 위치 저장
    localStorage.setItem(STORAGE_KEY_PREFIX + this.filePath, String(this.currentSpread));
  }

  private async renderPage(parent: HTMLElement, pageNum: number, slotW: number, slotH: number): Promise<void> {
    if (!this.pdfDoc) return;

    const page = await this.pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });

    // 슬롯에 맞게 scale 계산
    const scaleW = (slotW - 8) / baseViewport.width;
    const scaleH = (slotH - 8) / baseViewport.height;
    const fitScale = Math.min(scaleW, scaleH);

    const viewport = page.getViewport({ scale: fitScale });

    const canvas = parent.createEl("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.cssText = `display:block;transform:scale(${this.scale});transform-origin:center center;`;

    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  async nextSpread(): Promise<void> {
    if (this.currentSpread >= this.totalSpreads) return;
    this.currentSpread++;
    await this.renderSpread();
  }

  async prevSpread(): Promise<void> {
    if (this.currentSpread <= 0) return;
    this.currentSpread--;
    await this.renderSpread();
  }

  async onClose(): Promise<void> {
    this.pdfDoc?.destroy();
  }
}

class PdfPickerModal extends SuggestModal<TFile> {
  private onSelect: (file: TFile) => void;

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder("읽을 PDF 파일을 선택하세요");
  }

  getSuggestions(query: string): TFile[] {
    const lower = query.toLowerCase();
    return this.app.vault
      .getFiles()
      .filter((f) => f.extension === "pdf" && f.path.toLowerCase().includes(lower));
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createEl("div", { text: file.basename });
    el.createEl("small", { text: file.path, cls: "suggestion-note" });
  }

  onChooseSuggestion(file: TFile): void {
    this.onSelect(file);
  }
}

export default class BookPdfViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, (leaf) => new BookPdfView(leaf, ""));

    this.addCommand({
      id: "open-book-pdf-viewer",
      name: "pdf 뷰어 열기",
      callback: () => {
        new PdfPickerModal(this.app, (file) => this.openPdf(file.path)).open();
      },
    });

    this.addCommand({
      id: "book-pdf-next",
      name: "다음 페이지 보기",
      callback: () => this.getActiveView()?.nextSpread(),
    });

    this.addCommand({
      id: "book-pdf-prev",
      name: "이전 페이지 보기",
      callback: () => this.getActiveView()?.prevSpread(),
    });
  }

  private getActiveView(): BookPdfView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    return leaf ? (leaf.view as BookPdfView) : null;
  }

  private async openPdf(filePath: string): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    // BookPdfView는 filePath를 생성자에서 받아야 해서 registerView 우회
    const view = new BookPdfView(leaf, filePath);
    leaf.open(view);
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}
