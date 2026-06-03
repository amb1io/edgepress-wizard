import type { OAuthAccessContext } from "./token-exchange";

export type PendingOAuthFlow = {
	stateQueryParam: string;
	codeVerifier: string;
	wizardOrigin: string;
	createdAt: number;
};

export type CompletedOAuthSession = OAuthAccessContext & {
	createdAt: number;
};

const pendingFlows = new Map<string, PendingOAuthFlow>();
const completedSessions = new Map<string, CompletedOAuthSession>();

const SESSION_TTL_MS = 10 * 60 * 1000;

function purgeExpiredEntries() {
	const now = Date.now();
	for (const [key, flow] of pendingFlows) {
		if (now - flow.createdAt > SESSION_TTL_MS) pendingFlows.delete(key);
	}
	for (const [key, session] of completedSessions) {
		if (now - session.createdAt > SESSION_TTL_MS)
			completedSessions.delete(key);
	}
}

export function createPendingOAuthFlow(
	flow: Omit<PendingOAuthFlow, "createdAt">,
): void {
	purgeExpiredEntries();
	pendingFlows.set(flow.stateQueryParam, { ...flow, createdAt: Date.now() });
}

export function consumePendingOAuthFlow(
	stateQueryParam: string,
): PendingOAuthFlow | undefined {
	purgeExpiredEntries();
	const flow = pendingFlows.get(stateQueryParam);
	if (flow) pendingFlows.delete(stateQueryParam);
	return flow;
}

export function createCompletedOAuthSession(
	session: OAuthAccessContext,
): string {
	purgeExpiredEntries();
	const sessionId = crypto.randomUUID();
	completedSessions.set(sessionId, { ...session, createdAt: Date.now() });
	return sessionId;
}

export function consumeCompletedOAuthSession(
	sessionId: string,
): CompletedOAuthSession | undefined {
	purgeExpiredEntries();
	const session = completedSessions.get(sessionId);
	if (session) completedSessions.delete(sessionId);
	return session;
}
