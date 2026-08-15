import { prisma } from "@devify/database";

export async function getOrCreateCustomer(params: {
  applicationId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  metadata?: any;
}) {
  const { applicationId, name, email, phone, metadata } = params;

  const normalizedEmail = email?.trim().toLowerCase() || null;
  const normalizedPhone = phone?.trim() || null;

  if (!normalizedEmail && !normalizedPhone) {
    return undefined;
  }

  // Find an existing customer matching either email or phone within the same application
  const existing = await prisma.customer.findFirst({
    where: {
      applicationId,
      OR: [
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    // Update existing customer record if new info is available
    const updateData: Record<string, any> = {};
    if (name && (!existing.name || existing.name !== name)) {
      updateData.name = name;
    }
    if (normalizedEmail && (!existing.email || existing.email !== normalizedEmail)) {
      updateData.email = normalizedEmail;
    }
    if (normalizedPhone && (!existing.phone || existing.phone !== normalizedPhone)) {
      updateData.phone = normalizedPhone;
    }
    if (metadata && JSON.stringify(metadata) !== JSON.stringify(existing.metadata)) {
      updateData.metadata = metadata;
    }

    if (Object.keys(updateData).length > 0) {
      return await prisma.customer.update({
        where: { id: existing.id },
        data: updateData,
      });
    }

    return existing;
  }

  // Create new customer record
  return await prisma.customer.create({
    data: {
      applicationId,
      name: name ?? null,
      email: normalizedEmail,
      phone: normalizedPhone,
      metadata: metadata ?? undefined,
    },
  });
}
