#!/usr/bin/env node

/**
 * npm_black_list.txt からパッケージ名とバージョンを抽出して
 * CSV と JSON ファイルを生成するスクリプト
 *
 * 使用方法: node extract_packages.cjs
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = 'npm_black_list.txt';
const OUTPUT_CSV = 'compromised_packages.csv';
const OUTPUT_JSON = 'compromised_packages.json';

console.log('📝 パッケージリスト抽出開始\n');

// ファイルの存在確認
if (!fs.existsSync(INPUT_FILE)) {
	console.error(`❌ エラー: ${INPUT_FILE} が見つかりません`);
	process.exit(1);
}

// ファイル読み込み
const content = fs.readFileSync(INPUT_FILE, 'utf8');
const lines = content.split('\n');

const packages = [];
const packageSet = new Set(); // 重複排除用

// 正規表現パターン
// パターン1: @scope/package (v1.2.3) または package (v1.2.3)
// パターン2: @scope/package (v1.2.3, v1.2.4) - 複数バージョン
const pattern1 = /^(@?[\w-]+\/)?([a-z0-9-_.]+)\s+\((v[\d.]+(?:,\s*v[\d.]+)*)\)/i;
// パターン2: @scope/package または package（バージョンなし）
const pattern2 = /^(@?[\w-]+\/)?([a-z0-9-_.]+)$/i;

lines.forEach((line, index) => {
	const trimmedLine = line.trim();

	// 空行やコメント行をスキップ
	if (!trimmedLine || trimmedLine.startsWith('---') || trimmedLine.startsWith('#')) {
		return;
	}

	// パターン1: バージョン情報あり
	const match1 = trimmedLine.match(pattern1);
	if (match1) {
		const scope = match1[1] || '';
		const packageName = scope + match1[2];
		const versions = match1[3].split(',').map((v) => v.trim());

		// 重複チェック（パッケージ名のみで判定）
		if (!packageSet.has(packageName)) {
			packageSet.add(packageName);
			packages.push({
				name: packageName,
				versions: versions,
				line: index + 1,
			});
		}
		return;
	}

	// パターン2: バージョン情報なし
	const match2 = trimmedLine.match(pattern2);
	if (match2) {
		const scope = match2[1] || '';
		const packageName = scope + match2[2];
		if (!packageSet.has(packageName)) {
			packageSet.add(packageName);
			packages.push({
				name: packageName,
				versions: [],
				line: index + 1,
			});
		}
	}
});

console.log(`✅ ${packages.length} 個のユニークなパッケージを抽出しました\n`);

// CSV生成
console.log(`📄 CSV ファイルを生成中: ${OUTPUT_CSV}`);
const csvLines = ['package_name,versions'];

packages.forEach((pkg) => {
	const versionsStr = pkg.versions.join(';');
	csvLines.push(`"${pkg.name}","${versionsStr}"`);
});

fs.writeFileSync(OUTPUT_CSV, csvLines.join('\n'), 'utf8');
console.log(`✅ CSV ファイルを生成しました: ${OUTPUT_CSV}\n`);

// JSON生成（2つの形式）
console.log(`📄 JSON ファイルを生成中: ${OUTPUT_JSON}`);

const jsonOutput = {
	metadata: {
		source: 'https://socket.dev/blog/shai-hulud-strikes-again-v2',
		extractedAt: new Date().toISOString(),
		totalPackages: packages.length,
	},
	packages: packages.map((pkg) => ({
		name: pkg.name,
		versions: pkg.versions,
	})),
};

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(jsonOutput, null, 2), 'utf8');
console.log(`✅ JSON ファイルを生成しました: ${OUTPUT_JSON}\n`);

// シンプルな配列版JSON（検査スクリプト用）
const OUTPUT_JSON_SIMPLE = 'compromised_packages_simple.json';
const simpleJson = packages.map((pkg) => pkg.name);
fs.writeFileSync(OUTPUT_JSON_SIMPLE, JSON.stringify(simpleJson, null, 2), 'utf8');
console.log(`✅ シンプル版JSONを生成しました: ${OUTPUT_JSON_SIMPLE}\n`);

// 統計情報
console.log('='.repeat(60));
console.log('📊 抽出結果統計');
console.log('='.repeat(60));
console.log(`総パッケージ数: ${packages.length}`);

const scopedPackages = packages.filter((p) => p.name.startsWith('@'));
console.log(`スコープ付きパッケージ: ${scopedPackages.length}`);
console.log(`スコープなしパッケージ: ${packages.length - scopedPackages.length}`);

const withVersions = packages.filter((p) => p.versions.length > 0);
console.log(`バージョン情報あり: ${withVersions.length}`);

const multipleVersions = packages.filter((p) => p.versions.length > 1);
console.log(`複数バージョンあり: ${multipleVersions.length}`);

// トップ10のスコープを表示
const scopes = {};
scopedPackages.forEach((pkg) => {
	const scope = pkg.name.split('/')[0];
	scopes[scope] = (scopes[scope] || 0) + 1;
});

const topScopes = Object.entries(scopes)
	.sort((a, b) => b[1] - a[1])
	.slice(0, 10);

console.log('\n上位10のスコープ:');
topScopes.forEach(([scope, count]) => {
	console.log(`  ${scope}: ${count} パッケージ`);
});

console.log('\n✅ 完了！');
console.log('\n生成されたファイル:');
console.log(`  - ${OUTPUT_CSV} (CSV形式)`);
console.log(`  - ${OUTPUT_JSON} (詳細JSON)`);
console.log(`  - ${OUTPUT_JSON_SIMPLE} (シンプルJSON配列)`);
console.log('\n次のステップ: 検査スクリプトでこれらのファイルを使用できます');
