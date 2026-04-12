```ts
import {
	Plugin,
	ItemView,
	WorkspaceLeaf,
	TFile,
	TFolder,
	setIcon,
	MarkdownRenderer,
	Notice,
	Modal,
	FuzzySuggestModal,
	Setting,
	App
} from 'obsidian';

// ------------------------------------------------------------------
// 1. CONSTANTS & TYPES
// ------------------------------------------------------------------

export const VIEW_TYPE_GRID = 'grid-view';
export const FILE_FETCH_MULTIPLIER = 3;
export const DEBOUNCE_REFRESH_MS = 500;
export const MAX_PREVIEW_LENGTH = 800;
export const MAX_CARD_HEIGHT = 600;

export const CARD_SIZE = {
	XL: 800,
	LARGE: 500,
	MEDIUM: 250,
	SMALL: 100,
	XS: 0
} as const;

export type SortOption = 'mtime-new' | 'mtime-old' | 'ctime-new' | 'ctime-old' | 'random';
export type FilterLogic = 'OR' | 'AND';

export interface GridData {
	pinnedNotes: string[];
	noteOrder: string[];
	excludedFolders: string[];
	targetBase: string | null;
	sortOption: SortOption;
	maxNotes: number;
	noteColors: Record<string, string>;
	opengridview: boolean;
}

export const DEFAULT_DATA: GridData = {
	pinnedNotes: [],
	noteOrder: [],
	excludedFolders: [],
	targetBase: null,
	sortOption: 'mtime-new',
	maxNotes: 150,
	noteColors: {},
	opengridview: false
};

const SORT_LABELS: Record<SortOption, string> = {
	'mtime-new': '수정 최신순',
	'mtime-old': '수정 오래된순',
	'ctime-new': '생성 최신순',
	'ctime-old': '생성 오래된순',
	'random': '랜덤'
};

// ------------------------------------------------------------------
// 2. UTILS (Date & Markdown)
// ------------------------------------------------------------------

function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return '방금 전';
	else if (diffMins < 60) return `${diffMins}분 전`;
	else if (diffHours < 24) return `${diffHours}시간 전`;
	else if (diffDays < 7) return `${diffDays}일 전`;
	else return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function stripMarkdown(content: string): string {
	return content
		.replace(/^---[\s\S]*?---\n?/, '')
		.replace(/^#+\s+/gm, '')
		.replace(/\*\*(.+?)\*\*/g, '$1')
		.replace(/\*(.+?)\*/g, '$1')
		.replace(/__(.+?)__/g, '$1')
		.replace(/_(.+?)_/g, '$1')
		.replace(/~~(.+?)~~/g, '$1')
		.replace(/`{1,3}[^`]*`{1,3}/g, '')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
		.replace(/^>\s+/gm, '')
		.replace(/^[-*+]\s+/gm, '')
		.replace(/^\d+\.\s+/gm, '')
		.replace(/(?:^|\s)#[a-zA-Z가-힣][a-zA-Z0-9가-힣_-]*/g, '')
		.trim();
}

function getPreviewText(content: string, maxLength: number): string {
	let text = stripMarkdown(content);
	text = text.replace(/\n{2,}/g, '\n').trim();
	if (text.length > maxLength) {
		text = text.substring(0, maxLength).trim() + '...';
	}
	return text;
}

// ------------------------------------------------------------------
// 3. MAIN PLUGIN CLASS
// ------------------------------------------------------------------

export default class GridViewPlugin extends Plugin {
	data: GridData = DEFAULT_DATA;

	async onload() {
		try {
			await this.loadPluginData();

			this.registerView(
				VIEW_TYPE_GRID,
				(leaf) => new GridView(leaf, this)
			);

			this.addRibbonIcon('layout-grid', '그리드 뷰 열기', async () => {
				await this.activateView();
			});

			this.addCommand({
				id: 'open-grid-view',
				name: '그리드 뷰 열기',
				callback: async () => {
					await this.activateView();
				}
			});

			if (this.data.opengridview) {
				this.app.workspace.onLayoutReady(async () => {
					await this.activateView();
				});
			}

		} catch (error) {
			// Quiet
		}
	}

	async loadPluginData() {
		try {
			const loadedData = await this.loadData() as GridData | null;
			this.data = Object.assign({}, DEFAULT_DATA, loadedData ?? {});
		} catch (error) {
			this.data = DEFAULT_DATA;
		}
	}

	async savePluginData() {
		try {
			await this.saveData(this.data);
		} catch (error) {
			// Quiet
		}
	}

	isPinned(filePath: string): boolean {
		return this.data.pinnedNotes.includes(filePath);
	}

	async togglePin(filePath: string): Promise<boolean> {
		const index = this.data.pinnedNotes.indexOf(filePath);
		if (index > -1) {
			this.data.pinnedNotes.splice(index, 1);
			await this.savePluginData();
			return false;
		} else {
			this.data.pinnedNotes.push(filePath);
			await this.savePluginData();
			return true;
		}
	}

	async updateOrder(newOrder: string[]) {
		this.data.noteOrder = newOrder;
		await this.savePluginData();
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_GRID);

		if (leaves.length > 0) {
			leaf = leaves[0]!;
		} else {
			leaf = workspace.getLeaf('tab');
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_GRID,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	onunload() { }
}

// ------------------------------------------------------------------
// 4. VIEW CLASS
// ------------------------------------------------------------------

export class GridView extends ItemView {
	private gridContainer!: HTMLElement;
	private plugin: GridViewPlugin;
	private draggedCard: HTMLElement | null = null;
	private currentFiles: TFile[] = [];
	private refreshTimeoutId: number | null = null;

	private filterPinned: 'all' | 'pinned' | 'unpinned' = 'all';
	private selectedBases: Set<string> = new Set();
	private filterLogic: FilterLogic = 'OR';

	private allBases: string[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: GridViewPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_GRID;
	}

	getDisplayText(): string {
		return '그리드 뷰';
	}

	getIcon(): string {
		return 'layout-grid';
	}

	async onOpen() {
		const container = this.contentEl;
		container.empty();
		container.addClass('visual-dashboard-container');

		this.renderHeader(container);

		this.gridContainer = container.createDiv({ cls: 'mini-notes-grid' });
		this.gridContainer.style.setProperty('--masonry-theme-color', 'var(--interactive-accent)');

		await this.renderCards();

		this.setupEventListeners();
	}

	private renderHeader(container: HTMLElement) {
		const header = container.createDiv({ cls: 'dashboard-header' });

		// -----------------------------------------------------
		// [왼쪽] 정렬 드롭다운
		// -----------------------------------------------------
		const leftControls = header.createDiv({ cls: 'header-controls-left' });

		const sortWrapper = leftControls.createDiv({ cls: 'tag-filter-wrapper' });

		const sortBtn = sortWrapper.createDiv({ cls: 'tag-dropdown-item tag-pill' });
		sortBtn.style.cursor = 'pointer';
		sortBtn.style.padding = '6px 12px';
		sortBtn.style.fontSize = '13px';
		sortBtn.style.display = 'flex';
		sortBtn.style.gap = '6px';

		const sortIconSpan = sortBtn.createSpan();
		setIcon(sortIconSpan, 'arrow-up-down');
		sortIconSpan.style.display = 'flex';
		sortIconSpan.querySelector('svg')!.style.width = '14px';

		const sortTextSpan = sortBtn.createSpan({ text: SORT_LABELS[this.plugin.data.sortOption] });

		const sortMenu = sortWrapper.createDiv({ cls: 'sort-dropdown-menu' });

		(Object.keys(SORT_LABELS) as SortOption[]).forEach(optionKey => {
			const item = sortMenu.createDiv({ cls: 'tag-dropdown-item' });
			item.textContent = SORT_LABELS[optionKey];
			if (this.plugin.data.sortOption === optionKey) {
				item.style.fontWeight = 'bold';
				item.style.color = 'var(--interactive-accent)';
			}

			item.addEventListener('click', async (e) => {
				e.stopPropagation();
				this.plugin.data.sortOption = optionKey;
				await this.plugin.savePluginData();

				sortTextSpan.textContent = SORT_LABELS[optionKey];
				sortMenu.removeClass('show');
				void this.renderCards();
			});
		});

		sortBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isShown = sortMenu.hasClass('show');
			container.querySelectorAll('.sort-dropdown-menu.show, .logic-dropdown-menu.show, .tag-dropdown-menu.show').forEach(el => el.removeClass('show'));
			sortMenu.toggleClass('show', !isShown);
		});

		// -----------------------------------------------------
		// [오른쪽] 필터 및 설정 컨트롤
		// -----------------------------------------------------
		const rightControls = header.createDiv({ cls: 'header-controls' });

		// 1. 선택된 base 표시 영역
		const selectedBasesContainer = rightControls.createDiv({ cls: 'selected-tags-container' });
		selectedBasesContainer.style.display = 'flex';
		selectedBasesContainer.style.gap = '4px';
		selectedBasesContainer.style.flexWrap = 'wrap';

		// 2. base 검색 및 초기화
		const searchWrapper = rightControls.createDiv({ cls: 'tag-filter-wrapper' });

		const searchInput = searchWrapper.createEl('input', {
			type: 'text',
			placeholder: 'base 검색...',
			cls: 'tag-search-input'
		});
		searchInput.style.padding = '4px 8px';
		searchInput.style.borderRadius = '4px';
		searchInput.style.border = '1px solid var(--background-modifier-border)';
		searchInput.style.background = 'var(--background-primary)';
		searchInput.style.color = 'var(--text-normal)';
		searchInput.style.width = '120px';
		searchInput.style.fontSize = '12px';

		const resetBtn = searchWrapper.createDiv({ cls: 'filter-reset-btn' });
		setIcon(resetBtn, 'search-x');
		resetBtn.setAttribute('aria-label', '필터 초기화');
		resetBtn.addEventListener('click', () => {
			this.selectedBases.clear();
			searchInput.value = '';
			this.renderSelectedBases(selectedBasesContainer);
			void this.renderCards();
		});

		const searchResults = searchWrapper.createDiv({ cls: 'tag-dropdown-menu' });

		const handleSearch = () => {
			const query = searchInput.value.toLowerCase().trim();
			searchResults.empty();

			if (!query) {
				searchResults.removeClass('show');
				return;
			}

			const matches = this.allBases.filter(base =>
				base.toLowerCase().includes(query) && !this.selectedBases.has(base)
			);

			if (matches.length > 0) {
				searchResults.addClass('show');
				matches.forEach(base => {
					const item = searchResults.createDiv({ cls: 'tag-dropdown-item' });
					item.textContent = base;
					item.addEventListener('click', (e) => {
						e.stopPropagation();
						this.addSelectedBase(base, selectedBasesContainer);
						searchInput.value = '';
						searchResults.removeClass('show');
						void this.renderCards();
					});
				});
			} else {
				searchResults.removeClass('show');
			}
		};

		searchInput.addEventListener('input', handleSearch);
		searchInput.addEventListener('focus', handleSearch);

		// 3. 연산 로직 토글
		const logicWrapper = rightControls.createDiv({ cls: 'tag-filter-wrapper' });
		const logicBtn = logicWrapper.createDiv({ cls: 'filter-icon' });
		setIcon(logicBtn, 'filter');
		logicBtn.setAttribute('aria-label', '필터 연산 설정');

		const logicMenu = logicWrapper.createDiv({ cls: 'logic-dropdown-menu' });

		const orOption = logicMenu.createDiv({ cls: 'tag-dropdown-item' });
		orOption.textContent = 'OR (하나라도 포함)';
		orOption.addEventListener('click', (e) => {
			e.stopPropagation();
			this.filterLogic = 'OR';
			logicMenu.removeClass('show');
			logicBtn.removeClass('active');
			void this.renderCards();
		});

		const andOption = logicMenu.createDiv({ cls: 'tag-dropdown-item' });
		andOption.textContent = 'AND (모두 포함)';
		andOption.addEventListener('click', (e) => {
			e.stopPropagation();
			this.filterLogic = 'AND';
			logicMenu.removeClass('show');
			logicBtn.addClass('active');
			void this.renderCards();
		});

		logicBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isShown = logicMenu.hasClass('show');
			container.querySelectorAll('.sort-dropdown-menu.show, .logic-dropdown-menu.show, .tag-dropdown-menu.show').forEach(el => el.removeClass('show'));
			logicMenu.toggleClass('show', !isShown);
		});

		// 4. 핀 토글
		const pinToggle = rightControls.createDiv({ cls: 'filter-icon' });
		setIcon(pinToggle, 'pin');
		pinToggle.setAttribute('aria-label', '고정된 노트만 보기');
		pinToggle.addEventListener('click', () => {
			if (this.filterPinned === 'all') {
				this.filterPinned = 'pinned';
				pinToggle.addClass('active');
			} else {
				this.filterPinned = 'all';
				pinToggle.removeClass('active');
			}
			void this.renderCards();
		});

		// 5. 시작 시 자동 실행 토글
		const autoOpenBtn = rightControls.createDiv({ cls: 'filter-icon' });
		setIcon(autoOpenBtn, 'zap');
		autoOpenBtn.setAttribute('aria-label', '시작 시 자동 실행 토글');
		if (this.plugin.data.opengridview) autoOpenBtn.addClass('active');

		autoOpenBtn.addEventListener('click', async () => {
			this.plugin.data.opengridview = !this.plugin.data.opengridview;
			await this.plugin.savePluginData();

			if (this.plugin.data.opengridview) {
				autoOpenBtn.addClass('active');
				new Notice('시작할 때 그리드 뷰를 엽니다.');
			} else {
				autoOpenBtn.removeClass('active');
				new Notice('시작할 때 그리드 뷰를 열지 않습니다.');
			}
		});

		// 6. 최대 노트 개수 설정
		const maxNotesBtn = rightControls.createDiv({ cls: 'filter-icon' });
		setIcon(maxNotesBtn, 'settings');
		maxNotesBtn.setAttribute('aria-label', '최대 노트 개수 설정');

		maxNotesBtn.addEventListener('click', () => {
			new NumberInputModal(this.app, this.plugin.data.maxNotes, async (num) => {
				this.plugin.data.maxNotes = num;
				await this.plugin.savePluginData();
				void this.renderCards();
				new Notice(`최대 노트 개수가 ${num}개로 설정되었습니다.`);
			}).open();
		});

		// 7. 제외 폴더 추가
		const addExcludeBtn = rightControls.createDiv({ cls: 'filter-icon' });
		setIcon(addExcludeBtn, 'folder-minus');
		addExcludeBtn.setAttribute('aria-label', '제외 폴더 추가');

		addExcludeBtn.addEventListener('click', () => {
			new FolderSuggestModal(this.app, this.plugin, async () => {
				void this.renderCards();
			}).open();
		});

		// 8. 제외 폴더 초기화
		const resetExcludeBtn = rightControls.createDiv({ cls: 'filter-icon' });
		setIcon(resetExcludeBtn, 'rotate-ccw');
		resetExcludeBtn.setAttribute('aria-label', '제외 폴더 초기화');

		resetExcludeBtn.addEventListener('click', async () => {
			if (this.plugin.data.excludedFolders.length === 0) {
				new Notice('설정된 제외 폴더가 없습니다.');
				return;
			}
			this.plugin.data.excludedFolders = [];
			await this.plugin.savePluginData();
			void this.renderCards();
			new Notice('제외 폴더 설정이 초기화되었습니다.');
		});

		// 외부 클릭 시 모든 드롭다운 닫기
		this.registerDomEvent(document, 'click', (e) => {
			if (!(e.target as HTMLElement).closest('.tag-filter-wrapper')) {
				container.querySelectorAll('.sort-dropdown-menu.show, .logic-dropdown-menu.show, .tag-dropdown-menu.show').forEach(el => el.removeClass('show'));
			}
		});

		this.renderSelectedBases(selectedBasesContainer);
	}

	private addSelectedBase(base: string, container: HTMLElement) {
		this.selectedBases.add(base);
		this.renderSelectedBases(container);
	}

	private removeSelectedBase(base: string, container: HTMLElement) {
		this.selectedBases.delete(base);
		this.renderSelectedBases(container);
		void this.renderCards();
	}

	private renderSelectedBases(container: HTMLElement) {
		container.empty();
		this.selectedBases.forEach(base => {
			const pill = container.createDiv({ cls: 'tag-dropdown-item tag-pill' });
			pill.style.cursor = 'default';
			pill.style.display = 'flex';
			pill.style.alignItems = 'center';
			pill.style.gap = '4px';
			pill.textContent = base;

			const closeBtn = pill.createSpan();
			closeBtn.textContent = '×';
			closeBtn.style.cursor = 'pointer';
			closeBtn.style.fontWeight = 'bold';
			closeBtn.style.marginLeft = '4px';
			closeBtn.style.opacity = '0.6';

			closeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.removeSelectedBase(base, container);
			});

			pill.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
			pill.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.6');
		});
	}

	private setupEventListeners() {
		this.registerEvent(this.app.vault.on('modify', () => this.debouncedRefresh()));
		this.registerEvent(this.app.vault.on('create', () => this.debouncedRefresh()));
		this.registerEvent(this.app.vault.on('delete', () => this.debouncedRefresh()));
	}

	private debouncedRefresh() {
		if (this.refreshTimeoutId !== null) window.clearTimeout(this.refreshTimeoutId);
		this.refreshTimeoutId = window.setTimeout(() => {
			void this.renderCards();
			this.refreshTimeoutId = null;
		}, DEBOUNCE_REFRESH_MS);
	}

	// ------------------------------------------------------------------
	// CARD RENDERING
	// ------------------------------------------------------------------

	async renderCards() {
		if (!this.gridContainer) return;
		this.gridContainer.empty();

		let files = this.app.vault.getMarkdownFiles();

		// 1. 제외 폴더 필터링
		const excludedFolders = this.plugin.data.excludedFolders || [];
		if (excludedFolders.length > 0) {
			files = files.filter(file => !excludedFolders.some(folder => file.path.startsWith(folder)));
		}
		files = files.filter((file: TFile) => !file.path.startsWith(this.app.vault.configDir + '/'));

		// 2. base 메타데이터 수집
		const baseMap = new Map<string, Set<string>>();
		const allBasesSet = new Set<string>();

		files.forEach(file => {
			const cache = this.app.metadataCache.getFileCache(file);
			const bases = new Set<string>();

			const frontmatterBase = cache?.frontmatter?.base;
			if (Array.isArray(frontmatterBase)) {
				frontmatterBase.forEach(b => {
					if (typeof b === 'string') bases.add(b);
				});
			}

			baseMap.set(file.path, bases);
			bases.forEach(b => allBasesSet.add(b));
		});

		this.allBases = Array.from(allBasesSet).sort();

		// 3. targetBase 필터 (데이터 소스 레벨)
		if (this.plugin.data.targetBase) {
			const target = this.plugin.data.targetBase;
			files = files.filter(file => baseMap.get(file.path)?.has(target));
		}

		// 4. UI base 필터 (AND/OR)
		if (this.selectedBases.size > 0) {
			files = files.filter(file => {
				const fileBases = baseMap.get(file.path);
				if (!fileBases) return false;

				if (this.filterLogic === 'OR') {
					return [...this.selectedBases].some(base => fileBases.has(base));
				} else {
					return [...this.selectedBases].every(base => fileBases.has(base));
				}
			});
		}

		// 5. 핀 필터링
		if (this.filterPinned === 'pinned') {
			files = files.filter(f => this.plugin.isPinned(f.path));
		}

		// 6. 정렬
		const sortOption = this.plugin.data.sortOption;
		const sortFn = (a: TFile, b: TFile) => {
			switch (sortOption) {
				case 'mtime-new': return b.stat.mtime - a.stat.mtime;
				case 'mtime-old': return a.stat.mtime - b.stat.mtime;
				case 'ctime-new': return b.stat.ctime - a.stat.ctime;
				case 'ctime-old': return a.stat.ctime - b.stat.ctime;
				case 'random': return 0.5 - Math.random();
				default: return b.stat.mtime - a.stat.mtime;
			}
		};

		const pinnedFiles = files.filter(f => this.plugin.isPinned(f.path)).sort(sortFn);
		const unpinnedFiles = files.filter(f => !this.plugin.isPinned(f.path)).sort(sortFn);

		const finalFiles = [...pinnedFiles, ...unpinnedFiles].slice(0, this.plugin.data.maxNotes);
		this.currentFiles = finalFiles;

		// 7. Empty State
		if (finalFiles.length === 0) {
			const emptyState = this.gridContainer.createDiv({ cls: 'dashboard-empty-state' });
			emptyState.createEl('h3', { text: '일치하는 노트가 없습니다.' });
			emptyState.createEl('p', { text: '필터 설정을 확인해보세요.' });
			return;
		}

		// 8. 렌더링
		let globalIndex = 0;
		const needsSections = pinnedFiles.length > 0 && unpinnedFiles.length > 0;

		if (needsSections) {
			const pinnedGrid = this.gridContainer.createDiv({ cls: 'mini-notes-grid-section' });
			for (const file of pinnedFiles) {
				const card = await this.createCard(file, globalIndex++);
				if (card) pinnedGrid.appendChild(card);
			}
			this.gridContainer.createDiv({ cls: 'section-separator' });

			const notesGrid = this.gridContainer.createDiv({ cls: 'mini-notes-grid-section' });
			const remainingLimit = this.plugin.data.maxNotes - pinnedFiles.length;
			for (const file of unpinnedFiles.slice(0, remainingLimit)) {
				const card = await this.createCard(file, globalIndex++);
				if (card) notesGrid.appendChild(card);
			}
		} else {
			const singleGrid = this.gridContainer.createDiv({ cls: 'mini-notes-grid-section' });
			for (const file of finalFiles) {
				const card = await this.createCard(file, globalIndex++);
				if (card) singleGrid.appendChild(card);
			}
		}
	}

	async createCard(file: TFile, index: number): Promise<HTMLElement | null> {
		try {
			const card = document.createElement('div');
			card.addClass('dashboard-card');
			card.setAttribute('data-path', file.path);
			card.setAttribute('data-index', index.toString());
			card.setAttribute('draggable', 'true');

			const content = await this.app.vault.cachedRead(file);
			const cleanContent = stripMarkdown(content);
			const previewLength = Math.min(cleanContent.length, MAX_PREVIEW_LENGTH);
			const previewText = getPreviewText(content, previewLength);

			const contentLen = cleanContent.length;
			if (contentLen > CARD_SIZE.XL) card.addClass('card-xl');
			else if (contentLen > CARD_SIZE.LARGE) card.addClass('card-large');
			else if (contentLen > CARD_SIZE.MEDIUM) card.addClass('card-medium');
			else if (contentLen > CARD_SIZE.SMALL) card.addClass('card-small');
			else card.addClass('card-xs');

			const isPinned = this.plugin.isPinned(file.path);
			if (isPinned) card.addClass('card-pinned');

			const savedColor = this.plugin.data.noteColors[file.path];
			if (savedColor) card.style.backgroundColor = savedColor;

			card.style.maxHeight = `${MAX_CARD_HEIGHT}px`;
			card.style.overflow = 'hidden';

			// 핀 버튼
			const pinBtn = card.createDiv({ cls: 'card-pin-btn' + (isPinned ? ' pinned' : '') });
			setIcon(pinBtn, 'pin');
			pinBtn.setAttribute('aria-label', isPinned ? '고정 해제' : '고정');
			pinBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				void this.plugin.togglePin(file.path).then((nowPinned) => {
					pinBtn.classList.toggle('pinned', nowPinned);
					card.classList.toggle('card-pinned', nowPinned);
					void this.renderCards();
				});
			});

			// 색상 버튼
			const colorBtn = card.createDiv({ cls: 'card-color-btn' });
			setIcon(colorBtn, 'palette');
			colorBtn.setAttribute('aria-label', '색상 변경');

			const pastelColors = [
				'var(--pastel-pink)', 'var(--pastel-peach)', 'var(--pastel-yellow)',
				'var(--pastel-green)', 'var(--pastel-blue)', 'var(--pastel-purple)',
				'var(--pastel-magenta)', 'var(--pastel-gray)'
			];

			const colorDropdown = card.createDiv({ cls: 'card-color-dropdown' });

			pastelColors.forEach((color, idx) => {
				const colorCircle = colorDropdown.createDiv({ cls: 'color-circle' });
				colorCircle.style.backgroundColor = color;
				if (idx === pastelColors.length - 1) {
					colorCircle.addClass('color-circle-clear');
					colorCircle.setAttribute('aria-label', '색상 제거');
				}

				colorCircle.addEventListener('click', (e) => {
					e.stopPropagation();
					void (async () => {
						if (idx === pastelColors.length - 1) {
							card.style.backgroundColor = '';
							delete this.plugin.data.noteColors[file.path];
						} else {
							card.style.backgroundColor = color;
							this.plugin.data.noteColors[file.path] = color;
						}
						await this.plugin.savePluginData();
						colorDropdown.removeClass('show');
					})();
				});
			});

			colorBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				colorDropdown.toggleClass('show', !colorDropdown.hasClass('show'));
			});

			card.addEventListener('click', () => colorDropdown.removeClass('show'));

			// 카드 내용
			const cardHeader = card.createDiv({ cls: 'card-header' });
			cardHeader.createEl('h3', { text: file.basename, cls: 'card-title' });

			const cardContent = card.createDiv({ cls: 'card-content' });
			if (previewText.trim()) {
				const previewContainer = cardContent.createDiv({ cls: 'card-preview' });
				await MarkdownRenderer.render(this.app, previewText, previewContainer, file.path, this);
			} else {
				cardContent.createEl('p', { text: '내용 없음', cls: 'card-preview card-preview-empty' });
			}

			// 푸터 (base 값, 날짜)
			const cardFooter = card.createDiv({ cls: 'card-footer' });
			const basesContainer = cardFooter.createDiv({ cls: 'card-tags' });

			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatterBase = cache?.frontmatter?.base;
			const displayBases: string[] = Array.isArray(frontmatterBase)
				? frontmatterBase.filter((b): b is string => typeof b === 'string')
				: [];

			if (displayBases.length > 0) {
				displayBases.slice(0, 3).forEach(base => {
					basesContainer.createSpan({ cls: 'card-tag', text: base });
				});
				if (displayBases.length > 3) {
					basesContainer.createSpan({ cls: 'card-tag-more', text: `+${displayBases.length - 3}` });
				}
			}

			const dateSpan = cardFooter.createSpan({ cls: 'card-date' });
			dateSpan.createSpan({ text: formatDate(file.stat.mtime) });

			// 클릭 이벤트
			card.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).closest('.card-pin-btn') ||
					(e.target as HTMLElement).closest('.card-color-btn') ||
					(e.target as HTMLElement).closest('.card-color-dropdown')) return;
				const leaf = this.app.workspace.getLeaf('tab');
				void leaf.openFile(file);
			});

			// 드래그 앤 드롭
			card.addEventListener('dragstart', (e) => this.handleDragStart(e, card));
			card.addEventListener('dragend', (e) => this.handleDragEnd(e, card));
			card.addEventListener('dragover', (e) => this.handleDragOver(e, card));
			card.addEventListener('dragenter', (e) => this.handleDragEnter(e, card));
			card.addEventListener('dragleave', (e) => this.handleDragLeave(e, card));
			card.addEventListener('drop', (e) => void this.handleDrop(e, card));

			return card;
		} catch (error) {
			return null;
		}
	}

	// ------------------------------------------------------------------
	// DRAG & DROP
	// ------------------------------------------------------------------

	handleDragStart(e: DragEvent, card: HTMLElement) {
		this.draggedCard = card;
		card.classList.add('dragging');
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', card.getAttribute('data-path') || '');
		}
	}

	handleDragEnd(e: DragEvent, card: HTMLElement) {
		card.classList.remove('dragging');
		this.draggedCard = null;
		this.gridContainer.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
	}

	handleDragOver(e: DragEvent, card: HTMLElement) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}

	handleDragEnter(e: DragEvent, card: HTMLElement) {
		e.preventDefault();
		if (card !== this.draggedCard) card.classList.add('drag-over');
	}

	handleDragLeave(e: DragEvent, card: HTMLElement) {
		card.classList.remove('drag-over');
	}

	handleDrop(e: DragEvent, targetCard: HTMLElement) {
		e.preventDefault();
		targetCard.classList.remove('drag-over');
		if (!this.draggedCard || this.draggedCard === targetCard) return;

		const draggedPath = this.draggedCard.getAttribute('data-path');
		const targetPath = targetCard.getAttribute('data-path');
		if (!draggedPath || !targetPath) return;

		const currentOrder = this.currentFiles.map(f => f.path);
		const draggedIndex = currentOrder.indexOf(draggedPath);
		const targetIndex = currentOrder.indexOf(targetPath);
		if (draggedIndex === -1 || targetIndex === -1) return;

		currentOrder.splice(draggedIndex, 1);
		currentOrder.splice(targetIndex, 0, draggedPath);

		void this.plugin.updateOrder(currentOrder).then(() => this.renderCards());
	}

	async onClose() {
		this.contentEl.empty();
	}
}

// ------------------------------------------------------------------
// 5. HELPER MODALS
// ------------------------------------------------------------------

class NumberInputModal extends Modal {
	result: number;
	onSubmit: (result: number) => void;

	constructor(app: App, defaultVal: number, onSubmit: (result: number) => void) {
		super(app);
		this.result = defaultVal;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: '최대 노트 개수 설정' });

		new Setting(contentEl)
			.setName('표시할 최대 노트 수')
			.setDesc('숫자를 입력하세요.')
			.addText((text) =>
				text.setValue(String(this.result)).onChange((value) => {
					this.result = parseInt(value);
				})
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText('저장')
				.setCta()
				.onClick(() => {
					if (!isNaN(this.result) && this.result > 0) {
						this.onSubmit(this.result);
						this.close();
					} else {
						new Notice('올바른 숫자를 입력해주세요.');
					}
				})
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	plugin: GridViewPlugin;
	onAdd: () => void;

	constructor(app: App, plugin: GridViewPlugin, onAdd: () => void) {
		super(app);
		this.plugin = plugin;
		this.onAdd = onAdd;
		this.setPlaceholder('제외할 폴더를 검색하세요...');
	}

	getItems(): TFolder[] {
		const allFiles = this.app.vault.getAllLoadedFiles();
		const folders = allFiles.filter((f): f is TFolder => f instanceof TFolder);

		return folders.filter(f =>
			f.path !== '/' &&
			!this.plugin.data.excludedFolders.includes(f.path)
		);
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	async onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent) {
		this.plugin.data.excludedFolders.push(item.path);
		await this.plugin.savePluginData();
		new Notice(`"${item.path}" 폴더가 제외 목록에 추가되었습니다.`);
		this.onAdd();
	}
}
```
