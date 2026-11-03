import { createBillingProvider, type BillingPort, type BillingReceipt } from '../src/features/billing/provider';
import type { Result } from '../src/features/plus/types';

const active: BillingReceipt = { active: true, expiresAtMs: 2000 };
const success = (value: BillingReceipt): Result<BillingReceipt> => ({ status: 'success', value });
function setup() {
  let now = 1000;
  let notify: (receipt: BillingReceipt) => void = () => {};
  const unsubscribe = jest.fn();
  const port: BillingPort = {
    getProducts: jest.fn(async () => ({ status: 'success' as const, value: [] })),
    getReceipt: jest.fn(async () => success(active)),
    purchase: jest.fn(async () => success(active)),
    restore: jest.fn(async () => success(active)),
    subscribe: listener => { notify = listener; return unsubscribe; },
  };
  const provider = createBillingProvider(port, () => now);
  const listener = jest.fn();
  provider.subscribe(listener);
  return { provider, port, listener, unsubscribe, emit: (r: BillingReceipt) => notify(r), setNow: (n: number) => { now = n; } };
}

it('grants Plus only from confirmed purchase/restore receipts', async () => {
  const { provider, listener } = setup();
  expect(await provider.purchase('plus_monthly')).toEqual({ status: 'success', value: 'plus' });
  expect(await provider.restore()).toEqual({ status: 'success', value: 'plus' });
  expect(listener).toHaveBeenCalledWith('plus');
});
it.each(['cancelled', 'pending'] as const)('%s does not grant access or overwrite ownership', async status => {
  const { provider, port, listener } = setup();
  jest.mocked(port.purchase).mockResolvedValue({ status });
  expect(await provider.purchase('plus_yearly')).toEqual({ status });
  expect(listener).not.toHaveBeenCalled();
});
it.each([false, true])('inactive/expired receipt stays free (active=%s)', async enabled => {
  const { provider, port } = setup();
  jest.mocked(port.restore).mockResolvedValue(success({ active: enabled, expiresAtMs: 1000 }));
  expect(await provider.restore()).toEqual({ status: 'success', value: 'free' });
});
it('refresh checks expiry and revocation notifications revoke immediately', async () => {
  const { provider, setNow, emit, listener } = setup();
  await provider.getEntitlement();
  emit({ active: false, expiresAtMs: 2000 });
  expect(listener).toHaveBeenLastCalledWith('free');
  setNow(2000);
  expect(await provider.getEntitlement()).toEqual({ status: 'success', value: 'free' });
});
it('never lets an older request undo a newer provider event', async () => {
  const { provider, port, emit } = setup();
  let resolve!: (result: Result<BillingReceipt>) => void;
  jest.mocked(port.purchase).mockReturnValue(new Promise(r => { resolve = r; }));
  const pending = provider.purchase('plus_monthly');
  emit({ active: false, expiresAtMs: 2000 });
  resolve(success(active));
  expect(await pending).toEqual({ status: 'success', value: 'free' });
});
it('rejects concurrent operations without starting another store transaction', async () => {
  const { provider, port } = setup();
  let resolve!: (result: Result<BillingReceipt>) => void;
  jest.mocked(port.purchase).mockReturnValue(new Promise(r => { resolve = r; }));
  const pending = provider.purchase('plus_monthly');
  expect(await provider.restore()).toEqual({ status: 'pending' });
  expect(port.restore).not.toHaveBeenCalled();
  resolve(success(active));
  await pending;
});
it('disposal disconnects once and rejects late results/events and future operations', async () => {
  const { provider, port, emit, unsubscribe, listener } = setup();
  let resolve!: (result: Result<BillingReceipt>) => void;
  jest.mocked(port.restore).mockReturnValue(new Promise(r => { resolve = r; }));
  const pending = provider.restore();
  provider.dispose(); provider.dispose();
  listener.mockClear();
  emit(active); resolve(success(active));
  expect(await pending).toEqual({ status: 'error', error: { code: 'unavailable' } });
  expect(await provider.getEntitlement()).toEqual({ status: 'error', error: { code: 'unavailable' } });
  expect(listener).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('sanitizes thrown errors and clears stale access on failed refresh', async () => {
  const { provider, port, listener } = setup();
  await provider.getEntitlement();
  jest.mocked(port.getReceipt).mockRejectedValue(new Error('sensitive SDK payload'));
  expect(await provider.getEntitlement()).toEqual({ status: 'error', error: { code: 'provider_failure' } });
  expect(listener).toHaveBeenLastCalledWith('free');
});
it('rejects invalid products before calling the port', async () => {
  const { provider, port } = setup();
  expect(await provider.purchase('waitlist' as 'plus_monthly')).toEqual({ status: 'error', error: { code: 'invalid_product' } });
  expect(port.purchase).not.toHaveBeenCalled();
});
it.each([NaN, Infinity, -1])('fails closed for invalid expiry %s', async expiresAtMs => {
  const { provider, port } = setup();
  jest.mocked(port.getReceipt).mockResolvedValue(success({ active: true, expiresAtMs }));
  expect(await provider.getEntitlement()).toEqual({ status: 'success', value: 'free' });
});
it('retains confirmed ownership when an upgrade is cancelled', async () => {
  const { provider, port, listener } = setup();
  await provider.getEntitlement();
  listener.mockClear();
  jest.mocked(port.purchase).mockResolvedValue({ status: 'cancelled' });
  await provider.purchase('plus_yearly');
  expect(listener).not.toHaveBeenCalled();
  expect(await provider.getEntitlement()).toEqual({ status: 'success', value: 'plus' });
});
it('does not grant access if the revocation listener cannot connect', async () => {
  const { port } = setup();
  port.subscribe = () => { throw new Error('private'); };
  const provider = createBillingProvider(port);
  expect(await provider.purchase('plus_monthly')).toEqual({ status: 'error', error: { code: 'unavailable' } });
  expect(port.purchase).not.toHaveBeenCalled();
});
it('isolates subscribers and makes individual unsubscribe idempotent', async () => {
  const { provider, emit } = setup();
  provider.subscribe(() => { throw new Error('consumer'); });
  const listener = jest.fn();
  const subscription = provider.subscribe(listener);
  emit(active);
  expect(listener).toHaveBeenCalledWith('plus');
  if (subscription.status !== 'success') throw new Error('subscription failed');
  subscription.value(); subscription.value();
  listener.mockClear(); emit(active);
  expect(listener).not.toHaveBeenCalled();
});
it('copies product fields without passing customer metadata or inventing trial eligibility', async () => {
  const { provider, port } = setup();
  const product = { id: 'plus_monthly' as const, price: 4.99, currency: 'USD' as const, period: 'month' as const, trialDays: 0, privateMetadata: 'synthetic' };
  jest.mocked(port.getProducts).mockResolvedValue({ status: 'success', value: [product] });
  expect(await provider.getProducts()).toEqual({ status: 'success', value: [{ id: 'plus_monthly', price: 4.99, currency: 'USD', period: 'month', trialDays: 0 }] });
});
it('sanitizes returned error objects as well as thrown errors', async () => {
  const { provider, port } = setup();
  const error = { code: 'unavailable' as const, message: 'synthetic-private' };
  jest.mocked(port.restore).mockResolvedValue({ status: 'error', error });
  jest.mocked(port.getProducts).mockResolvedValue({ status: 'error', error });
  expect(await provider.restore()).toEqual({ status: 'error', error: { code: 'provider_failure' } });
  expect(await provider.getProducts()).toEqual({ status: 'error', error: { code: 'provider_failure' } });
});
