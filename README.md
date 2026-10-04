# EggDrop Web版

iOS版 (SpriteKit / Swift) の `GameScene.swift` をそのまま JavaScript + Canvas に移植したブラウザ版です。
Windows / Mac / iPhone / Android のブラウザで動きます。ビルド不要の静的ファイルだけで構成しています。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `index.html` | 画面・スタート画面 |
| `game.js` | ゲーム本体 (GameScene.swift の移植) |
| `manifest.json` | ホーム画面に追加したときの全画面表示設定 |
| `assets/img/` | キャラ・卵・敵・背景画像 (背景は 1334px 高に縮小し JPEG 化) |
| `assets/sound/` | BGM (128kbps に再エンコード) と効果音 |
| `artifact.html` | Claude アーティファクト公開用 (通常の公開では不要) |

## 操作

- マウスでドラッグ / 指でスワイプ: 移動 (iOS版と同じ相対移動)
- 矢印キー / WASD: 移動
- P / Esc: 一時停止、M: 音のオン・オフ
- ハイスコアはブラウザの localStorage に保存

## ローカルで遊ぶ

`index.html` を直接開くと音声の読み込みがブラウザに止められるため、簡易サーバーを使います。

```
cd C:\src\EggDrop\web
python -m http.server 8000
```

ブラウザで http://localhost:8000 を開きます。

## 無料で公開する

### GitHub Pages (おすすめ)

1. GitHub で新しい **Public** リポジトリ (例: `eggdrop`) を作成
2. 「uploading an existing file」から `web` フォルダの**中身**をすべてドラッグ&ドロップして Commit
3. Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にして Save
4. 1〜2分後に `https://<ユーザー名>.github.io/eggdrop/` で公開されます

制限: サイト 1GB・帯域 100GB/月 (目安)。このゲームは約 5.4MB なので十分収まります。商用利用は不可。

### Cloudflare Pages

Cloudflare アカウント作成 → Workers & Pages → Create → Pages → 「Upload assets」で `web` フォルダをドラッグ&ドロップ。
`https://<プロジェクト名>.pages.dev` で公開されます。1ファイル 25MiB まで、帯域無制限。

### itch.io (ゲーム投稿サイト)

`EggDrop-web.zip` を「Kind of project: HTML」でアップロードし、「This file will be played in the browser」にチェック。
Viewport を 450×800 程度、「Mobile friendly」と「Fullscreen button」をオンにします。

## 公開前の確認

画像 (Freepik 素材と思われる背景・アイコン) と BGM/効果音 (VSQ 素材) は、各配布元の規約で
**Web 上での再配布・クレジット表記の要否** を確認してください。スタート画面下部のクレジット表記は `index.html` の `.credit` で編集できます。

## iOS版からの変更点

- 縦画面では画面の縦横比に合わせて高さを伸縮し全面表示 (横長画面は 750×1334 で左右に黒帯)
- キーボード操作 (矢印キー・WASD、P で一時停止、M で音のオン・オフ) を追加
- タブを切り替えると自動で一時停止
- プレーヤーが画面外に出ないよう移動範囲を制限
- ゲームオーバー後のスタート画面に今回のスコアを表示
