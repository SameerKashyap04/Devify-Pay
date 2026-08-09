import { z } from "zod";

export const createOrderSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).default("INR"),
  description: z.string().max(500).optional(),
  customer: z
    .object({
      name: z.string().max(200).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(20).optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateOrderBody = z.infer<typeof createOrderSchema>;

export const createPaymentSchema = z.object({
  order_id: z.string().min(1),
  method: z.enum(["UPI", "CARD", "NETBANKING", "WALLET", "OTHER"]).default("UPI"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePaymentBody = z.infer<typeof createPaymentSchema>;

export const paymentConfirmationSchema = z.object({
  transaction_id: z.string().min(3).max(100),
});
export type PaymentConfirmationBody = z.infer<typeof paymentConfirmationSchema>;

export const adminVerifyPaymentSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(1000).optional(),
});
export type AdminVerifyPaymentBody = z.infer<typeof adminVerifyPaymentSchema>;

export const createRefundSchema = z.object({
  payment_id: z.string().min(1),
  amount: z.number().int().positive().optional(), // omit for full refund
  reason: z.string().max(500).optional(),
});
export type CreateRefundBody = z.infer<typeof createRefundSchema>;

export const createWebhookEndpointSchema = z.object({
  url: z.string().url(),
});
export type CreateWebhookEndpointBody = z.infer<typeof createWebhookEndpointSchema>;

export const createApplicationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with dashes"),
  description: z.string().max(1000).optional(),
  webhook_url: z.string().url().optional(),
});
export type CreateApplicationBody = z.infer<typeof createApplicationSchema>;

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type AdminLoginBody = z.infer<typeof adminLoginSchema>;

export const createPlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default("INR"),
  interval: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]),
  interval_count: z.number().int().positive().default(1),
});
export type CreatePlanBody = z.infer<typeof createPlanSchema>;

export const createSubscriptionSchema = z.object({
  plan_id: z.string().min(1),
  customer: z.object({
    name: z.string().max(200).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateSubscriptionBody = z.infer<typeof createSubscriptionSchema>;
