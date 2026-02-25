import { Plugin, TFile, WorkspaceLeaf } from 'obsidian';

interface MyPluginSettings {
	CertainMdPath: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	CertainMdPath: 'how/termux.md'
}

export default class CertainFileOpener extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// 명령어 등록
		this.addCommand({
			id: 'open-certain-md-file',
			name: '특정 md 파일 열기',
			callback: () => this.openCertainMdFile()
		});
	}

	async openCertainMdFile() {
		const { CertainMdPath } = this.settings;

		if (!CertainMdPath) {
			console.error("CertainMdPath가 설정되지 않았습니다.");
			return;
		}

		// 1. 파일 객체 가져오기
		const file = this.app.vault.getAbstractFileByPath(CertainMdPath);
		
		if (!(file instanceof TFile)) {
			console.error("파일을 찾을 수 없습니다: " + CertainMdPath);
			return;
		}

		// 2. Root 영역의 리프들만 조사하여 이미 열려있는지 확인
		let targetLeaf: WorkspaceLeaf | null = null;
		
		this.app.workspace.iterateRootLeaves((leaf) => {
			if (leaf.view.getState().file === CertainMdPath) {
				targetLeaf = leaf;
			}
		});

		// 3. 결과에 따른 동작
		if (targetLeaf) {
			// 이미 열려 있다면 해당 탭으로 포커스
			this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
		} else {
			// 어디에도 열려있지 않다면 현재 탭에 열기
			const activeLeaf = this.app.workspace.getLeaf(false);
			if (activeLeaf) {
				await activeLeaf.openFile(file);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
