import { describe, expect, it, vi } from "vitest";
import type { ActiveSessionState, DaemonSocketClient } from "../src/modes/daemon/active-session-state.js";
import { AgentDaemon } from "../src/modes/daemon/daemon-mode.js";

/**
 * worker_discard_empty_drafts: the supervisor evicts an all-empty-draft worker
 * on last client detach, but the graceful stop keeps the session files (reason
 * "shutdown" preserves resume entries). Before the discard command existed the
 * files lingered as "(no messages)" rows. The worker re-validates locally so a
 * stale supervisor view can never delete a session a client reattached to or
 * content arrived into.
 */

interface ClientStub {
	authenticationRole?: string;
}

function makeDaemon(sessions: ActiveSessionState[]): {
	daemon: AgentDaemon;
	closeSession: ReturnType<typeof vi.fn>;
	isEmptyDraftContent: ReturnType<typeof vi.fn>;
} {
	const closeSession = vi.fn().mockResolvedValue(undefined);
	const isEmptyDraftContent = vi.fn().mockReturnValue(true);
	const log = vi.fn();
	const daemon = Object.assign(Object.create(AgentDaemon.prototype) as object, {
		sessions: new Map(sessions.map((state) => [state.activeSessionId, state])),
		closeSession,
		isEmptyDraftContent,
		log,
	}) as AgentDaemon & {
		closeSession: typeof closeSession;
		isEmptyDraftContent: typeof isEmptyDraftContent;
		log: typeof log;
	};
	return { daemon, closeSession, isEmptyDraftContent };
}

function makeState(options: {
	id: string;
	kind?: string;
	clients?: ClientStub[];
	bash?: boolean;
	name?: string;
}): ActiveSessionState {
	const clientStubs = (options.clients ?? []).map(
		(stub) => ({ authenticationRole: stub.authenticationRole ?? "session_client" }) as DaemonSocketClient,
	);
	return {
		activeSessionId: options.id,
		clients: new Set(clientStubs),
		runtime: {
			metadata: { kind: options.kind ?? "top-level" },
			session: {
				sessionId: `session-${options.id}`,
				sessionName: options.name,
				isBashRunning: options.bash ?? false,
				isSessionActive: false,
				hasRunningRlmChildren: () => false,
			},
		},
	} as unknown as ActiveSessionState;
}

describe("AgentDaemon.discardEmptyDrafts", () => {
	it("discards an empty top-level draft with only the supervisor relay attached", async () => {
		const state = makeState({ id: "draft", clients: [{ authenticationRole: "supervisor" }] });
		const { daemon, closeSession } = makeDaemon([state]);
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual(["session-draft"]);
		expect(closeSession).toHaveBeenCalledWith(state, "killed");
	});

	it("discards a draft with no clients at all", async () => {
		const state = makeState({ id: "lonely", clients: [] });
		const { daemon, closeSession } = makeDaemon([state]);
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual(["session-lonely"]);
		expect(closeSession).toHaveBeenCalledWith(state, "killed");
	});

	it("keeps a draft that a real client reattached to", async () => {
		const state = makeState({ id: "reattached", clients: [{ authenticationRole: "session_client" }] });
		const { daemon, closeSession } = makeDaemon([state]);
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("keeps subagent sessions even when empty (children follow the parent lifecycle)", async () => {
		const state = makeState({ id: "child", kind: "subagent", clients: [] });
		const { daemon, closeSession } = makeDaemon([state]);
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("keeps a session with live work or a running bash command", async () => {
		const bashState = makeState({ id: "bash-running", clients: [] });
		(bashState.runtime.session as { isBashRunning: boolean }).isBashRunning = true;
		const { daemon: bashDaemon, closeSession: bashClose } = makeDaemon([bashState]);
		expect(await bashDaemon.discardEmptyDrafts()).toEqual([]);
		expect(bashClose).not.toHaveBeenCalled();

		// hasLiveSessionWork reads session.isSessionActive / hasRunningRlmChildren.
		const liveState = makeState({ id: "live-work", clients: [] });
		Object.assign(liveState.runtime.session, { isSessionActive: true });
		const { daemon: liveDaemon, closeSession: liveClose } = makeDaemon([liveState]);
		expect(await liveDaemon.discardEmptyDrafts()).toEqual([]);
		expect(liveClose).not.toHaveBeenCalled();
	});

	it("keeps a session with an attach in flight (a real client is landing)", async () => {
		const state = makeState({ id: "attaching", clients: [] });
		(state as unknown as { pendingAttaches: number }).pendingAttaches = 1;
		const { daemon, closeSession } = makeDaemon([state]);
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("keeps processing after one session's close throws (error isolation)", async () => {
		const bad = makeState({ id: "bad", clients: [] });
		const good = makeState({ id: "good", clients: [] });
		const { daemon, closeSession } = makeDaemon([bad, good]);
		closeSession.mockRejectedValueOnce(new Error("dispose failed"));
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual(["session-good"]);
		expect(closeSession).toHaveBeenCalledTimes(2);
	});

	it("keeps a named session even when empty and unattached", async () => {
		const state = makeState({ id: "named", clients: [], name: "重要会话" });
		const { daemon, closeSession } = makeDaemon([state]);
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("keeps a session the local emptiness check rejects (content, stash, or scheduled jobs)", async () => {
		const state = makeState({ id: "has-content", clients: [] });
		const { daemon, closeSession, isEmptyDraftContent } = makeDaemon([state]);
		isEmptyDraftContent.mockReturnValue(false);
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual([]);
		expect(closeSession).not.toHaveBeenCalled();
	});

	it("discards only the qualifying sessions of a mixed worker", async () => {
		const draft = makeState({ id: "draft", clients: [{ authenticationRole: "supervisor" }] });
		const named = makeState({ id: "named", clients: [] });
		const { daemon, closeSession, isEmptyDraftContent } = makeDaemon([draft, named]);
		isEmptyDraftContent.mockImplementation((state: ActiveSessionState) => state !== named);
		const discarded = await daemon.discardEmptyDrafts();
		expect(discarded).toEqual(["session-draft"]);
		expect(closeSession).toHaveBeenCalledTimes(1);
		expect(closeSession).toHaveBeenCalledWith(draft, "killed");
	});
});
