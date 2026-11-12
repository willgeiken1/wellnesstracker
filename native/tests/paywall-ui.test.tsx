import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';
import { PaywallScreen, type PaywallScreenProps } from '../src/features/paywall/screen';
import { mockPurchaseProvider } from '../src/features/paywall/purchase-provider';
import { ThemeProvider } from '../src/design/theme-provider';

const props = (): PaywallScreenProps => ({
  products: [
    { id: 'monthly', title: 'Monthly', priceString: '$4.99', period: 'month', trialDays: 7 },
    { id: 'yearly', title: 'Yearly', priceString: '$39.99', period: 'year', trialDays: 7 },
  ],
  onPurchase: jest.fn(), onRestore: jest.fn(), onClose: jest.fn(),
  termsUrl: 'https://example.invalid/terms', privacyUrl: 'https://example.invalid/privacy',
});
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

test('each product discloses price, period, trial and automatic renewal before purchase', async () => {
  const input = props();
  await render(<PaywallScreen {...input} />, { wrapper });
  for (const product of input.products) {
    const card = within(screen.getByTestId(`paywall-product-${product.id}`));
    expect(card.getByText(`${product.priceString} per ${product.period}`)).toBeTruthy();
  }
  // One renewal line covers both plans and sits with the plan cards, above nothing that hides it.
  expect(screen.getByText('Renews automatically unless cancelled at least 24 hours before the end of the period; manage in Settings.')).toBeTruthy();
  expect(screen.getByText('7-day free trial, then $4.99 per month.')).toBeTruthy();
  expect(screen.getByText('7-day free trial, then $39.99 per year.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Subscribe to Monthly' }));
  expect(input.onPurchase).toHaveBeenCalledWith('monthly');
});

test('yearly Insight Plus has a 7-day trial and the trial text renders', async () => {
  const yearly = mockPurchaseProvider.products.find(product => product.period === 'year');
  if (!yearly) throw new Error('yearly product missing');
  expect(yearly.trialDays).toBe(7);
  const input = props();
  input.products = [yearly];
  await render(<PaywallScreen {...input} />, { wrapper });
  expect(within(screen.getByTestId(`paywall-product-${yearly.id}`)).getByText('7-day free trial, then $39.99 per year.')).toBeTruthy();
});

test('restore and legal links work; closing is available even while busy with an error', async () => {
  const input = props();
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
  try {
    const view = await render(<PaywallScreen {...input} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
    expect(input.onRestore).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('link', { name: 'Terms of use' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));
    expect(open.mock.calls).toEqual([[input.termsUrl], [input.privacyUrl]]);
    await view.rerender(<PaywallScreen {...input} busy error="Could not complete purchase. Try again." />);
    expect(screen.getByText('Could not complete purchase. Try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Subscribe to Monthly' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Subscribe to Monthly' }));
    expect(input.onPurchase).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Close Insight Plus' }));
    expect(input.onClose).toHaveBeenCalledTimes(1);
    await view.rerender(<PaywallScreen {...input} />);
    await fireEvent.press(screen.getByRole('radio', { name: /^Yearly, / }));
    await fireEvent.press(screen.getByRole('button', { name: 'Subscribe to Yearly' }));
    expect(input.onPurchase).toHaveBeenCalledWith('yearly');
  } finally { open.mockRestore(); }
});

test('all protected features are always free without purchasing or restoring', async () => {
  const input = props();
  await render(<PaywallScreen {...input} />, { wrapper });
  const free = within(screen.getByTestId('paywall-always-free'));
  expect(free.getByText('Always free')).toBeTruthy();
  for (const feature of ['988 crisis card', 'Data export', 'Data and account deletion', 'Logging', 'Check-ins', 'Workouts', 'Barcode scan', 'Import from the web app', 'Basic trends', 'Advanced trends', 'Plain workout summary']) {
    expect(free.getByText(feature)).toBeTruthy();
  }
  expect(input.onPurchase).not.toHaveBeenCalled();
  expect(input.onRestore).not.toHaveBeenCalled();
  expect(free.getByText('2 free AI food logs per day with Snap/Describe.')).toBeTruthy();
});

test('Plus benefits advertise only features that exist today', async () => {
  await render(<PaywallScreen {...props()} />, { wrapper });
  const benefits = within(screen.getByTestId('paywall-plus-benefits'));
  for (const benefit of ['AI food logging beyond the free tries', 'Higher daily AI limits']) {
    expect(benefits.getByText(benefit)).toBeTruthy();
  }
  expect(benefits.queryByText('Advanced trends')).toBeNull();
  expect(screen.queryByText(/voice|recipe|menu/i)).toBeNull();
  for (const feature of ['988 crisis card', 'Data export', 'Data and account deletion', 'Logging', 'Check-ins', 'Workouts', 'Barcode scan', 'Import from the web app', 'Basic trends', 'Advanced trends', 'Plain workout summary']) {
    expect(benefits.queryByText(feature)).toBeNull();
  }
});

test('empty products preserve free features, restore, legal links and close', async () => {
  const input = props();
  await render(<PaywallScreen {...input} products={[]} />, { wrapper });
  expect(screen.getByText('No plans available right now. Please try again later.')).toBeTruthy();
  expect(screen.getByTestId('paywall-always-free')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Terms of use' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close Insight Plus' }));
  expect(input.onClose).toHaveBeenCalledTimes(1);
});

test('failed legal link can retry without losing the close action', async () => {
  const input = props();
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('offline')).mockResolvedValue();
  try {
    await render(<PaywallScreen {...input} />, { wrapper });
    await fireEvent.press(screen.getByRole('link', { name: 'Terms of use' }));
    expect(screen.getByText('Could not open the link. Please try again.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Terms of use' }));
    expect(screen.queryByText('Could not open the link. Please try again.')).toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Close Insight Plus' }));
    expect(input.onClose).toHaveBeenCalledTimes(1);
  } finally { open.mockRestore(); }
});

test('plans are two selectable cards with one button; the first listed plan starts selected and nothing else is pre-chosen', async () => {
  const input = props();
  await render(<PaywallScreen {...input} />, { wrapper });
  const monthly = screen.getByRole('radio', { name: 'Monthly, $4.99 per month. 7-day free trial, then $4.99 per month.' });
  const yearly = screen.getByRole('radio', { name: 'Yearly, $39.99 per year. 7-day free trial, then $39.99 per year.' });
  expect(monthly).toBeSelected();
  expect(yearly).not.toBeSelected();
  expect(screen.getAllByRole('button', { name: /^Subscribe to/ })).toHaveLength(1);
  await fireEvent.press(yearly);
  expect(yearly).toBeSelected();
  expect(monthly).not.toBeSelected();
  expect(input.onPurchase).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Subscribe to Yearly' }));
  expect(input.onPurchase).toHaveBeenCalledTimes(1);
  expect(input.onPurchase).toHaveBeenCalledWith('yearly');
});

test('a plan without a trial says so and the button reads Subscribe', async () => {
  const input = props();
  input.products = [{ id: 'monthly', title: 'Monthly', priceString: '$4.99', period: 'month' }];
  await render(<PaywallScreen {...input} />, { wrapper });
  expect(screen.getByText('No free trial.')).toBeTruthy();
  expect(screen.getByText('Subscribe')).toBeTruthy();
  expect(screen.queryByText('Start free trial')).toBeNull();
});

test('says plainly that everything else stays free, with no pressure wording', async () => {
  await render(<PaywallScreen {...props()} />, { wrapper });
  expect(screen.getByText('Insight is free. Plus adds extra AI help, and nothing else.')).toBeTruthy();
  expect(screen.getByTestId('paywall-stays-free')).toHaveTextContent('Everything else stays free, with or without Plus.');
  expect(screen.queryByText(/limited time|hurry|only today|best value|most popular|save \d|simulator|sample prices/i)).toBeNull();
});

test('when purchases are unavailable the button and restore are disabled and one plain sentence says why', async () => {
  const input = props();
  await render(<PaywallScreen {...input} purchasesAvailable={false} />, { wrapper });
  const reason = 'Purchases are not available in this version of the app yet.';
  expect(screen.getByTestId('paywall-unavailable')).toHaveTextContent(reason);
  const subscribe = screen.getByRole('button', { name: 'Subscribe to Monthly' });
  expect(subscribe).toBeDisabled();
  expect(subscribe.props.accessibilityHint).toBe(reason);
  expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeDisabled();
  await fireEvent.press(subscribe);
  await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
  expect(input.onPurchase).not.toHaveBeenCalled();
  expect(input.onRestore).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Close Insight Plus' }));
  expect(input.onClose).toHaveBeenCalledTimes(1);
});

test('close has a 44pt target and a failed link offers Retry inline', async () => {
  const input = props();
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('offline')).mockResolvedValue();
  try {
    await render(<PaywallScreen {...input} />, { wrapper });
    const close = screen.getByTestId('paywall-close');
    const style = StyleSheet.flatten(typeof close.props.style === 'function' ? close.props.style({ pressed: false }) : close.props.style);
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));
    expect(screen.getByTestId('paywall-link-error')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(open.mock.calls).toEqual([[input.privacyUrl], [input.privacyUrl]]);
    expect(screen.queryByTestId('paywall-link-error')).toBeNull();
  } finally { open.mockRestore(); }
});
