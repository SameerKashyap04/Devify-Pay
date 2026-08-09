import { prisma } from "@devify/database";

export async function recordAuditLog(params: {
  actorType: "ADMIN" | "APPLICATION" | "SYSTEM";
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) {
  await prisma.auditLog.create({
    data: {
      actorType: params.actorType,
      actorId: params.actorId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata as any,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}
