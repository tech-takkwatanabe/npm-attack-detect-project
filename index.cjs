#!/usr/bin/env node

/**
 * Shai-Hulud 侵害パッケージ検査スクリプト（ターゲット指定対応版）
 * 外部ファイルからパッケージリストを読み込み、指定したディレクトリを検査
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
	packageListFile: path.join(__dirname, 'compromised_packages_simple.json'),
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
log.title('🔍 Shai-Hulud 侵害パッケージ検査（ターゲット指定対応版）');
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

// パッケージリストの読み込み
let COMPROMISED_PACKAGES = [];

try {
	if (fs.existsSync(CONFIG.packageListFile)) {
		log.info(`📂 パッケージリストを読み込み中: ${path.basename(CONFIG.packageListFile)}`);
		const data = fs.readFileSync(CONFIG.packageListFile, 'utf8');
		COMPROMISED_PACKAGES = JSON.parse(data);
		log.success(`✅ ${COMPROMISED_PACKAGES.length} 個のパッケージを読み込みました\n`);
	} else {
		log.error(`❌ エラー: ${CONFIG.packageListFile} が見つかりません`);
		log.warning(`\n最初に extract_packages.cjs を実行してください:`);
		console.log(`   node extract_packages.cjs\n`);
		process.exit(1);
	}
} catch (error) {
	log.error(`❌ パッケージリストの読み込みに失敗: ${error.message}`);
	process.exit(1);
}

// 検査対象ファイルのパス
const paths = {
	packageLock: path.join(CONFIG.targetDir, 'package-lock.json'),
	nodeModules: path.join(CONFIG.targetDir, 'node_modules'),
	packageJson: path.join(CONFIG.targetDir, 'package.json'),
};

// 結果を格納するオブジェクト
const results = {
	timestamp: new Date().toISOString(),
	targetDirectory: CONFIG.targetDir,
	totalChecked: COMPROMISED_PACKAGES.length,
	foundInPackageLock: [],
	foundInNodeModules: [],
	foundInPackageJson: [],
	summary: {
		safe: true,
		totalIssues: 0,
		criticalLevel: 'none', // none, low, medium, high, critical
	},
};

// package-lock.json の検査
log.title('📦 package-lock.json を検査中...');

if (fs.existsSync(paths.packageLock)) {
	try {
		const packageLock = JSON.parse(fs.readFileSync(paths.packageLock, 'utf8'));

		COMPROMISED_PACKAGES.forEach((pkg) => {
			// dependencies をチェック
			if (packageLock.dependencies && packageLock.dependencies[pkg]) {
				const version = packageLock.dependencies[pkg].version;
				results.foundInPackageLock.push({ package: pkg, version });
				log.warning(`  ⚠️  ${pkg}@${version}`);
			}

			// packages をチェック（npm v7+）
			if (packageLock.packages) {
				Object.keys(packageLock.packages).forEach((key) => {
					// node_modules/package または node_modules/@scope/package の形式
					const keyParts = key.split('node_modules/').pop();
					if (keyParts === pkg || key.endsWith('/' + pkg)) {
						const pkgData = packageLock.packages[key];
						const version = pkgData.version || 'unknown';

						if (!results.foundInPackageLock.find((p) => p.package === pkg)) {
							results.foundInPackageLock.push({ package: pkg, version });
							log.warning(`  ⚠️  ${pkg}@${version}`);
						}
					}
				});
			}
		});

		if (results.foundInPackageLock.length === 0) {
			log.success('  ✅ 検出なし');
		}
	} catch (error) {
		log.error(`  ❌ package-lock.json の解析エラー: ${error.message}`);
	}
} else {
	log.warning('  ⚠️  package-lock.json が見つかりません');
	log.info(`     期待パス: ${paths.packageLock}`);
}

console.log('');

// node_modules の検査
log.title('📂 node_modules を検査中（ディレクトリ + package.json の依存関係）...');

/**
 * node_modules 内を再帰的に検索してパッケージを探す
 * @param {string} nodeModulesPath - 検索する node_modules のパス
 * @param {string} targetPackage - 検索対象のパッケージ名
 * @param {number} depth - 現在の検索深度（デフォルト: 0）
 * @param {number} maxDepth - 最大検索深度（デフォルト: 5）
 * @returns {Array} 見つかったパッケージの情報配列
 */
function findPackageRecursively(nodeModulesPath, targetPackage, depth = 0, maxDepth = 5) {
	const results = [];

	// 深度制限チェック
	if (depth > maxDepth || !fs.existsSync(nodeModulesPath)) {
		return results;
	}

	try {
		const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const entryPath = path.join(nodeModulesPath, entry.name);

			// スコープディレクトリ (@scope) の場合
			if (entry.name.startsWith('@')) {
				try {
					const scopedEntries = fs.readdirSync(entryPath, {
						withFileTypes: true,
					});

					for (const scopedEntry of scopedEntries) {
						if (!scopedEntry.isDirectory()) continue;

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
							const nested = findPackageRecursively(nestedNodeModules, targetPackage, depth + 1, maxDepth);
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
					const nested = findPackageRecursively(nestedNodeModules, targetPackage, depth + 1, maxDepth);
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
 * @returns {Array} 見つかった依存関係の情報配列
 */
function scanPackageJsonDependencies(nodeModulesPath, compromisedPackages, depth = 0, maxDepth = 5) {
	const results = [];

	if (depth > maxDepth || !fs.existsSync(nodeModulesPath)) {
		return results;
	}

	try {
		const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const entryPath = path.join(nodeModulesPath, entry.name);

			// スコープディレクトリの場合
			if (entry.name.startsWith('@')) {
				try {
					const scopedEntries = fs.readdirSync(entryPath, {
						withFileTypes: true,
					});

					for (const scopedEntry of scopedEntries) {
						if (!scopedEntry.isDirectory()) continue;

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
							const nested = scanPackageJsonDependencies(nestedNodeModules, compromisedPackages, depth + 1, maxDepth);
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
				const nestedNodeModules = path.join(packagePath, 'node_modules');
				if (fs.existsSync(nestedNodeModules)) {
					const nested = scanPackageJsonDependencies(nestedNodeModules, compromisedPackages, depth + 1, maxDepth);
					results.push(...nested);
				}
			}
		}
	} catch (error) {
		// エラーは無視
	}

	return results;
}

if (fs.existsSync(paths.nodeModules)) {
	let checkedCount = 0;
	let totalFoundCount = 0;

	console.log('');
	log.info('  🔍 ステップ1: インストール済みパッケージの検査...');
	console.log('');

	// ステップ1: 実際にインストールされているパッケージを検索
	COMPROMISED_PACKAGES.forEach((pkg) => {
		const foundInstances = findPackageRecursively(paths.nodeModules, pkg);

		if (foundInstances.length > 0) {
			foundInstances.forEach((instance, index) => {
				const relativePath = path.relative(CONFIG.targetDir, instance.path);
				const depthInfo = instance.depth > 0 ? ` (深度: ${instance.depth})` : '';

				results.foundInNodeModules.push({
					package: pkg,
					version: instance.version,
					path: instance.path,
					depth: instance.depth,
					type: 'installed',
				});

				if (index === 0) {
					log.error(`  🚨 ${pkg}@${instance.version}${depthInfo}`);
				} else {
					log.warning(`     ├─ 重複インストール: ${instance.version}${depthInfo}`);
				}
				console.log(`     ${c.magenta}Path: ${relativePath}${c.reset}`);

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
	log.info('  🔍 ステップ2: package.json の依存関係を検査...');
	console.log('');

	// ステップ2: すべての package.json 内の依存関係を検査
	const dependencyReferences = scanPackageJsonDependencies(paths.nodeModules, COMPROMISED_PACKAGES);

	if (dependencyReferences.length > 0) {
		// パッケージごとにグループ化
		const grouped = {};
		dependencyReferences.forEach((ref) => {
			if (!grouped[ref.compromisedPackage]) {
				grouped[ref.compromisedPackage] = [];
			}
			grouped[ref.compromisedPackage].push(ref);
		});

		Object.keys(grouped).forEach((pkg) => {
			const refs = grouped[pkg];
			log.warning(`  ⚠️  ${pkg} が ${refs.length} 個の package.json で参照されています`);

			refs.forEach((ref, index) => {
				const relativePath = path.relative(CONFIG.targetDir, ref.foundIn);
				const symbol = index === refs.length - 1 ? '└─' : '├─';
				console.log(`     ${symbol} ${ref.foundInPackageName} (${ref.version})`);
				console.log(`        ${c.magenta}Path: ${relativePath}${c.reset}`);

				// 結果に追加（重複を避ける）
				const alreadyAdded = results.foundInNodeModules.find((item) => item.package === pkg && item.path === ref.foundIn);

				if (!alreadyAdded) {
					results.foundInNodeModules.push({
						package: pkg,
						version: ref.version,
						path: ref.foundIn,
						depth: ref.depth,
						type: 'dependency-reference',
						referencedBy: ref.foundInPackageName,
					});
					totalFoundCount++;
				}
			});
			console.log('');
		});
	} else {
		log.success('  ✅ 依存関係の参照に検出なし');
	}

	console.log('');
	log.info(`  📊 ${checkedCount} パッケージを検査しました`);
	if (totalFoundCount > 0) {
		log.warning(`  📊 合計 ${totalFoundCount} 件の問題を検出`);
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
				if (COMPROMISED_PACKAGES.includes(pkg)) {
					results.foundInPackageJson.push({
						package: pkg,
						version: deps[pkg],
						type,
					});
					log.warning(`  ⚠️  ${pkg}@${deps[pkg]} (${type})`);
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
results.summary.totalIssues = results.foundInPackageLock.length + results.foundInNodeModules.length + results.foundInPackageJson.length;

results.summary.safe = results.summary.totalIssues === 0;

// リスクレベルの判定
if (results.foundInNodeModules.length > 0) {
	results.summary.criticalLevel = 'critical';
} else if (results.foundInPackageJson.length > 0) {
	results.summary.criticalLevel = 'high';
} else if (results.foundInPackageLock.length > 0) {
	results.summary.criticalLevel = 'medium';
}

// 検査対象の情報
console.log(`検査対象: ${c.cyan}${CONFIG.targetDir}${c.reset}`);
console.log(`検査パッケージ数: ${COMPROMISED_PACKAGES.length}\n`);

if (results.summary.safe) {
	log.success('✅ プロジェクトは安全です');
	console.log('   侵害されたパッケージは検出されませんでした\n');
} else {
	log.error(`🚨 ${results.summary.totalIssues} 件の問題が検出されました`);
	log.error(`   リスクレベル: ${results.summary.criticalLevel.toUpperCase()}\n`);

	console.log('検出箇所:');
	console.log(`  ${c.yellow}├─${c.reset} package-lock.json: ${results.foundInPackageLock.length} 件`);
	console.log(`  ${c.yellow}├─${c.reset} node_modules: ${results.foundInNodeModules.length} 件`);
	console.log(`  ${c.yellow}└─${c.reset} package.json: ${results.foundInPackageJson.length} 件\n`);

	// 検出されたパッケージの一覧
	const allFound = new Set([...results.foundInPackageLock.map((p) => p.package), ...results.foundInNodeModules.map((p) => p.package), ...results.foundInPackageJson.map((p) => p.package)]);

	console.log('検出されたパッケージ:');
	Array.from(allFound).forEach((pkg, index) => {
		const symbol = index === allFound.size - 1 ? '└─' : '├─';
		console.log(`  ${c.red}${symbol}${c.reset} ${pkg}`);
	});

	console.log('');
	console.log('='.repeat(70));
	log.error('⚠️  至急対応が必要です！');
	console.log('='.repeat(70) + '\n');

	console.log('推奨される対応手順:\n');
	console.log(`${c.red}1.${c.reset} すべての API キー、トークン、パスワードを即座にローテーション`);
	console.log(`${c.red}2.${c.reset} ターゲットディレクトリで以下のコマンドを実行:`);
	console.log(`   ${c.cyan}cd ${CONFIG.targetDir}${c.reset}`);
	console.log(`   ${c.cyan}rm -rf node_modules${c.reset}`);
	console.log(`   ${c.cyan}npm cache clean --force${c.reset}`);
	console.log(`${c.red}3.${c.reset} package-lock.json から侵害されたパッケージを削除`);
	console.log(`${c.red}4.${c.reset} package.json から依存関係を削除または更新`);
	console.log(`${c.red}5.${c.reset} ${c.cyan}npm install${c.reset} で再インストール`);
	console.log(`${c.red}6.${c.reset} GitHub で 'Sha1-Hulud: The Second Coming' という`);
	console.log(`   説明のリポジトリがないか確認\n`);
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
