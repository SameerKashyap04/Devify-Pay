import { ProviderRegistry } from "@devify/payment-core";
import { ManualUpiProvider } from "./manual-upi/manual-upi.provider.js";
import { PhonepeProvider } from "./phonepe/phonepe.provider.js";
import { PaytmProvider } from "./paytm/paytm.provider.js";
import { RazorpayProvider } from "./razorpay/razorpay.provider.js";

export function buildProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new ManualUpiProvider());
  registry.register(new PhonepeProvider());
  registry.register(new PaytmProvider());
  registry.register(new RazorpayProvider());
  return registry;
}
