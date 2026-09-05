/**
 * Middleware chain — identity resolution
 *
 * Source pattern: a chain of framework hooks (Fastify preHandler hooks,
 * but the shape generalizes to Express middleware or NestJS guards) that
 * resolve "who is making this request" step by step, each stage attaching
 * or overriding an identity on the request object for the next stage /
 * final handler to read. Simplified/anonymized from a real-app auth chain
 * (session-token check -> dev-only bypass -> resolve-or-create internal
 * user record -> downstream override plugins).
 *
 * Shape: instead of one big auth function, resolution is split into
 * ordered, independently registered stages that each do one check and
 * either short-circuit (401, skip) or enrich the request and fall through.
 */

type Request = {
  method: string;
  url: string;
  sessionUserId?: string;
  user?: { id: string; role?: string };
};

type Reply = { code: (status: number) => { send: (body: unknown) => void } };

type PreHandler = (request: Request, reply: Reply) => Promise<void> | void;

const identityCache = new Map<string, string>();

// Stage 1: resolve identity from a real session, with a dev-only bypass and
// a cached lookup for the expensive "resolve or create internal user" step.
const resolveIdentity: PreHandler = async (request, reply) => {
  if (request.method === "OPTIONS") return;
  if (request.url.startsWith("/health")) return;

  const isDevBypass = process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "true";
  if (isDevBypass) {
    request.user = { id: "dev-user", role: process.env.AUTH_BYPASS_ROLE };
    return;
  }

  const sessionUserId = request.sessionUserId;
  if (!sessionUserId) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  let internalUserId = identityCache.get(sessionUserId);
  if (!internalUserId) {
    internalUserId = await findOrCreateInternalUser(sessionUserId);
    identityCache.set(sessionUserId, internalUserId);
  }

  request.user = { id: internalUserId };
};

// Stage 2: a later, independently registered hook that can further override
// the resolved identity (e.g. an "impersonate" feature for support staff).
const applyImpersonation: PreHandler = async (request) => {
  if (!request.user) return;

  const impersonatedId = await getActiveImpersonationTarget(request.user.id);
  if (impersonatedId) {
    request.user = { id: impersonatedId };
  }
};

// Registration order is the chain: each stage depends on the previous one
// having already attached `request.user`.
const identityResolutionChain: PreHandler[] = [resolveIdentity, applyImpersonation];

declare function findOrCreateInternalUser(sessionUserId: string): Promise<string>;
declare function getActiveImpersonationTarget(userId: string): Promise<string | null>;

// Wired up once, at startup — registration order *is* the chain:
//   for (const stage of identityResolutionChain) {
//     app.addHook("preHandler", stage);
//   }
