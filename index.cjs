#!/usr/bin/env node

/**
 * Shai-Hulud 侵害パッケージ検査スクリプト（汎用版）
 * 外部ファイルからパッケージリストを読み込み、指定したディレクトリを検査
 *
 * 特徴:
 * - node_modules (実体およびシンボリックリンク) を検査
 * - package.json (直接依存) を検査
 * - ロックファイル非依存 (npm, pnpm, yarn, bun 等に対応)
 *
 * 使用方法:
 *   node index.cjs [ターゲットディレクトリ]
 *   node index.cjs ../my-project
 *   node index.cjs /path/to/htdocs/my-project
 */

const fs = require('fs');
const path = require('path');

// コマンドライン引数からターゲットディレクトリを取得
const args = process.argv.slice(2);
const TARGET_DIR = args[0] || '.';

// 設定
const CONFIG = {
	packageListFile: path.join(__dirname, 'compromised_packages.json'),
	targetDir: path.resolve(TARGET_DIR),
	outputFile: null, // 後で設定
	colors: {
		reset: '\x1b[0m',
		red: '\x1b[31m',
		green: '\x1b[32m',
		yellow: '\x1b[33m',
		blue: '\x1b[34m',
		magenta: '\x1b[35m',
		cyan: '\x1b[36m',
		bold: '\x1b[1m',
	},
};

// 出力ファイルをターゲットディレクトリまたはカレントディレクトリに設定
CONFIG.outputFile = path.join('reports', `security_check_report_${new Date().toISOString().slice(0, 19)}.json`);

// カラー出力ヘルパー
const c = CONFIG.colors;
const log = {
	error: (msg) => console.log(`${c.red}${msg}${c.reset}`),
	warning: (msg) => console.log(`${c.yellow}${msg}${c.reset}`),
	success: (msg) => console.log(`${c.green}${msg}${c.reset}`),
	info: (msg) => console.log(`${c.blue}${msg}${c.reset}`),
	title: (msg) => console.log(`${c.cyan}${c.bold}${msg}${c.reset}`),
};

console.log('\n' + '='.repeat(70));
log.title('🔍 Shai-Hulud 侵害パッケージ検査（汎用版）');
console.log('='.repeat(70) + '\n');

// ターゲットディレクトリの確認
log.info(`📁 ターゲットディレクトリ: ${c.cyan}${CONFIG.targetDir}${c.reset}`);

if (!fs.existsSync(CONFIG.targetDir)) {
	log.error(`\n❌ エラー: ターゲットディレクトリが見つかりません`);
	log.error(`   ${CONFIG.targetDir}\n`);
	console.log('使用方法:');
	console.log('  node index.cjs [ターゲットディレクトリ]');
	console.log('  node index.cjs ../my-project');
	console.log('  node index.cjs /path/to/htdocs/my-project\n');
	process.exit(1);
}

if (!fs.statSync(CONFIG.targetDir).isDirectory()) {
	log.error(`\n❌ エラー: 指定されたパスはディレクトリではありません\n`);
	process.exit(1);
}

console.log('');

// パッケージリストの読み込み（バージョン情報付き）
let COMPROMISED_PACKAGES_DATA = null;
let COMPROMISED_PACKAGES_MAP = new Map(); // パッケージ名 -> バージョンリストのマップ

try {
	if (!fs.existsSync(CONFIG.packageListFile)) {
		// compromised_packages.json が存在しない場合、自動的に生成
		log.warning(`📦 ${path.basename(CONFIG.packageListFile)} が見つかりません`);
		log.info(`📝 パッケージリストを自動生成します...\n`);

		const { execSync } = require('child_process');
		try {
			execSync('node extract_packages.cjs', {
				stdio: 'inherit',
				cwd: __dirname,
			});
			console.log('');
			log.success(`✅ パッケージリストの生成が完了しました\n`);
		} catch (extractError) {
			log.error(`❌ パッケージリストの生成に失敗しました`);
			log.error(`   エラー: ${extractError.message}`);
			log.warning(`\n手動で実行してください:`);
			console.log(`   node extract_packages.cjs\n`);
			process.exit(1);
		}
	}

	// パッケージリストを読み込み
	log.info(`📂 パッケージリストを読み込み中: ${path.basename(CONFIG.packageListFile)}`);
	const data = fs.readFileSync(CONFIG.packageListFile, 'utf8');
	COMPROMISED_PACKAGES_DATA = JSON.parse(data);

	// パッケージ名とバージョンのマップを作成
	COMPROMISED_PACKAGES_DATA.packages.forEach((pkg) => {
		// バージョンから 'v' プレフィックスを削除して正規化
		const normalizedVersions = pkg.versions.map((v) => v.replace(/^v/, ''));
		COMPROMISED_PACKAGES_MAP.set(pkg.name, normalizedVersions);
	});

	log.success(`✅ ${COMPROMISED_PACKAGES_MAP.size} 個のパッケージ（バージョン情報付き）を読み込みました\n`);
} catch (error) {
	log.error(`❌ パッケージリストの読み込みに失敗: ${error.message}`);
	process.exit(1);
}

/**
 * パッケージとバージョンが侵害されているかチェック
 * @param {string} packageName - パッケージ名
 * @param {string} version - バージョン
 * @returns {boolean} 侵害されている場合 true
 */
function isCompromised(packageName, version) {
	if (!COMPROMISED_PACKAGES_MAP.has(packageName)) {
		return false;
	}

	const compromisedVersions = COMPROMISED_PACKAGES_MAP.get(packageName);
	const normalizedVersion = version.replace(/^v/, '');

	return compromisedVersions.includes(normalizedVersion);
}

// 検査対象ファイルのパス
const paths = {
	nodeModules: path.join(CONFIG.targetDir, 'node_modules'),
	packageJson: path.join(CONFIG.targetDir, 'package.json'),
};

// 結果を格納するオブジェクト
const results = {
	timestamp: new Date().toISOString(),
	targetDirectory: CONFIG.targetDir,
	totalChecked: COMPROMISED_PACKAGES_MAP.size,
	foundInNodeModules: [],
	foundInPackageJson: [],
	summary: {
		safe: true,
		totalIssues: 0,
		criticalLevel: 'none', // none, high, critical
	},
};

console.log('');

// node_modules の検査

/**
 * .pnpm ディレクトリ内のパッケージを最適化された方法で検索
 * @param {string} pnpmPath - .pnpm ディレクトリのパス
 * @param {string} targetPackage - 検索対象のパッケージ名
 * @param {number} depth - 現在の検索深度
 * @returns {Array} 見つかったパッケージの情報配列
 */
function findInPnpmDirectory(pnpmPath, targetPackage, depth) {
	const results = [];

	try {
		// .pnpm ディレクトリ内のエントリを取得
		const entries = fs.readdirSync(pnpmPath, { withFileTypes: true });

		// パッケージ名のパターンを作成
		// 例: @scope/package → @scope+package@
		// 例: package → package@
		const searchPattern = targetPackage.replace('/', '+') + '@';

		// マッチするディレクトリを探す
		for (const entry of entries) {
			if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

			// パッケージ名@バージョン の形式にマッチするかチェック
			if (entry.name.startsWith(searchPattern)) {
				// .pnpm/package@version/node_modules/package のパスを構築
				const packageInNodeModules = path.join(pnpmPath, entry.name, 'node_modules', targetPackage);

				if (fs.existsSync(packageInNodeModules)) {
					const pkgJsonPath = path.join(packageInNodeModules, 'package.json');
					let version = 'unknown';

					try {
						if (fs.existsSync(pkgJsonPath)) {
							const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
							version = pkgJson.version || 'unknown';
						}
					} catch (error) {
						// package.json の読み込みエラーは無視
					}

					results.push({
						path: packageInNodeModules,
						version: version,
						depth: depth,
						type: 'installed',
					});
				}
			}
		}
	} catch (error) {
		// エラーは無視
	}

	return results;
}

/**
 * node_modules 内を再帰的に検索してパッケージを探す
 * @param {string} nodeModulesPath - 検索する node_modules のパス
 * @param {string} targetPackage - 検索対象のパッケージ名
 * @param {number} depth - 現在の検索深度（デフォルト: 0）
 * @param {number} maxDepth - 最大検索深度（デフォルト: 5）
 * @param {Set} visitedPaths - 循環参照防止用のパスセット
 * @returns {Array} 見つかったパッケージの情報配列
 */
function findPackageRecursively(nodeModulesPath, targetPackage, depth = 0, maxDepth = 5, visitedPaths = new Set()) {
	const results = [];

	// 深度制限チェック
	if (depth > maxDepth || !fs.existsSync(nodeModulesPath)) {
		return results;
	}

	// 循環参照チェック
	try {
		const realPath = fs.realpathSync(nodeModulesPath);
		if (visitedPaths.has(realPath)) {
			return results;
		}
		visitedPaths.add(realPath);
	} catch (e) {
		// realpath 取得失敗時は続行（ただしリスクあり）
	}

	try {
		const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });

		for (const entry of entries) {
			// ディレクトリまたはシンボリックリンクを対象にする
			if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

			const entryPath = path.join(nodeModulesPath, entry.name);

			// .pnpm ディレクトリの場合は最適化された検索を使用
			if (entry.name === '.pnpm') {
				const pnpmResults = findInPnpmDirectory(entryPath, targetPackage, depth + 1);
				results.push(...pnpmResults);
				continue; // .pnpm の中は再帰しない（最適化済み）
			}

			// スコープディレクトリ (@scope) の場合
			if (entry.name.startsWith('@')) {
				try {
					const scopedEntries = fs.readdirSync(entryPath, {
						withFileTypes: true,
					});

					for (const scopedEntry of scopedEntries) {
						if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) continue;

						const fullPackageName = `${entry.name}/${scopedEntry.name}`;
						const packagePath = path.join(entryPath, scopedEntry.name);

						// ターゲットパッケージと一致するか確認
						if (fullPackageName === targetPackage) {
							const pkgJsonPath = path.join(packagePath, 'package.json');
							let version = 'unknown';

							try {
								if (fs.existsSync(pkgJsonPath)) {
									const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
									version = pkgJson.version || 'unknown';
								}
							} catch (error) {
								// package.json の読み込みエラーは無視
							}

							results.push({
								path: packagePath,
								version: version,
								depth: depth,
								type: 'installed',
							});
						}

						// このパッケージの node_modules も再帰的に検索
						const nestedNodeModules = path.join(packagePath, 'node_modules');
						if (fs.existsSync(nestedNodeModules)) {
							const nested = findPackageRecursively(nestedNodeModules, targetPackage, depth + 1, maxDepth, visitedPaths);
							results.push(...nested);
						}
					}
				} catch (error) {
					// スコープディレクトリの読み込みエラーは無視
				}
			} else {
				// 通常のパッケージ
				if (entry.name === targetPackage) {
					const packagePath = entryPath;
					const pkgJsonPath = path.join(packagePath, 'package.json');
					let version = 'unknown';

					try {
						if (fs.existsSync(pkgJsonPath)) {
							const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
							version = pkgJson.version || 'unknown';
						}
					} catch (error) {
						// package.json の読み込みエラーは無視
					}

					results.push({
						path: packagePath,
						version: version,
						depth: depth,
						type: 'installed',
					});
				}

				// このパッケージの node_modules も再帰的に検索
				const nestedNodeModules = path.join(entryPath, 'node_modules');
				if (fs.existsSync(nestedNodeModules)) {
					const nested = findPackageRecursively(nestedNodeModules, targetPackage, depth + 1, maxDepth, visitedPaths);
					results.push(...nested);
				}
			}
		}
	} catch (error) {
		// ディレクトリ読み込みエラーは無視
	}

	return results;
}

/**
 * node_modules 内のすべての package.json を再帰的に検索して、
 * 依存関係に侵害パッケージが含まれているかチェック
 * @param {string} nodeModulesPath - 検索する node_modules のパス
 * @param {Array} compromisedPackages - 侵害パッケージのリスト
 * @param {number} depth - 現在の検索深度
 * @param {number} maxDepth - 最大検索深度
 * @param {Set} visitedPaths - 循環参照防止用のパスセット
 * @returns {Array} 見つかった依存関係の情報配列
 */
function scanPackageJsonDependencies(nodeModulesPath, compromisedPackages, depth = 0, maxDepth = 5, visitedPaths = new Set()) {
	const results = [];

	if (depth > maxDepth || !fs.existsSync(nodeModulesPath)) {
		return results;
	}

	// 循環参照チェック
	try {
		const realPath = fs.realpathSync(nodeModulesPath);
		if (visitedPaths.has(realPath)) {
			return results;
		}
		visitedPaths.add(realPath);
	} catch (e) {
		// realpath 取得失敗時は続行
	}

	try {
		const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });

		for (const entry of entries) {
			// ディレクトリまたはシンボリックリンクを対象にする
			if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

			const entryPath = path.join(nodeModulesPath, entry.name);

			// .pnpm ディレクトリの場合
			if (entry.name === '.pnpm') {
				try {
					const pnpmEntries = fs.readdirSync(entryPath, {
						withFileTypes: true,
					});

					for (const pnpmEntry of pnpmEntries) {
						if (!pnpmEntry.isDirectory() && !pnpmEntry.isSymbolicLink()) continue;

						// .pnpm/package@version/node_modules の構造
						const packageVersionPath = path.join(entryPath, pnpmEntry.name);
						const pnpmNodeModules = path.join(packageVersionPath, 'node_modules');

						if (fs.existsSync(pnpmNodeModules)) {
							const nested = scanPackageJsonDependencies(pnpmNodeModules, compromisedPackages, depth + 1, maxDepth, visitedPaths);
							results.push(...nested);
						}
					}
				} catch (error) {
					// エラーは無視
				}
			}
			// スコープディレクトリの場合
			else if (entry.name.startsWith('@')) {
				try {
					const scopedEntries = fs.readdirSync(entryPath, {
						withFileTypes: true,
					});

					for (const scopedEntry of scopedEntries) {
						if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) continue;

						const packagePath = path.join(entryPath, scopedEntry.name);
						const pkgJsonPath = path.join(packagePath, 'package.json');

						// package.json を検査
						if (fs.existsSync(pkgJsonPath)) {
							try {
								const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
								const packageName = `${entry.name}/${scopedEntry.name}`;

								// 全ての依存関係をチェック
								const allDeps = {
									...pkgJson.dependencies,
									...pkgJson.devDependencies,
									...pkgJson.peerDependencies,
									...pkgJson.optionalDependencies,
								};

								for (const depName of Object.keys(allDeps)) {
									if (compromisedPackages.includes(depName)) {
										results.push({
											foundIn: packagePath,
											foundInPackageName: packageName,
											compromisedPackage: depName,
											version: allDeps[depName],
											depth: depth,
											type: 'dependency',
										});
									}
								}
							} catch (error) {
								// JSON パースエラーは無視
							}
						}

						// 再帰的に検索
						const nestedNodeModules = path.join(packagePath, 'node_modules');
						if (fs.existsSync(nestedNodeModules)) {
							const nested = scanPackageJsonDependencies(nestedNodeModules, compromisedPackages, depth + 1, maxDepth, visitedPaths);
							results.push(...nested);
						}
					}
				} catch (error) {
					// エラーは無視
				}
			} else {
				// 通常のパッケージ
				const packagePath = entryPath;
				const pkgJsonPath = path.join(packagePath, 'package.json');

				if (fs.existsSync(pkgJsonPath)) {
					try {
						const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
						const packageName = entry.name;

						// 全ての依存関係をチェック
						const allDeps = {
							...pkgJson.dependencies,
							...pkgJson.devDependencies,
							...pkgJson.peerDependencies,
							...pkgJson.optionalDependencies,
						};

						for (const depName of Object.keys(allDeps)) {
							if (compromisedPackages.includes(depName)) {
								results.push({
									foundIn: packagePath,
									foundInPackageName: packageName,
									compromisedPackage: depName,
									version: allDeps[depName],
									depth: depth,
									type: 'dependency',
								});
							}
						}
					} catch (error) {
						// JSON パースエラーは無視
					}
				}

				// 再帰的に検索
				const nestedNodeModules = path.join(entryPath, 'node_modules');
				if (fs.existsSync(nestedNodeModules)) {
					const nested = scanPackageJsonDependencies(nestedNodeModules, compromisedPackages, depth + 1, maxDepth, visitedPaths);
					results.push(...nested);
				}
			}
		}
	} catch (error) {
		// エラーは無視
	}

	return results;
}

// 疑わしいファイルのチェック（最優先）
console.log('');
console.log('='.repeat(70));
log.title('🔍 疑わしいファイルのチェック');
console.log('='.repeat(70) + '\n');

const suspiciousFiles = [
	{ name: 'setup_bun.js', description: 'ドロッパー（マルウェア配布スクリプト）' },
	{ name: 'bun_environment.js', description: 'メインペイロード（難読化ファイル）' },
	{ name: 'cloud.json', description: 'クラウド認証情報' },
	{ name: 'environment.json', description: '環境変数' },
	{ name: 'actionsSecrets.json', description: 'GitHub Actions シークレット' },
	{ name: 'setup.mjs', description: '永続化用スクリプト（.claude/ または .vscode/）' },
	{ name: 'gh-token-monitor.sh', description: 'GitHub トークン監視スクリプト' },
	{ name: 'router_runtime.js', description: '悪性ランタイム（.claude/）' },
];

let foundSuspiciousFiles = [];

try {
	const findFiles = (dir, fileName) => {
		const results = [];
		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

				// node_modules は除外
				if (entry.name === 'node_modules') continue;

				if (entry.isDirectory()) {
					results.push(...findFiles(fullPath, fileName));
				} else if (entry.name === fileName) {
					results.push(fullPath);
				}
			}
		} catch (error) {
			// アクセス権限エラーなどは無視
		}
		return results;
	};

	suspiciousFiles.forEach(({ name, description }) => {
		const found = findFiles(CONFIG.targetDir, name);
		if (found.length > 0) {
			foundSuspiciousFiles.push({ name, description, paths: found });
		}
	});

	if (foundSuspiciousFiles.length > 0) {
		log.error(`🚨 ${foundSuspiciousFiles.length} 種類の疑わしいファイルが検出されました！\n`);

		foundSuspiciousFiles.forEach(({ name, description, paths }) => {
			log.error(`  ⚠️  ${name} (${description})`);
			paths.forEach((p) => {
				const relativePath = path.relative(CONFIG.targetDir, p);
				console.log(`     場所: ${c.yellow}${relativePath}${c.reset}`);
			});
			console.log('');
		});

		console.log(`${c.red}${c.bold}⚠️  これらのファイルはマルウェアの可能性があります！${c.reset}\n`);
		console.log(`${c.red}${c.bold}   システムが感染している可能性が高いため、以下の「対応手順」を即座に実行してください。${c.reset}\n`);
		console.log(`${c.yellow}${c.bold}🚨 注意: クレデンシャルを失効させる前に、必ず永続化機構（gh-token-monitor等）を停止させてください。${c.reset}`);
		console.log(`${c.yellow}   永続化が稼働したままトークンを無効化すると、ホームディレクトリが削除される恐れがあります。${c.reset}\n`);
		console.log('推奨される対応:\n');
		console.log(`${c.red}1.${c.reset} 画面下の「対応手順 1. 永続化機構の停止と除去」を最優先で実行してください`);
		console.log(`${c.red}2.${c.reset} 全ての認証情報（AWS, GitHub, API キー等）をローテーションしてください`);
		console.log(`${c.red}3.${c.reset} システムの完全なセキュリティ監査を実施してください`);
		console.log(`${c.red}4.${c.reset} 詳細: ${c.cyan}https://blog.flatt.tech/entry/mini_shai_hulud_2nd${c.reset}\n`);

		// 結果に追加
		results.suspiciousFiles = foundSuspiciousFiles;
	} else {
		log.success('✅ 疑わしいファイルは検出されませんでした');
	}
} catch (error) {
	log.warning(`⚠️  疑わしいファイルのチェック中にエラーが発生: ${error.message}`);
}

console.log('');
log.title('📂 node_modules を検査中（実体およびシンボリックリンク）...');

if (fs.existsSync(paths.nodeModules)) {
	let checkedCount = 0;
	let totalFoundCount = 0;

	console.log('');
	log.info('  🔍 インストール済みパッケージの検査...');
	console.log('');

	// 実際にインストールされているパッケージを検索
	Array.from(COMPROMISED_PACKAGES_MAP.keys()).forEach((pkg) => {
		const foundInstances = findPackageRecursively(paths.nodeModules, pkg);

		if (foundInstances.length > 0) {
			foundInstances.forEach((instance, index) => {
				// バージョンチェック: 侵害されたバージョンのみを報告
				if (!isCompromised(pkg, instance.version)) {
					return; // 安全なバージョンはスキップ
				}

				const relativePath = path.relative(CONFIG.targetDir, instance.path);
				const depthInfo = instance.depth > 0 ? ` (深度: ${instance.depth})` : '';

				// 侵害されたバージョンのリストを取得
				const compromisedVersions = COMPROMISED_PACKAGES_MAP.get(pkg);

				results.foundInNodeModules.push({
					package: pkg,
					version: instance.version,
					path: instance.path,
					depth: instance.depth,
					type: 'installed',
					compromisedVersions: compromisedVersions, // 侵害されたバージョンリストを追加
				});

				if (index === 0) {
					log.error(`  🚨 ${pkg}@${instance.version}${depthInfo}`);
					log.error(`     侵害バージョン: ${compromisedVersions.join(', ')}`);
				} else {
					log.warning(`     ├─ 重複インストール: ${instance.version}${depthInfo}`);
				}
				// 検出された場所（パス）を明確に表示
				console.log(`     ${c.magenta}場所: ${relativePath}${c.reset}`);

				totalFoundCount++;
			});
		}
		checkedCount++;
	});

	if (totalFoundCount === 0) {
		log.success('  ✅ インストール済みパッケージに検出なし');
	} else {
		log.warning(`  ⚠️  ${totalFoundCount} 個のインスタンスが検出されました`);
	}

	console.log('');
	log.info(`  📊 ${checkedCount} パッケージを検査しました`);
	if (totalFoundCount > 0) {
		log.warning(`  📊 合計 ${totalFoundCount} 件の問題を検出`);
	}

	// node_modules 内のパッケージの依存関係もチェック
	console.log('');
	log.info('  🔍 インストール済みパッケージの依存関係を検査...');
	console.log('');

	const depResults = scanPackageJsonDependencies(paths.nodeModules, Array.from(COMPROMISED_PACKAGES_MAP.keys()));

	if (depResults.length > 0) {
		let validDepCount = 0;

		depResults.forEach((dep) => {
			const compromisedVersions = COMPROMISED_PACKAGES_MAP.get(dep.compromisedPackage);

			// 実際にそのパッケージがインストールされているか確認
			const installedInstances = findPackageRecursively(paths.nodeModules, dep.compromisedPackage);

			// インストールされている場合、そのバージョンが侵害されているかチェック
			let hasCompromisedVersion = false;
			const installedCompromisedVersions = [];

			installedInstances.forEach((instance) => {
				if (isCompromised(dep.compromisedPackage, instance.version)) {
					hasCompromisedVersion = true;
					installedCompromisedVersions.push(instance.version);
				}
			});

			// 侵害されたバージョンが実際にインストールされている場合のみ報告
			if (hasCompromisedVersion) {
				const relativePath = path.relative(CONFIG.targetDir, dep.foundIn);

				results.foundInNodeModules.push({
					package: dep.compromisedPackage,
					version: installedCompromisedVersions.join(', '),
					path: dep.foundIn,
					depth: dep.depth,
					type: 'dependency-reference',
					referencedBy: dep.foundInPackageName,
					compromisedVersions: compromisedVersions,
				});

				log.warning(`  ⚠️  ${dep.compromisedPackage}@${installedCompromisedVersions.join(', ')}`);
				log.warning(`     依存元: ${dep.foundInPackageName} (要求: ${dep.version})`);
				log.warning(`     場所: ${relativePath}`);
				log.warning(`     侵害バージョン: ${compromisedVersions.join(', ')}`);
				totalFoundCount++;
				validDepCount++;
			} else if (installedInstances.length === 0) {
				// インストールされていない場合、バージョン範囲が侵害バージョンを含む可能性をチェック
				// 簡易チェック: ^, ~, >=, >, v などの範囲指定の場合、警告を出す
				const versionRange = dep.version;
				let couldBeCompromised = false;

				// 範囲指定記号とvプレフィックスを除去して基準バージョンを取得
				const baseVersion = versionRange.replace(/^[v\^~>=<]+/, '').trim();

				// 侵害バージョンと比較
				compromisedVersions.forEach((compromisedVer) => {
					// ^3.24.1 の場合、3.24.1 を含む可能性がある
					if (versionRange.startsWith('^') || versionRange.startsWith('~') || versionRange.includes('>=') || versionRange.includes('>')) {
						// 基準バージョンが侵害バージョンと一致、または侵害バージョンが範囲に含まれる可能性
						if (baseVersion === compromisedVer || versionRange.includes(compromisedVer)) {
							couldBeCompromised = true;
						}
					} else if (baseVersion === compromisedVer) {
						// 完全一致 (v3.24.1 や 3.24.1 など)
						couldBeCompromised = true;
					}
				});

				if (couldBeCompromised) {
					const relativePath = path.relative(CONFIG.targetDir, dep.foundIn);

					results.foundInNodeModules.push({
						package: dep.compromisedPackage,
						version: dep.version,
						path: dep.foundIn,
						depth: dep.depth,
						type: 'dependency-reference',
						referencedBy: dep.foundInPackageName,
						compromisedVersions: compromisedVersions,
					});

					log.warning(`  ⚠️  ${dep.compromisedPackage}@${dep.version} (未インストール)`);
					log.warning(`     依存元: ${dep.foundInPackageName}`);
					log.warning(`     場所: ${relativePath}`);
					log.warning(`     侵害バージョン: ${compromisedVersions.join(', ')}`);
					log.warning(`     注意: バージョン範囲が侵害バージョンを含む可能性があります`);
					totalFoundCount++;
					validDepCount++;
				}
			}
		});

		if (validDepCount > 0) {
			log.warning(`  ⚠️  ${validDepCount} 個の侵害された依存関係参照が検出されました`);
		} else {
			log.success('  ✅ パッケージの依存関係に侵害されたバージョンは検出なし');
		}
	} else {
		log.success('  ✅ パッケージの依存関係に検出なし');
	}
} else {
	log.warning('  ⚠️  node_modules が見つかりません');
	log.info(`     期待パス: ${paths.nodeModules}`);
}

console.log('');

// package.json の検査
log.title('📄 package.json を検査中...');

if (fs.existsSync(paths.packageJson)) {
	try {
		const packageJson = JSON.parse(fs.readFileSync(paths.packageJson, 'utf8'));

		const checkDeps = (deps, type) => {
			if (!deps) return;

			Object.keys(deps).forEach((pkg) => {
				// package.json のバージョンは範囲指定（^1.0.0など）なので、
				// パッケージ名がブラックリストにあるかだけをチェック
				if (COMPROMISED_PACKAGES_MAP.has(pkg)) {
					const compromisedVersions = COMPROMISED_PACKAGES_MAP.get(pkg);
					results.foundInPackageJson.push({
						package: pkg,
						version: deps[pkg],
						type,
						compromisedVersions: compromisedVersions,
					});
					log.warning(`  ⚠️  ${pkg}@${deps[pkg]} (${type})`);
					log.warning(`     侵害バージョン: ${compromisedVersions.join(', ')}`);
				}
			});
		};

		checkDeps(packageJson.dependencies, 'dependencies');
		checkDeps(packageJson.devDependencies, 'devDependencies');
		checkDeps(packageJson.peerDependencies, 'peerDependencies');
		checkDeps(packageJson.optionalDependencies, 'optionalDependencies');

		if (results.foundInPackageJson.length === 0) {
			log.success('  ✅ 検出なし');
		}
	} catch (error) {
		log.error(`  ❌ package.json の解析エラー: ${error.message}`);
	}
} else {
	log.warning('  ⚠️  package.json が見つかりません');
	log.info(`     期待パス: ${paths.packageJson}`);
}

console.log('');
console.log('='.repeat(70));
log.title('📊 検査結果サマリー');
console.log('='.repeat(70) + '\n');

// 結果の集計
const suspiciousIssueCount = (results.suspiciousFiles || []).reduce((acc, item) => acc + (item.paths?.length || 0), 0);
results.summary.totalIssues = results.foundInNodeModules.length + results.foundInPackageJson.length + suspiciousIssueCount;

results.summary.safe = results.summary.totalIssues === 0;

// リスクレベルの判定
if (suspiciousIssueCount > 0 || results.foundInNodeModules.length > 0) {
	results.summary.criticalLevel = 'critical';
} else if (results.foundInPackageJson.length > 0) {
	results.summary.criticalLevel = 'high';
}

// 検査対象の情報
console.log(`検査対象: ${c.cyan}${CONFIG.targetDir}${c.reset}`);
console.log(`検査パッケージ数: ${COMPROMISED_PACKAGES_MAP.size}\n`);

if (results.summary.safe) {
	log.success('✅ プロジェクトは安全です');
	console.log('   侵害されたパッケージは検出されませんでした\n');
} else {
	log.error(`🚨 ${results.summary.totalIssues} 件の問題が検出されました`);
	log.error(`   リスクレベル: ${results.summary.criticalLevel.toUpperCase()}\n`);

	console.log('検出箇所:');
	console.log(`  ${c.yellow}├─${c.reset} node_modules: ${results.foundInNodeModules.length} 件`);
	console.log(`  ${c.yellow}└─${c.reset} package.json: ${results.foundInPackageJson.length} 件\n`);

	// 検出されたパッケージの一覧と詳細
	console.log('検出されたパッケージ詳細:');

	const allFoundPkgs = new Set([...results.foundInNodeModules.map((p) => p.package), ...results.foundInPackageJson.map((p) => p.package)]);

	Array.from(allFoundPkgs).forEach((pkg) => {
		// このパッケージで検出されたすべてのバージョンを収集
		const allVersions = new Set();

		// node_modules から検出されたバージョン
		results.foundInNodeModules
			.filter((p) => p.package === pkg)
			.forEach((item) => {
				if (item.version && item.version !== 'unknown') {
					allVersions.add(item.version);
				}
			});

		// package.json から検出されたバージョン（範囲指定の可能性あり）
		results.foundInPackageJson
			.filter((p) => p.package === pkg)
			.forEach((item) => {
				if (item.version) {
					allVersions.add(item.version);
				}
			});

		// バージョン情報を表示
		const versionStr = allVersions.size > 0 ? `(${Array.from(allVersions).join(', ')})` : '';
		console.log(`  ${c.red}● ${pkg}${versionStr}${c.reset}`);

		// node_modules での検出（実体）
		const installed = results.foundInNodeModules.filter((p) => p.package === pkg && p.type === 'installed');
		installed.forEach((item) => {
			const relativePath = path.relative(CONFIG.targetDir, item.path);
			console.log(`    └─ [実体] ${relativePath}`);

			// pnpm のパス構造から親パッケージを推測
			// 例: node_modules/.pnpm/@stoplight+spectral-rulesets@1.22.0/node_modules/@asyncapi/specs
			// 親: @stoplight/spectral-rulesets
			if (relativePath.includes('.pnpm/')) {
				// @scope+package@version または package@version の形式をマッチ
				const pnpmMatch = relativePath.match(/\.pnpm\/(@?[^@/]+)@[^/]+\/node_modules\//);
				if (pnpmMatch) {
					let parentPkg = pnpmMatch[1];
					// pnpm はスコープの / を + に置換している
					parentPkg = parentPkg.replace(/\+/g, '/');

					// 自分自身でなければ表示
					if (parentPkg !== pkg) {
						console.log(`       (親パッケージの可能性: ${parentPkg})`);
					}
				}
			}
		});

		// node_modules での検出（依存関係）
		const deps = results.foundInNodeModules.filter((p) => p.package === pkg && p.type === 'dependency-reference');
		deps.forEach((item) => {
			const relativePath = path.relative(CONFIG.targetDir, item.path);
			console.log(`    └─ [依存元] ${item.referencedBy} (${relativePath})`);
		});

		// package.json での検出
		const inPkgJson = results.foundInPackageJson.filter((p) => p.package === pkg);
		inPkgJson.forEach((item) => {
			console.log(`    └─ [定義] package.json > ${item.type}`);
		});
	});

	console.log('');
	console.log('='.repeat(70));
	log.error('⚠️  至急対応が必要です！');
	console.log('='.repeat(70) + '\n');

	console.log('推奨される対応手順:\n');
	console.log(`${c.red}${c.bold}1. 永続化機構の停止と除去（最優先）${c.reset}`);
	console.log('   トークン失効を検知してホームディレクトリを削除する機構があるため、最初に行う必要があります。');
	console.log(`   - ${c.yellow}macOS:${c.reset} launchctl unload ~/Library/LaunchAgents/com.user.gh-token-monitor.plist`);
	console.log(`   - ${c.yellow}Linux:${c.reset} systemctl --user stop gh-token-monitor`);
	console.log('   - 以下のファイルを削除:');
	console.log('     ~/.config/gh-token-monitor, ~/.local/bin/gh-token-monitor.sh');
	console.log('     .claude/setup.mjs, .vscode/setup.mjs, .claude/router_runtime.js, /tmp/tmp.ts018051808.lock');
	console.log('');
	console.log(`${c.red}${c.bold}2. クレデンシャルのローテーション${c.reset}`);
	console.log('   永続化解除後に、GitHub トークン、AWS アクセスキー（SSM Parameter Store等含む）、');
	console.log('   すべての API キーを即座に更新してください。');
	console.log('');
	console.log(`${c.red}${c.bold}3. GitHub ワークフローとアカウントの調査${c.reset}`);
	console.log('   - .github/workflows/ に不審なファイル（codeql_analysis.yml 等）がないか確認');
	console.log('   - GitHub で不審なリポジトリ（Mini Shai-Hulud という説明など）がないか確認');
	console.log('');
	console.log(`${c.red}${c.bold}4. プロジェクトのクリーンアップ${c.reset}`);
	console.log(`   cd ${CONFIG.targetDir}`);
	console.log('   rm -rf node_modules');
	console.log('   npm cache clean --force');
	console.log('   ※ インストール時は npm install --ignore-scripts を推奨\n');
}

// レポートファイルの生成
try {
	const reportDir = path.dirname(CONFIG.outputFile);

	// ディレクトリが存在しなければ作成
	if (!fs.existsSync(reportDir)) {
		fs.mkdirSync(reportDir, { recursive: true });
	}

	fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2), 'utf8');
	log.info(`📝 詳細レポートを保存: ${path.relative(process.cwd(), CONFIG.outputFile)}`);
} catch (error) {
	log.error(`⚠️  レポートの保存に失敗: ${error.message}`);
}

console.log('');
console.log(`${c.blue}詳細情報:${c.reset} https://socket.dev/blog/shai-hulud-strikes-again-v2`);
console.log('');

// 終了コード
process.exit(results.summary.safe ? 0 : 1);
