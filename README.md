# 🛡️ npm-attack-detect-project

Shai-Hulud サプライチェーン攻撃の侵害パッケージを検出するツール

## 📖 概要

このツールは、[Socket.dev](https://socket.dev/blog/shai-hulud-strikes-again-v2) が報告した Shai-Hulud サプライチェーン攻撃で侵害されたnpmパッケージを、プロジェクト内から検出します。

[claude.aiチャット](https://claude.ai/chat) に相談して生成されたスクリプトを調整して作成しました。

### 検出対象

- `package.json` - 依存関係の定義
- `package-lock.json` - インストール済みパッケージの詳細
- `node_modules/` - 実際にインストールされているパッケージ

## 🚀 クイックスタート

### 1. セットアップ

```bash
cd npm-attack-detect-project

# 侵害パッケージリストを抽出
node extract_packages.cjs
```

### 2. プロジェクトの検査

```bash
# 相対パスで指定
node index.cjs ../my-project

# 絶対パスで指定
node index.cjs /path/to/htdocs/my-project

# カレントディレクトリを検査
node index.cjs .
```

## 📁 ファイル構成

```
npm-attack-detect-project/
├── README.md                          # このファイル
├── extract_packages.cjs                # パッケージリスト抽出スクリプト
├── index.cjs                           # 検査スクリプト
├── analyze_duplicates.js              # 重複分析スクリプト
├── extract_packages_options.js        # オプション付き抽出スクリプト
├── npm_black_list.txt                 # 元の侵害パッケージリスト
├── compromised_packages.csv           # 生成: CSV形式リスト
├── compromised_packages.json          # 生成: 詳細JSON
└── compromised_packages_simple.json   # 生成: シンプルJSON（検査用）
```

## 🔧 詳細な使い方

### パッケージリストの抽出

- `npm_black_list.txt`からパッケージ名を抽出します。初回や、リストを更新した際に実行してください。 （`npm_black_list.txt`は、2025-11-28 の時点で、[List of infected packages so far:](https://socket.dev/blog/shai-hulud-strikes-again-v2#Indicators-of-Compromise) としてリスト化されているのをコピーしたものです。）

```bash
# デフォルト: 重複パッケージのバージョンをマージ
node extract_packages.cjs

# 重複を削除しない（全エントリを保持）
node extract_packages_options.js --no-dedup

# 重複パッケージの最初のエントリのみ保持
node extract_packages_options.js --keep-first
```
#### 抽出モードの違い

| モード | 説明 | 推奨度 |
|--------|------|--------|
| デフォルト (`--merge-versions`) | 重複パッケージのバージョンをマージ | ⭐⭐⭐ 推奨 |
| `--no-dedup` | すべてのエントリを保持 | - |
| `--keep-first` | 最初のエントリのみ保持 | - |

### プロジェクトの検査

```bash
# 基本的な使い方
node index.cjs [ターゲットディレクトリ]

# 例
node index.cjs ../my-project
node index.cjs ../another-project
node index.cjs /var/www/html/production-site
```

## 📊 出力結果の見方

### ✅ 安全な場合

```
======================================================================
📊 検査結果サマリー
======================================================================

検査対象: /path/to/my-project
検査パッケージ数: 573

✅ プロジェクトは安全です
   侵害されたパッケージは検出されませんでした
```

### 🚨 脆弱性が検出された場合

```
======================================================================
📊 検査結果サマリー
======================================================================

検査対象: /path/to/my-project
検査パッケージ数: 573

🚨 3 件の問題が検出されました
   リスクレベル: CRITICAL

検出箇所:
  ├─ package-lock.json: 1 件
  ├─ node_modules: 2 件
  └─ package.json: 1 件

検出されたパッケージ:
  ├─ posthog-node
  └─ @asyncapi/cli
```

## 🆘 脆弱性が検出された場合の対応

### 1. 即座に実施すべきこと

```bash
# すべての API キー、トークン、パスワードを即座にローテーション
# - GitHub Personal Access Token
# - AWS Credentials
# - API Keys
# - Database Passwords
# - その他の機密情報
```

### 2. プロジェクトのクリーンアップ

```bash
# プロジェクトディレクトリに移動
cd /path/to/affected-project

# node_modules を削除
rm -rf node_modules

# npm キャッシュをクリア
npm cache clean --force
```

### 3. 依存関係の修正

```bash
# package-lock.json から侵害されたパッケージを削除
# テキストエディタで該当箇所を削除

# package.json から依存関係を削除または更新
# 必要に応じて安全なバージョンに更新
```

### 4. 再インストール

```bash
# クリーンな状態から再インストール
npm install
```

### 5. GitHub リポジトリの確認

- GitHubアカウントで "Sha1-Hulud: The Second Coming" という説明のリポジトリがないか確認
- 不審なリポジトリがあれば即座に削除

## 📝 レポートファイル

検査実行後、ターゲットディレクトリに以下のレポートが生成されます：

```
security_check_report_2025-11-28.json
```

このJSONファイルには詳細な検査結果が含まれます。

## 🔄 リストの更新

新しい侵害パッケージが報告された場合：

### 1. 新しいリストを取得

```bash
# Socket.dev から最新のリストを取得
# npm_black_list.txt を更新
```

### 2. 再抽出

```bash
node extract_packages.cjs
```

### 3. 検査実行

```bash
# 検査スクリプトは変更不要
node index.cjs ../my-project
```

## ⚙️ 設定のカスタマイズ

### 検査スクリプトの設定

`index.cjs` の `CONFIG` セクションで以下をカスタマイズできます：

```javascript
const CONFIG = {
  packageListFile: path.join(__dirname, 'compromised_packages_simple.json'),
  targetDir: path.resolve(TARGET_DIR),
  outputFile: null, // レポートの出力先
};
```

## 🔍 技術詳細

### 検査ロジック

1. **package-lock.json の検査**
   - `dependencies` セクションをチェック
   - `packages` セクションをチェック（npm v7+対応）

2. **node_modules の検査**
   - 実際にインストールされているパッケージを確認
   - `package.json` からバージョン情報を取得

3. **package.json の検査**
   - `dependencies`
   - `devDependencies`
   - `peerDependencies`
   - `optionalDependencies`

### リスクレベルの判定

| レベル | 条件 |
|--------|------|
| **CRITICAL** | node_modules に実際にインストールされている |
| **HIGH** | package.json に定義されている |
| **MEDIUM** | package-lock.json にのみ存在 |
| **NONE** | 検出なし |

## 📚 参考リンク

- [Socket.dev - Shai-Hulud Strikes Again](https://socket.dev/blog/shai-hulud-strikes-again-v2)
- [GitHub - Shai-Hulud Migration Response](https://github.com/safedep/shai-hulud-migration-response)
- [npm Security Best Practices](https://docs.npmjs.com/security-best-practices)

## ⚠️ 注意事項

- このツールは検出のみを行います。自動修復は行いません
- 検出されたパッケージは手動で対処する必要があります
- 定期的に最新の侵害パッケージリストを確認してください
- preinstall スクリプトで実行される攻撃のため、インストールしただけで感染します

## 🤝 貢献

バグ報告や改善提案は Issue でお願いします。

## 📧 お問い合わせ

質問や問題がある場合は、Issue を作成してください。

---
**最終更新**: 2025-11-28  
**対象攻撃**: Shai-Hulud "Second Coming"  
**検出パッケージ数**: 573個（重複除去後）

