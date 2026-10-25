import { existsSync, readFileSync } from "node:fs";
import type { Api, Model } from "@earendil-works/pi-ai";
import { writeFileAtomicSync } from "../utils/atomic-file.js";

/**
 * Dynamic OpenAI Codex model catalog, ported from upstream pi 1.2.0's
 * remote-catalog mechanism (pi.dev serves a public per-provider catalog with
 * full model metadata). The catalog is fetched in the background, persisted to
 * the agent directory, and merged over the bundled codex list so new OpenAI
 * models appear without a code change. Every failure mode falls back to the
 * bundled list: the remote catalog is an overlay, never a dependency.
 */
const CODEX_REMOTE_CATALOG_URL = "https://pi.dev/api/models/providers/openai-codex";
const CODEX_CATALOG_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
const CODEX_CATALOG_TIMEOUT_MS = 4_000;
const CODEX_CATALOG_MAX_BYTES = 2 * 1024 * 1024;
const CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const CODEX_DEFAULT_CONTEXT_WINDOW = 272_000;
const CODEX_DEFAULT_MAX_TOKENS = 128_000;

type CodexModel = Model<"openai-codex-responses">;

/** Disk cache: raw catalog entries plus freshness bookkeeping. */
interface CodexCatalogCache {
	checkedAt: number;
	etag?: string;
	lastModified?: number;
	models: unknown[];
}

/** In-flight refreshes keyed by cache path, so concurrent callers share one request. */
const pendingRefreshes = new Map<string, Promise<CodexModel[] | undefined>>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseCost(value: unknown): Model<Api>["cost"] | undefined {
	if (!isRecord(value)) return undefined;
	const { input, output, cacheRead, cacheWrite } = value;
	if (typeof input !== "number" || typeof output !== "number") return undefined;
	const cost: Model<Api>["cost"] = {
		input,
		output,
		cacheRead: typeof cacheRead === "number" ? cacheRead : 0,
		cacheWrite: typeof cacheWrite === "number" ? cacheWrite : 0,
	};
	return cost;
}

function parseInput(value: unknown, fallback: readonly ("text" | "image")[]): ("text" | "image")[] {
	if (!Array.isArray(value)) return [...fallback];
	const input = value.filter((entry): entry is "text" | "image" => entry === "text" || entry === "image");
	return input.length > 0 ? input : [...fallback];
}

/**
 * Turn one raw catalog entry into a codex model. Fields the entry omits fall
 * back to the bundled model with the same id (fresh metadata for known ids),
 * then to conservative defaults (brand-new ids the bundle has never seen).
 */
function parseCodexModel(value: unknown, bundledById: Map<string, CodexModel>): CodexModel | undefined {
	if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) return undefined;
	const bundled = bundledById.get(value.id);
	return {
		id: value.id,
		name: typeof value.name === "string" ? value.name : (bundled?.name ?? value.id),
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: CODEX_BASE_URL,
		reasoning: typeof value.reasoning === "boolean" ? value.reasoning : (bundled?.reasoning ?? true),
		input: parseInput(value.input, bundled?.input ?? ["text", "image"]),
		cost: parseCost(value.cost) ?? bundled?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow:
			typeof value.contextWindow === "number"
				? value.contextWindow
				: (bundled?.contextWindow ?? CODEX_DEFAULT_CONTEXT_WINDOW),
		maxTokens:
			typeof value.maxTokens === "number" ? value.maxTokens : (bundled?.maxTokens ?? CODEX_DEFAULT_MAX_TOKENS),
		...(bundled?.compat ? { compat: bundled.compat } : {}),
	};
}

/** Accept the array form pi.dev serves and the `{ models: [...] }` envelope. */
function parseCodexCatalogPayload(value: unknown, bundled: readonly CodexModel[]): CodexModel[] {
	const entries = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.models) ? value.models : [];
	const bundledById = new Map(bundled.map((model) => [model.id, model]));
	return entries.flatMap((entry) => {
		const model = parseCodexModel(entry, bundledById);
		return model ? [model] : [];
	});
}

/**
 * Overlay catalog models over the current registry list: catalog entries
 * replace bundled codex models with the same id (fresh metadata), catalog-only
 * ids are appended, and every other provider passes through untouched.
 */
export function mergeCodexCatalogModels(models: readonly Model<Api>[], catalog: readonly CodexModel[]): Model<Api>[] {
	const catalogById = new Map(catalog.map((model) => [model.id, model]));
	const merged: Model<Api>[] = [];
	const seen = new Set<string>();
	for (const model of models) {
		if (model.provider !== "openai-codex") {
			merged.push(model);
			continue;
		}
		const overlay = catalogById.get(model.id);
		if (overlay) {
			merged.push(overlay);
			seen.add(model.id);
		} else {
			merged.push(model);
		}
	}
	for (const model of catalog) {
		if (!seen.has(model.id)) merged.push(model);
	}
	return merged;
}

export function readCachedCodexCatalog(
	cachePath: string,
	bundled: readonly CodexModel[] = [],
): { models: CodexModel[] } | undefined {
	if (!existsSync(cachePath)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as unknown;
		if (!isRecord(parsed) || !Array.isArray(parsed.models) || typeof parsed.checkedAt !== "number") return undefined;
		const models = parseCodexCatalogPayload(parsed.models, bundled);
		return { models };
	} catch {
		return undefined;
	}
}

function writeCodexCatalogCache(cachePath: string, cache: CodexCatalogCache): void {
	try {
		writeFileAtomicSync(cachePath, JSON.stringify(cache), { mode: 0o600 });
	} catch {
		// The bundled list remains available when the cache cannot be persisted.
	}
}

async function readCatalogResponse(response: Response): Promise<{
	etag: string | undefined;
	lastModified: number | undefined;
	payload: unknown;
}> {
	const etag = response.headers.get("etag") ?? undefined;
	const lastModifiedHeader = response.headers.get("last-modified");
	const lastModified = lastModifiedHeader ? Date.parse(lastModifiedHeader) : undefined;
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > CODEX_CATALOG_MAX_BYTES) {
		throw new Error("Codex model catalog response is too large");
	}
	const text = await response.text();
	if (text.length > CODEX_CATALOG_MAX_BYTES) throw new Error("Codex model catalog response is too large");
	return {
		etag,
		lastModified: Number.isNaN(lastModified) ? undefined : lastModified,
		payload: JSON.parse(text) as unknown,
	};
}

/**
 * Refresh the codex catalog: serve the disk cache until its TTL expires, then
 * revalidate with the remote catalog (etag 304 short-circuits the download).
 * Returns the merged catalog models, the cached models when the network fails,
 * or undefined when nothing is available and the bundled list should stand.
 */
export async function refreshCodexRemoteCatalog(
	cachePath: string,
	bundled: readonly CodexModel[],
	options: { fetchFn?: typeof fetch; offline?: boolean; force?: boolean } = {},
): Promise<CodexModel[] | undefined> {
	const cachedRaw = readCachedCodexCatalogRaw(cachePath);
	const cachedModels = cachedRaw ? parseCodexCatalogPayload(cachedRaw.models, bundled) : undefined;
	if (options.offline) return cachedModels ?? undefined;
	if (!options.force && cachedRaw && Date.now() - cachedRaw.checkedAt < CODEX_CATALOG_REFRESH_INTERVAL_MS) {
		return cachedModels ?? undefined;
	}
	const existing = pendingRefreshes.get(cachePath);
	if (existing) return existing;
	const promise = (async () => {
		const headers: Record<string, string> = { accept: "application/json" };
		if (cachedRaw?.models.length && cachedRaw.etag) headers["if-none-match"] = cachedRaw.etag;
		const response = await (options.fetchFn ?? fetch)(CODEX_REMOTE_CATALOG_URL, {
			headers,
			signal: AbortSignal.timeout(CODEX_CATALOG_TIMEOUT_MS),
		});
		if (response.status === 304 && cachedRaw) {
			writeCodexCatalogCache(cachePath, { ...cachedRaw, checkedAt: Date.now() });
			return cachedModels ?? undefined;
		}
		if (!response.ok) throw new Error(`Codex model catalog request failed with status ${response.status}`);
		const { etag, lastModified, payload } = await readCatalogResponse(response);
		const models = parseCodexCatalogPayload(payload, bundled);
		if (models.length === 0) return cachedModels ?? undefined;
		const rawEntries = Array.isArray(payload)
			? payload
			: isRecord(payload) && Array.isArray(payload.models)
				? payload.models
				: [];
		writeCodexCatalogCache(cachePath, { checkedAt: Date.now(), etag, lastModified, models: rawEntries });
		return models;
	})();
	pendingRefreshes.set(cachePath, promise);
	void promise
		.catch(() => undefined)
		.finally(() => {
			if (pendingRefreshes.get(cachePath) === promise) pendingRefreshes.delete(cachePath);
		});
	try {
		return await promise;
	} catch {
		return cachedModels ?? undefined;
	}
}

function readCachedCodexCatalogRaw(cachePath: string): CodexCatalogCache | undefined {
	if (!existsSync(cachePath)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as unknown;
		if (!isRecord(parsed) || !Array.isArray(parsed.models) || typeof parsed.checkedAt !== "number") return undefined;
		return {
			checkedAt: parsed.checkedAt,
			etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
			lastModified: typeof parsed.lastModified === "number" ? parsed.lastModified : undefined,
			models: parsed.models,
		};
	} catch {
		return undefined;
	}
}
