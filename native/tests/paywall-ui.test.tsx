import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { PaywallScreen, type PaywallScreenProps } from '../src/features/paywall/screen';
import { ThemeProvider } from '../src/design/theme-provider';

const props = (): PaywallScreenProps => ({
  products: [
    { id: 'monthly', title: 'Monthly', priceString: '$4.99', period: 'month', trialDays: 7 },
    { id: 'yearly', title: 'Yearly', priceString: '$39.99', period: 'year' },
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
    expect(card.getByText('Renews automatically unless cancelled at least 24 hours before the end of the period; manage in Settings.')).toBeTruthy();
  }
  expect(screen.getByText('7-day free trial, then $4.99 per month.')).toBeTruthy();
  expect(screen.getByText('No free trial.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Subscribe to Monthly' }));
  expect(input.onPurchase).toHaveBeenCalledWith('monthly');
});

test('restore and legal links work; closing is available even while busy with an error', async () => {
  const input = props();
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
  try {
    const view = await render(<PaywallScreen {...input} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Restore Purchases' }));
    expect(input.onRestore).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('link', { name: 'Terms (EULA)' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy' }));
    expect(open.mock.calls).toEqual([[input.termsUrl], [input.privacyUrl]]);
    await view.rerender(<PaywallScreen {...input} busy error="Could not complete purchase. Try again." />);
    expect(screen.getByText('Could not complete purchase. Try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore Purchases' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Subscribe to Monthly' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Subscribe to Monthly' }));
    expect(input.onPurchase).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Close paywall' }));
    expect(input.onClose).toHaveBeenCalledTimes(1);
    await view.rerender(<PaywallScreen {...input} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Subscribe to Yearly' }));
    expect(input.onPurchase).toHaveBeenCalledWith('yearly');
  } finally { open.mockRestore(); }
});

test('all protected features are always free without purchasing or restoring', async () => {
  const input = props();
  await render(<PaywallScreen {...input} />, { wrapper });
  const free = within(screen.getByTestId('paywall-always-free'));
  expect(free.getByText('Always free')).toBeTruthy();
  for (const feature of ['988 crisis card', 'Data export', 'Data and account deletion', 'Logging', 'Check-ins', 'Workouts', 'Barcode scan', 'PWA importer', 'Basic trends', 'Advanced trends', 'Plain workout summary']) {
    expect(free.getByText(feature)).toBeTruthy();
  }
  expect(input.onPurchase).not.toHaveBeenCalled();
  expect(input.onRestore).not.toHaveBeenCalled();
  expect(free.getByText('2 free AI food logs per day with Snap/Describe.')).toBeTruthy();
});

test('Plus benefits list only the approved AI extras', async () => {
  await render(<PaywallScreen {...props()} />, { wrapper });
  const benefits = within(screen.getByTestId('paywall-plus-benefits'));
  expect(benefits.getByText('AI extras for food logging')).toBeTruthy();
  expect(benefits.getByText('AI voice food logging, recipe URL import and menu/dish scan.')).toBeTruthy();
  expect(benefits.queryByText(/trends|workout|summary|summaries/i)).toBeNull();
  expect(screen.queryByText(/beyond free tries|higher AI daily caps|unlimited/i)).toBeNull();
});

test('empty products preserve free features, restore, legal links and close', async () => {
  const input = props();
  await render(<PaywallScreen {...input} products={[]} />, { wrapper });
  expect(screen.getByText('No plans available right now. Please try again later.')).toBeTruthy();
  expect(screen.getByTestId('paywall-always-free')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore Purchases' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Terms (EULA)' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close paywall' }));
  expect(input.onClose).toHaveBeenCalledTimes(1);
});

test('failed legal link can retry without losing the close action', async () => {
  const input = props();
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('offline')).mockResolvedValue();
  try {
    await render(<PaywallScreen {...input} />, { wrapper });
    await fireEvent.press(screen.getByRole('link', { name: 'Terms (EULA)' }));
    expect(screen.getByText('Could not open the link. Please try again.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Terms (EULA)' }));
    expect(screen.queryByText('Could not open the link. Please try again.')).toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Close paywall' }));
    expect(input.onClose).toHaveBeenCalledTimes(1);
  } finally { open.mockRestore(); }
});
