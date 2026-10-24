// HTTP routes for docs/api.md section 3. Every body and query is parsed with
// the zod schemas from @ipin/shared (T4); errors are { error: { code, message } }.
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { BaseError } from "viem"
import { z } from "zod"

import {
  approveBodySchema,
  claimInviteBodySchema,
  createInviteBodySchema,
  createRequestBodySchema,
  listRequestsQuerySchema,
  rejectBodySchema,
  toRequestJson,
} from "@ipin/shared"

import { describeError } from "./chain"
import { ApiError } from "./errors"
import type { Logger } from "./logger"
import type { RelayerService } from "./service"

async function parseBody<T extends z.ZodType>(
  raw: unknown,
  schema: T,
): Promise<z.output<T>> {
  const result = await schema.safeParseAsync(raw)
  if (!result.success) {
    throw new ApiError(400, "BAD_REQUEST", z.prettifyError(result.error))
  }
  return result.data
}

async function readJson(req: {
  json: () => Promise<unknown>
}): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "body must be JSON")
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ApiError(400, "BAD_REQUEST", "body must be a JSON object")
  }
  return raw as Record<string, unknown>
}

export function createApp(opts: {
  service: RelayerService
  logger: Logger
  corsOrigin: string[] | "*"
}): Hono {
  const { service, logger } = opts
  const app = new Hono()

  app.use(
    "*",
    cors({
      origin: opts.corsOrigin,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  )
  app.use("*", bodyLimit({ maxSize: 16 * 1024 }))
  app.use("*", async (c, next) => {
    const start = Date.now()
    await next()
    logger.debug(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
      },
      "http",
    )
  })

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.status as ContentfulStatusCode,
      )
    }
    if (err instanceof BaseError) {
      const message = describeError(err)
      logger.error({ path: c.req.path, reason: message }, "chain error")
      return c.json({ error: { code: "CHAIN_ERROR", message } }, 502)
    }
    logger.error({ err, path: c.req.path }, "unhandled error")
    return c.json(
      { error: { code: "INTERNAL", message: "internal error" } },
      500,
    )
  })
  app.notFound((c) =>
    c.json({ error: { code: "NOT_FOUND", message: "no such route" } }, 404),
  )

  app.get("/health", async (c) => c.json(await service.health()))
  app.get("/config", async (c) => c.json(await service.config()))

  app.post("/invites", async (c) => {
    const body = await parseBody(await readJson(c.req), createInviteBodySchema)
    return c.json(await service.createInvite(body), 201)
  })
  app.get("/invites/:code", (c) => {
    const inv = service.getInvite(c.req.param("code"))
    return c.json({
      potId: inv.potId.toString(),
      label: inv.label,
      ...(inv.claimedBy === undefined ? {} : { claimedBy: inv.claimedBy }),
    })
  })
  app.post("/invites/:code/claim", async (c) => {
    const body = await parseBody(await readJson(c.req), claimInviteBodySchema)
    return c.json(await service.claimInvite(c.req.param("code"), body))
  })

  app.post("/requests", async (c) => {
    const raw = asRecord(await readJson(c.req))
    const body = await parseBody(raw, createRequestBodySchema)
    return c.json(await service.createRequest(body, raw), 201)
  })
  app.get("/requests", async (c) => {
    const query = await parseBody(c.req.query(), listRequestsQuerySchema)
    const filter = {
      ...(query.potId === undefined ? {} : { potId: query.potId }),
      ...(query.status === undefined ? {} : { status: query.status }),
    }
    return c.json(service.listRequests(filter).map(toRequestJson))
  })
  app.get("/requests/:id", (c) =>
    c.json(toRequestJson(service.getRequest(c.req.param("id")))),
  )
  app.post("/requests/:id/approve", async (c) => {
    const body = await parseBody(await readJson(c.req), approveBodySchema)
    return c.json(await service.approve(c.req.param("id"), body))
  })
  app.post("/requests/:id/reject", async (c) => {
    const body = await parseBody(await readJson(c.req), rejectBodySchema)
    return c.json(await service.reject(c.req.param("id"), body.senderSignature))
  })

  return app
}
