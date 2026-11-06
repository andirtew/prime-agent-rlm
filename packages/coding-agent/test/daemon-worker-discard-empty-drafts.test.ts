import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveSessionState, DaemonSocketClient } from "../src/modes/daemon/active-session-state.js";
import { AgentDaemon } from "../src/modes/daemon/daemon-mode.js";

/**
 * worker_discard_empty_drafts: the supervisor evicts an all-empty-draft worker
 * on last client detach; the discard pass re-validates locally and closes
 * qualifying sessions with "killed". Config-only sessions (model/effort/tier
 * switches past the creation prefix, zero messages) count as disposable here,
 * even though hasUserContent treats a bare config switch as content.
 */

interface ClientStub {
	authenticationRole?: string;
}

const KEEP_WORTHY = ["message", "custom_message", "custom", "label", "compaction", "branch_summary"];

function makeDaemon(sessions: ActiveSessionState[]): {
	daemon: AgentDaemon;
	closeSession: ReturnType<typeof vi.fn>;
	deleteSavedSessionFile: ReturnType<typeof vi.fn>;
	log: ReturnType<typeof vi.fn>;
} {
	const closeSession = vi.fn().mockResolvedValue(undefined);
	const deleteSavedSessionFile = vi.fn().mockResolvedValue(undefined);
	const log = vi.fn();
	const daemon = Object.assign(Object.create(AgentDaemon.prototype) as object, {
		sessions: new Map(sessions.map((state) => [state.activeSessionId, state])),
		closeSession,
		deleteSavedSessionFile,
		hasScheduledJobsForSession: vi.fn().mockReturnValue(false),
		log,
	}) as unknown as AgentDaemon & {
		closeSession: typeof closeSession;
		deleteSavedSessionFile: typeof deleteSavedSessionFile;
		hasScheduledJobsForSession: () => boolean;
		log: typeof log;
	};
	return { daemon, closeSession, deleteSavedSessionFile, log };
}

function makeState(options: {
	id: string;
	kind?: string;
	clients?: ClientStub[];
	bash?: boolean;
	name?: string;
	pendingAttaches?: number;
	entries?: Array<{ type: string }>;
	sessionFile?: string;
}): ActiveSessionState {
	const clientStubs = (options.clients ?? []).map(
		(stub) => ({ authenticationRole: stub.authenticationRole ?? "session_client" }) as DaemonSocketClient,
	);
	return {
		activeSessionId: options.id,
		clients: new Set(clientStubs),
		pendingAttaches: options.pendingAttaches ?? 0,
		runtime: {
			metadata: { kind: options.kind ?? "top-level" },
			session: {
				sessionId: `session-${options.id}`,
				sessionName: options.name,
				sessionFile: options.sessionFile,
				isBashRunning: options.bash ?? false,
				isSessionActive: false,
				hasRunningRlmChildren: () => false,
				sessionManager: {
					getEntries: () => options.entries ?? [{ type: "model_change" }],
					hasUserContent: () => false,
				},
			},
		},
	} as unknown as ActiveSessionState;
}

const tempDirs: string[] = [];
afterEach(() => {
	while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("AgentDaemon.discardEmptyDrafts", () => {
	it("discards a config-only draft (creation prefix alone)", async () => {
		const state = makeState({
			id: "plain",
			clients: [{ authenticationRole: "supervisor" }],
			entries: [
				{ type: "model_change" },
				{ type: "thinking_level_change" },
				{ type: "service_tier_change" },
				{ type: "session_state" },
			],
		});
		const { daemon, closeSession } = makeDaemon([state]);
		expect(await daemon.discardEmptyDrafts()).toEqual(["session-plain"]);
		expect(closeSession).toHaveBeenCalledWith(state, "killed");
	});

	it("discards a draft whose only extra entries are further config switches", async () => {
		const state = makeState({
			id: "model-hopper",
			clients: [],
			entries: [
				{ type: "model_change" },
				{ type: "thinking_level_change" },
				{ type: "service_tier_change" },
				{ type: "session_state" },
				{ type: "model_change" },
				{ type: "thinking_level_change" },
				{ type: "session_state" },
			],
		});
		const { daemon, closeSession } = makeDaemon([state]);
		expect(await daemon.discardEmptyDrafts()).toEqual(["session-model-hopper"]);
		expect(closeSession).toHaveBeenCalledWith(state, "killed");
	});

	it("deletes the session file when closeSession's stricter gate kept it", async () => {
		const dir = mkdtempSync(join(tmpdir(), "discard-test-"));
		tempDirs.push(dir);
		const sessionFile = join(dir, "session.jsonl");
		writeFileSync(sessionFile, "{}");
		const state = makeState({ id: "file", clients: [], entries: [{ type: "model_change" }], sessionFile });
		const { daemon, deleteSavedSessionFile } = makeDaemon([state]);
		expect(await daemon.discardEmptyDrafts()).toEqual(["session-file"]);
		expect(deleteSavedSessionFile).toHaveBeenCalledWith(sessionFile);
	});

	it("keeps a draft that a real client reattached to", async () => {
		const state = makeState({ id: "reattached", clients: [{ authenticationRole: "session_client" }] });
		const { daemon, closeSession } = makeDaemon([state]);
		expect(await daemon.discardEmptyDrafts()).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("keeps a draft with an attach in flight (a real client is landing)", async () => {
		const state = makeState({ id: "attaching", clients: [], pendingAttaches: 1 });
		const { daemon, closeSession } = makeDaemon([state]);
		expect(await daemon.discardEmptyDrafts()).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("keeps subagent sessions (children follow the parent lifecycle)", async () => {
		const state = makeState({ id: "child", kind: "subagent", clients: [] });
		const { daemon, closeSession } = makeDaemon([state]);
		expect(await daemon.discardEmptyDrafts()).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("keeps a named session even when empty and unattached", async () => {
		const state = makeState({ id: "named", clients: [], name: "重要会话" });
		const { daemon, closeSession } = makeDaemon([state]);
		expect(await daemon.discardEmptyDrafts()).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("keeps a session with any keep-worthy entry (message/custom/label/compaction/branch)", async () => {
		for (const type of KEEP_WORTHY) {
			const state = makeState({ id: `has-${type}`, clients: [], entries: [{ type }] });
			const { daemon, closeSession } = makeDaemon([state]);
			expect(await daemon.discardEmptyDrafts()).toEqual([]);
			expect(closeSession).not.toHaveBeenCalled();
		}
	});

	it("keeps a session with a scheduled job", async () => {
		const state = makeState({ id: "cron", clients: [], entries: [{ type: "model_change" }] });
		const { daemon } = makeDaemon([state]);
		(daemon as unknown as { hasScheduledJobsForSession: () => boolean }).hasScheduledJobsForSession = () => true;
		expect(await daemon.discardEmptyDrafts()).toEqual([]);
	});

	it("keeps a session with live work or a running bash command", async () => {
		const bashState = makeState({ id: "bash-running", clients: [] });
		(bashState.runtime.session as { isBashRunning: boolean }).isBashRunning = true;
		const { daemon: bashDaemon, closeSession: bashClose } = makeDaemon([bashState]);
		expect(await bashDaemon.discardEmptyDrafts()).toEqual([]);
		expect(bashClose).not.toHaveBeenCalled();

		const liveState = makeState({ id: "live-work", clients: [] });
		Object.assign(liveState.runtime.session, { isSessionActive: true });
		const { daemon: liveDaemon, closeSession: liveClose } = makeDaemon([liveState]);
		expect(await liveDaemon.discardEmptyDrafts()).toEqual([]);
		expect(liveClose).not.toHaveBeenCalled();
	});

	it("keeps processing after one session's close throws (error isolation)", async () => {
		const bad = makeState({ id: "bad", clients: [] });
		const good = makeState({ id: "good", clients: [] });
		const { daemon, closeSession } = makeDaemon([bad, good]);
		closeSession.mockRejectedValueOnce(new Error("dispose failed"));
		expect(await daemon.discardEmptyDrafts()).toEqual(["session-good"]);
		expect(closeSession).toHaveBeenCalledTimes(2);
	});

	it("discards only the qualifying sessions of a mixed worker", async () => {
		const draft = makeState({ id: "draft", clients: [{ authenticationRole: "supervisor" }] });
		const messageful = makeState({ id: "real", clients: [], entries: [{ type: "message" }] });
		const { daemon, closeSession } = makeDaemon([draft, messageful]);
		expect(await daemon.discardEmptyDrafts()).toEqual(["session-draft"]);
		expect(closeSession).toHaveBeenCalledTimes(1);
		expect(closeSession).toHaveBeenCalledWith(draft, "killed");
	});
});
