import { EntitlementProvider } from '../src/features/plus/use-entitlement';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import PaywallRoute from '../src/app/paywall';
import { ThemeProvider } from '../src/design/theme-provider';
import { mockPurchaseProvider } from '../src/features/paywall/purchase-provider';


jest.mock('expo-router', () => ({ router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <EntitlementProvider><ThemeProvider>{children}</ThemeProvider></EntitlementProvider>;

test('local preview renders sample products; purchase and restore make no network requests', async () => {
  const http = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network forbidden in preview'));
  try {
    await render(<PaywallRoute />, { wrapper });
    expect(screen.getByText('Simulator preview · Sample prices · No real purchases')).toBeTruthy();
    expect(mockPurchaseProvider.products.map(product => [product.period, product.priceString])).toEqual([
      ['month', '$4.99'],
      ['year', '$39.99'],
    ]);
    expect(screen.getByText('$4.99 per month')).toBeTruthy();
    expect(screen.getByText('$39.99 per year')).toBeTruthy();
    expect(screen.queryByText(/voice|recipe|menu/i)).toBeNull();
    for (const product of mockPurchaseProvider.products) {
      await fireEvent.press(screen.getByRole('button', { name: `Subscribe to ${product.title}` }));
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Restore Purchases' }));
    expect(http).not.toHaveBeenCalled();
    expect(screen.getByText('988 crisis card')).toBeTruthy();
  } finally { http.mockRestore(); }
});

test.each([true, false])('close dismisses the preview when history is %s', async (hasHistory) => {
  jest.clearAllMocks();
  (router.canGoBack as jest.Mock).mockReturnValue(hasHistory);
  await render(<PaywallRoute />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Close paywall' }));
  if (hasHistory) {
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  } else {
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.back).not.toHaveBeenCalled();
  }
});
