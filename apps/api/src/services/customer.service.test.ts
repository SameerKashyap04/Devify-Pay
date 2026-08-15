import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOrCreateCustomer } from "./customer.service.js";
import { prisma } from "@devify/database";

vi.mock("@devify/database", () => ({
  prisma: {
    customer: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("getOrCreateCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined if neither email nor phone is provided", async () => {
    const result = await getOrCreateCustomer({ applicationId: "app_1" });
    expect(result).toBeUndefined();
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it("returns existing customer and updates missing info if match found", async () => {
    const existingCustomer = {
      id: "cust_123",
      applicationId: "app_1",
      name: null,
      email: "test@example.com",
      phone: null,
      metadata: null,
    };
    (prisma.customer.findFirst as any).mockResolvedValue(existingCustomer);
    (prisma.customer.update as any).mockResolvedValue({
      ...existingCustomer,
      name: "New Name",
      phone: "9876543210",
    });

    const result = await getOrCreateCustomer({
      applicationId: "app_1",
      email: "TEST@example.com ",
      name: "New Name",
      phone: "9876543210",
    });

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: {
        applicationId: "app_1",
        OR: [{ email: "test@example.com" }, { phone: "9876543210" }],
      },
      orderBy: { createdAt: "asc" },
    });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust_123" },
      data: { name: "New Name", phone: "9876543210" },
    });
    expect(result?.id).toBe("cust_123");
  });

  it("creates a new customer if no match is found", async () => {
    (prisma.customer.findFirst as any).mockResolvedValue(null);
    const newCustomer = {
      id: "cust_new",
      applicationId: "app_1",
      name: "New User",
      email: "new@example.com",
      phone: null,
    };
    (prisma.customer.create as any).mockResolvedValue(newCustomer);

    const result = await getOrCreateCustomer({
      applicationId: "app_1",
      email: "new@example.com",
      name: "New User",
    });

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: {
        applicationId: "app_1",
        name: "New User",
        email: "new@example.com",
        phone: null,
        metadata: undefined,
      },
    });
    expect(result?.id).toBe("cust_new");
  });
});
