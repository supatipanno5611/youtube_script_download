```ts
import { Plugin } from 'obsidian';

export default class MobileToolbarOffPlugin extends Plugin {
    async onload() {
        // 명령 등록: 이제 모바일 툴바의 표시 여부만 제어합니다.
        this.addCommand({
            id: 'toggle-mobile-toolbar',
            name: '모바일 툴바 토글',
            callback: () => {
                document.body.classList.toggle('mobile-toolbar-off');
            }
        });
    }

    onunload() {
        // 플러그인 비활성화 시 스타일이 남아있지 않도록 클래스 제거
        document.body.classList.remove('mobile-toolbar-off');
    }
}
```