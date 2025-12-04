# 🛡️ npm-attack-detect-project

Shai-Hulud サプライチェーン攻撃の侵害パッケージを検出するツール

## 📖 概要

このツールは、Shai-Hulud サプライチェーン攻撃などで侵害されたnpmパッケージを、プロジェクト内から検出します。
[Socket.dev](https://socket.dev/blog/shai-hulud-strikes-again-v2) などのセキュリティレポートに基づいたブラックリストを使用して検査を行います。

**⚠️ 重要: このツールは、プロジェクトに「すでにインストールされているパッケージ」が安全かどうかを検証するためのものです。**

[claude.aiチャット](https://claude.ai/chat) に相談して生成されたスクリプトを基本に、独自で作成しました。調整には[Gooogle Antigravity](https://antigravity.google/)を活用しました。

### 主な機能

- ✅ **バージョンを考慮した正確な検出** - 安全なバージョンは誤検出しない
- ✅ **複数のパッケージマネージャー対応** - npm, pnpm, yarn, Bun
- ✅ **高速スキャン** - 約1〜2秒で完了
- ✅ **シンボリックリンク対応** - pnpmの構造を正しく処理

### 検出対象

- `package.json` - 直接依存関係の定義
- `node_modules/` - 実際にインストールされているパッケージ（実体とシンボリックリンク）

## 🚀 クイックスタート

### 1. セットアップ

```bash
git clone https://github.com/tech-takkwatanabe/npm-attack-detect-project.git
cd npm-attack-detect-project
```

### 2. プロジェクトの検査

```bash
# 相対パスで指定
node index.cjs ../my-project

# 絶対パスで指定
node index.cjs /path/to/htdocs/my-project
```

## 📁 ファイル構成

```
npm-attack-detect-project/
├── README.md                          # このファイル
├── extract_packages.cjs                # パッケージリスト抽出スクリプト
├── index.cjs                           # 検査スクリプト（メイン）
├── analyze_duplicates.js              # 重複分析スクリプト
├── extract_packages_options.js        # オプション付き抽出スクリプト
npm-attack-detect-project/
├── README.md                          # このファイル
├── extract_packages.cjs                # パッケージリスト抽出スクリプト
├── index.cjs                           # 検査スクリプト（メイン）
├── analyze_duplicates.js              # 重複分析スクリプト
├── extract_packages_options.js        # オプション付き抽出スクリプト
├── blacklists/                        # 侵害パッケージリスト置き場
│   └── npm_black_list.txt             # 元の侵害パッケージリスト
├── compromised_packages.csv           # 生成: CSV形式リスト
└── compromised_packages.json          # 生成: バージョン情報付き詳細JSON
```

## 🔧 詳細な使い方

### パッケージリストの抽出

- `blacklists` ディレクトリ内のすべての `.txt` ファイルからパッケージ名を抽出します。
- 新しいリストを追加したい場合は、このディレクトリに `.txt` ファイルを置いてください。
- `index.cjs` を実行した際に、リストファイル（`compromised_packages.json`）が存在しない場合は**自動的に実行されます**。
- リストを手動で更新したい場合のみ、以下のコマンドを実行してください。

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

🚨 2 件の問題が検出されました
   リスクレベル: CRITICAL

検出箇所:
  ├─ node_modules: 2 件
  └─ package.json: 0 件

検出されたパッケージ詳細:
  ● @asyncapi/specs
     侵害バージョン: 6.8.2, 6.8.3, 6.9.1, 6.10.1
    └─ [実体 v6.8.2] node_modules/.pnpm/@asyncapi+specs@6.8.2/node_modules/@asyncapi/specs
       (親パッケージの可能性: @stoplight/spectral-rulesets)
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

#### オプションA: 親パッケージを削除（推奨）
```bash
# 親パッケージが不要な場合は削除
pnpm remove @stoplight/spectral-rulesets
# または npm remove @stoplight/spectral-rulesets
```

#### オプションB: pnpm.overrides を使用
```json
// package.json に追加
{
  "pnpm": {
    "overrides": {
      "@asyncapi/specs": "6.7.0"  // 安全なバージョンを指定
    }
  }
}
```

#### オプションC: 親パッケージを更新
```bash
# 新しいバージョンで安全な依存関係を使用している可能性
pnpm update @stoplight/spectral-rulesets
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

セキュリティベンダーのブログやレポートから、侵害されたパッケージのリストを入手します。

- 例: [Socket.dev Blog](https://socket.dev/blog)
- 例: [Sonatype Blog](https://www.sonatype.com/blog)

```bash
# 新しいリストを blacklists ディレクトリに追加
# 例: blacklists/new_list.txt
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
  packageListFile: path.join(__dirname, 'compromised_packages.json'),
  targetDir: path.resolve(TARGET_DIR),
  outputFile: null, // レポートの出力先（自動生成）
};
```

## 🔍 技術詳細

### 検査ロジック

1. **node_modules の検査**
   - 実際にインストールされているパッケージを確認
   - `package.json` からバージョン情報を取得
   - **バージョンチェック**: 侵害されたバージョンのみを報告
   - **シンボリックリンク対応**: pnpmの構造を正しく処理
   - **最適化**: `.pnpm`ディレクトリは直接パス検索で高速化

2. **package.json の検査**
   - `dependencies`
   - `devDependencies`
   - `peerDependencies`
   - `optionalDependencies`
   - パッケージ名がブラックリストにあるかチェック

### バージョンを考慮した検出

- **安全なバージョンは検出しない**: 例えば `@asyncapi/specs@6.10.0` は安全
- **侵害バージョンのみ報告**: `6.8.2`, `6.8.3`, `6.9.1`, `6.10.1` など
- **誤検出の排除**: パッケージ名とバージョンの両方をチェック

### リスクレベルの判定

| レベル | 条件 |
|--------|------|
| **CRITICAL** | node_modules に侵害バージョンが実際にインストールされている |
| **HIGH** | package.json に侵害パッケージが定義されている |
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

---

# 🛡️ npm-attack-detect-project (English)

A tool to detect compromised packages from the Shai-Hulud supply chain attack

## 📖 Overview

This tool detects npm packages compromised in supply chain attacks (like Shai-Hulud) within your projects.
It uses blacklists based on security reports from sources like [Socket.dev](https://socket.dev/blog/shai-hulud-strikes-again-v2).

**⚠️ IMPORTANT: This tool is designed to verify whether packages "already installed" in your project are safe.**

Created based on scripts generated in consultation with [claude.ai chat](https://claude.ai/chat). Adjustments were made using [Google Antigravity](https://antigravity.google/).

### Key Features

- ✅ **Version-Aware Accurate Detection** - Safe versions are not falsely detected
- ✅ **Multiple Package Manager Support** - npm, pnpm, yarn, Bun
- ✅ **Fast Scanning** - Completes in ~1-2 seconds
- ✅ **Symlink Support** - Correctly handles pnpm structure

### Detection Targets

- `package.json` - Direct dependency definitions
- `node_modules/` - Actually installed packages (real files and symlinks)

## 🚀 Quick Start

### 1. Setup

```bash
git clone https://github.com/tech-takkwatanabe/npm-attack-detect-project.git
cd npm-attack-detect-project
```

### 2. Scan Your Project

```bash
# Specify with relative path
node index.cjs ../my-project

# Specify with absolute path
node index.cjs /path/to/htdocs/my-project
```

## 📁 File Structure

```
npm-attack-detect-project/
├── README.md                          # This file
├── extract_packages.cjs                # Package list extraction script
├── index.cjs                           # Scan script (main)
├── analyze_duplicates.js              # Duplicate analysis script
npm-attack-detect-project/
├── README.md                          # This file
├── extract_packages.cjs                # Package list extraction script
├── index.cjs                           # Scan script (main)
├── analyze_duplicates.js              # Duplicate analysis script
├── extract_packages_options.js        # Extraction script with options
├── blacklists/                        # Directory for blacklist files
│   └── npm_black_list.txt             # Original compromised package list
├── compromised_packages.csv           # Generated: CSV format list
└── compromised_packages.json          # Generated: Detailed JSON with versions
```

## 📊 Understanding Results

### ✅ When Safe

```
======================================================================
📊 Scan Results Summary
======================================================================

Scan target: /path/to/my-project
Packages checked: 787

✅ Project is safe
   No compromised packages detected
```

### 🚨 When Vulnerabilities Detected

```
======================================================================
📊 Scan Results Summary
======================================================================

Scan target: /path/to/my-project
Packages checked: 787

🚨 2 issues detected
   Risk level: CRITICAL

Detection locations:
  ├─ node_modules: 2 instances
  └─ package.json: 0 instances

Detected package details:
  ● @asyncapi/specs
     Compromised versions: 6.8.2, 6.8.3, 6.9.1, 6.10.1
    └─ [installed v6.8.2] node_modules/.pnpm/@asyncapi+specs@6.8.2/node_modules/@asyncapi/specs
       (Likely parent package: @stoplight/spectral-rulesets)
```

## 🆘 Response When Vulnerabilities Detected

### 1. Immediate Actions

```bash
# Immediately rotate all API keys, tokens, and passwords
# - GitHub Personal Access Token
# - AWS Credentials
# - API Keys
# - Database Passwords
# - Other sensitive information
```

### 2. Project Cleanup

```bash
# Navigate to affected project
cd /path/to/affected-project

# Remove node_modules
rm -rf node_modules

# Clear npm cache
npm cache clean --force
```

### 3. Fix Dependencies

#### Option A: Remove Parent Package (Recommended)
```bash
# If parent package is unnecessary, remove it
pnpm remove @stoplight/spectral-rulesets
# or npm remove @stoplight/spectral-rulesets
```

#### Option B: Use pnpm.overrides
```json
// Add to package.json
{
  "pnpm": {
    "overrides": {
      "@asyncapi/specs": "6.7.0"  // Specify safe version
    }
  }
}
```

#### Option C: Update Parent Package
```bash
# Newer version may use safe dependencies
pnpm update @stoplight/spectral-rulesets
```

### 4. Reinstall

```bash
# Reinstall from clean state
npm install
```

### 5. Check GitHub Repositories

- Check your GitHub account for repositories with description "Sha1-Hulud: The Second Coming"
- Delete any suspicious repositories immediately

## 🔍 Technical Details

### Scan Logic

1. **node_modules Scan**
   - Check actually installed packages
   - Get version information from `package.json`
   - **Version Check**: Report only compromised versions
   - **Symlink Support**: Correctly handle pnpm structure
   - **Optimization**: Direct path search for `.pnpm` directory for speed

2. **package.json Scan**
   - `dependencies`
   - `devDependencies`
   - `peerDependencies`
   - `optionalDependencies`
   - Check if package name is in blacklist

### Version-Aware Detection

- **Safe versions not detected**: e.g., `@asyncapi/specs@6.10.0` is safe
- **Only compromised versions reported**: `6.8.2`, `6.8.3`, `6.9.1`, `6.10.1`, etc.
- **False positive elimination**: Check both package name and version

### Risk Level Determination

| Level | Condition |
|-------|-----------|
| **CRITICAL** | Compromised version actually installed in node_modules |
| **HIGH** | Compromised package defined in package.json |
| **NONE** | Not detected |

## 📚 References

- [Socket.dev - Shai-Hulud Strikes Again](https://socket.dev/blog/shai-hulud-strikes-again-v2)
- [GitHub - Shai-Hulud Migration Response](https://github.com/safedep/shai-hulud-migration-response)
- [npm Security Best Practices](https://docs.npmjs.com/security-best-practices)

## ⚠️ Important Notes

- This tool only detects issues. It does not auto-fix them
- Detected packages must be handled manually
- Regularly check for the latest compromised package list
- The attack executes via preinstall scripts, so infection occurs just by installing
