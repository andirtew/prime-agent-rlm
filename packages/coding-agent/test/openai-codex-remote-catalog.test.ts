import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { afterEach, describe, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import {
	mergeCodexCatalogModels,
	readCachedCodexCatalog,
	refreshCodexRemoteCatalog,
} from "../src/core/openai-codex-remote-catalog.js";

type CodexModel = Model<"openai-codex-responses">;

const bundled: CodexModel[] = [
	{
		id: "gpt-5.1",
		name: "GPT-5.1",
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
		contextWindow: 272000,
		maxTokens: 128000,
	},
];

function catalogModel(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { id, name: `Model ${id}`, reasoning: false, input: ["text"], ...overrides };
}

function fakeResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
		...init,
	});
}

const tempDirs: string[] = [];
function cacheDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "codex-catalog-test-"));
	tempDirs.push(dir);
	return dir;
}
afterEach(() => {
	while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("mergeCodexCatalogModels", () => {
	it("replaces bundled codex models with catalog entries of the same id and keeps other providers", () => {
		const other: Model<Api> = {
			...(bundled[0]! as unknown as Model<Api>),
			id: "glm-5",
			provider: "百炼",
			api: "openai-completions",
		};
		const merged = mergeCodexCatalogModels(
			[bundled[0]!, other],
			[{ ...bundled[0]!, name: "GPT-5.1 (catalog)", cost: { input: 2, output: 20, cacheRead: 0.2, cacheWrite: 0 } }],
		);
		assert.strictEqual(merged.length, 2);
		const codex = merged.find((model) => model.provider === "openai-codex");
		assert.strictEqual(codex?.name, "GPT-5.1 (catalog)");
		assert.strictEqual(codex?.cost.input, 2);
		assert.ok(merged.includes(other), "non-codex providers pass through untouched");
	});

	it("appends catalog-only models and keeps bundled-only codex models", () => {
		const merged = mergeCodexCatalogModels(bundled, [{ ...bundled[0]!, id: "gpt-6-astra", name: "GPT-6 Astra" }]);
		assert.strictEqual(merged.length, 2);
		assert.ok(
			merged.some((model) => model.id === "gpt-5.1"),
			"bundled-only model kept",
		);
		assert.ok(
			merged.some((model) => model.id === "gpt-6-astra"),
			"catalog-only model appended",
		);
	});
});

describe("readCachedCodexCatalog", () => {
	it("returns undefined for a missing or malformed cache", () => {
		const dir = cacheDir();
		assert.strictEqual(readCachedCodexCatalog(join(dir, "cache.json")), undefined);
		const path = join(dir, "cache.json");
		writeFileSync(path, JSON.stringify({ models: "nope" }));
		assert.strictEqual(readCachedCodexCatalog(path), undefined);
		writeFileSync(path, "not json");
		assert.strictEqual(readCachedCodexCatalog(path), undefined);
	});

	it("reads cached models, falling back to bundled metadata for incomplete entries", () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		writeFileSync(path, JSON.stringify({ checkedAt: Date.now(), models: [catalogModel("gpt-6-astra")] }));
		const cached = readCachedCodexCatalog(path, bundled);
		assert.ok(cached);
		const astra = cached.models.find((model) => model.id === "gpt-6-astra");
		assert.ok(astra, "cached model parsed");
		assert.strictEqual(astra?.name, "Model gpt-6-astra");
		assert.strictEqual(astra?.contextWindow, 272000, "missing contextWindow falls back to the default");
		assert.deepStrictEqual(
			astra?.cost,
			{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			"missing cost falls back to zero-cost defaults",
		);
		assert.strictEqual(astra?.baseUrl, "https://chatgpt.com/backend-api");
	});
});

describe("refreshCodexRemoteCatalog", () => {
	it("serves the cache without a request until the TTL expires", async () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		writeFileSync(path, JSON.stringify({ checkedAt: Date.now(), models: [catalogModel("gpt-6-astra")] }));
		let requests = 0;
		const fetchFn = async () => {
			requests++;
			return fakeResponse([catalogModel("gpt-6-astra")]);
		};
		const models = await refreshCodexRemoteCatalog(path, bundled, { fetchFn });
		assert.strictEqual(requests, 0, "fresh cache short-circuits the network");
		assert.ok(models?.some((model) => model.id === "gpt-6-astra"));
	});

	it("fetches when the cache is stale, writes it, and returns the catalog models", async () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		writeFileSync(path, JSON.stringify({ checkedAt: 0, models: [catalogModel("gpt-5.1")], etag: '"old"' }));
		let seenIfNoneMatch: string | undefined;
		const fetchFn = async (_url: unknown, init?: RequestInit) => {
			seenIfNoneMatch = (init?.headers as Record<string, string>)["if-none-match"];
			return fakeResponse(
				[catalogModel("gpt-6-astra", { cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 } })],
				{
					headers: { etag: '"new"' },
				},
			);
		};
		const models = await refreshCodexRemoteCatalog(path, bundled, { fetchFn });
		assert.strictEqual(seenIfNoneMatch, '"old"', "a stale etag is revalidated");
		assert.ok(models?.some((model) => model.id === "gpt-6-astra"));
		assert.strictEqual(models?.find((model) => model.id === "gpt-6-astra")?.cost.input, 10);
		const written = JSON.parse(readFileSync(path, "utf8")) as { models: unknown[]; etag?: string; checkedAt: number };
		assert.strictEqual(written.etag, '"new"');
		assert.ok(written.checkedAt > 0);
		assert.strictEqual(written.models.length, 1);
	});

	it("keeps the cached models on a 304 revalidation", async () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		writeFileSync(path, JSON.stringify({ checkedAt: 0, models: [catalogModel("gpt-6-astra")], etag: '"same"' }));
		const fetchFn = async () => new Response(null, { status: 304, headers: { etag: '"same"' } });
		const models = await refreshCodexRemoteCatalog(path, bundled, { fetchFn });
		assert.ok(
			models?.some((model) => model.id === "gpt-6-astra"),
			"304 keeps the cached list",
		);
		const written = JSON.parse(readFileSync(path, "utf8")) as { checkedAt: number };
		assert.ok(written.checkedAt > 0, "the freshness window moves");
	});

	it("falls back to the cache when the request fails, and to undefined with no cache", async () => {
		const dir = cacheDir();
		const cachedPath = join(dir, "cache.json");
		writeFileSync(cachedPath, JSON.stringify({ checkedAt: 0, models: [catalogModel("gpt-6-astra")] }));
		const failing = async () => {
			throw new Error("network down");
		};
		const models = await refreshCodexRemoteCatalog(cachedPath, bundled, { fetchFn: failing });
		assert.ok(
			models?.some((model) => model.id === "gpt-6-astra"),
			"network failure falls back to the cache",
		);

		const emptyPath = join(dir, "empty.json");
		const none = await refreshCodexRemoteCatalog(emptyPath, bundled, { fetchFn: failing });
		assert.strictEqual(none, undefined, "no cache and no network leaves the bundled list in charge");
	});

	it("skips invalid entries and empty catalogs keep the previous state", async () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		const fetchFn = async () => fakeResponse([{ id: "" }, { name: "no id" }, "garbage", catalogModel("gpt-6-astra")]);
		const models = await refreshCodexRemoteCatalog(path, bundled, { fetchFn });
		assert.strictEqual(models?.length, 1);
		assert.strictEqual(models?.[0]?.id, "gpt-6-astra");

		const emptyFetch = async () => fakeResponse([]);
		const stillCatalog = await refreshCodexRemoteCatalog(path, bundled, { fetchFn: emptyFetch, force: true });
		assert.ok(
			stillCatalog?.some((model) => model.id === "gpt-6-astra"),
			"an empty remote catalog does not erase the cache",
		);
		// Negative caching: the empty fetch refreshed checkedAt, so the next refresh
		// short-circuits without touching the network.
		let emptyRequests = 0;
		const countingFetch = async () => {
			emptyRequests++;
			return fakeResponse([]);
		};
		await refreshCodexRemoteCatalog(path, bundled, { fetchFn: countingFetch });
		assert.strictEqual(emptyRequests, 0, "an empty catalog is not re-requested within the TTL");
	});

	it("deduplicates repeated ids in one catalog payload", async () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		const fetchFn = async () =>
			fakeResponse([
				catalogModel("gpt-6-astra", { name: "First" }),
				catalogModel("gpt-6-astra", { name: "Second" }),
			]);
		const models = await refreshCodexRemoteCatalog(path, bundled, { fetchFn });
		assert.strictEqual(models?.length, 1, "one entry per id");
		assert.strictEqual(models?.[0]?.name, "Second", "the later entry wins");
	});

	it("rejects a cache whose checkedAt is in the future", () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		writeFileSync(
			path,
			JSON.stringify({ checkedAt: Date.now() + 60 * 60 * 1000, models: [catalogModel("gpt-6-astra")] }),
		);
		assert.strictEqual(
			readCachedCodexCatalog(path, bundled),
			undefined,
			"a forged future timestamp does not pin the cache",
		);
	});

	it("shares one in-flight request across concurrent refreshes", async () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		let requests = 0;
		const fetchFn = async () => {
			requests++;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return fakeResponse([catalogModel("gpt-6-astra")]);
		};
		const [a, b] = await Promise.all([
			refreshCodexRemoteCatalog(path, bundled, { fetchFn }),
			refreshCodexRemoteCatalog(path, bundled, { fetchFn }),
		]);
		assert.strictEqual(requests, 1, "concurrent callers coalesce into a single request");
		assert.strictEqual(a?.length, 1);
		assert.strictEqual(b?.length, 1);
	});

	it("honors offline mode by never touching the network", async () => {
		const dir = cacheDir();
		const path = join(dir, "cache.json");
		writeFileSync(path, JSON.stringify({ checkedAt: 0, models: [catalogModel("gpt-6-astra")] }));
		const fetchFn = async () => {
			throw new Error("offline must not fetch");
		};
		const models = await refreshCodexRemoteCatalog(path, bundled, { fetchFn, offline: true });
		assert.ok(models?.some((model) => model.id === "gpt-6-astra"));
	});
});

describe("ModelRegistry integration: catalog overlay vs user configuration", () => {
	const tempDirs: string[] = [];
	function registryDir(): { dir: string; modelsJsonPath: string; cachePath: string } {
		const dir = mkdtempSync(join(tmpdir(), "codex-registry-test-"));
		tempDirs.push(dir);
		return {
			dir,
			modelsJsonPath: join(dir, "models.json"),
			cachePath: join(dir, "openai-codex-catalog-cache.json"),
		};
	}
	afterEach(() => {
		while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
	});

	it("applies user model overrides on top of the catalog overlay", () => {
		const { dir, modelsJsonPath, cachePath } = registryDir();
		// A fresh catalog with gpt-6-astra and a cheaper gpt-5.1.
		writeFileSync(
			cachePath,
			JSON.stringify({
				checkedAt: Date.now(),
				models: [
					catalogModel("gpt-6-astra"),
					catalogModel("gpt-5.1", { cost: { input: 99, output: 99, cacheRead: 0, cacheWrite: 0 } }),
				],
			}),
		);
		// The user pins their own cost for gpt-5.1 in models.json.
		writeFileSync(
			modelsJsonPath,
			JSON.stringify({
				providers: {
					"openai-codex": {
						baseUrl: "https://chatgpt.com/backend-api",
						models: [
							{
								id: "gpt-5.1",
								name: "GPT-5.1",
								api: "openai-codex-responses",
								reasoning: true,
								input: ["text"],
								cost: { input: 7, output: 7, cacheRead: 0, cacheWrite: 0 },
								contextWindow: 100000,
								maxTokens: 8000,
							},
						],
					},
				},
			}),
		);
		const registry = ModelRegistry.create(AuthStorage.create(join(dir, "auth.json")), modelsJsonPath);
		const codex = registry.getAll().filter((model) => model.provider === "openai-codex");
		const astra = codex.find((model) => model.id === "gpt-6-astra");
		assert.ok(astra, "the catalog-only model is available");
		const userFive = codex.find((model) => model.id === "gpt-5.1");
		assert.ok(userFive, "the overlaid bundled model is available");
		assert.strictEqual(userFive.cost.input, 7, "the user's custom model wins over the catalog entry");
		assert.strictEqual(userFive.contextWindow, 100000, "the user's custom model keeps its own metadata");
	});
});
