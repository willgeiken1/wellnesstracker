import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import PaywallRoute from '../src/app/paywall';
import { ThemeProvider } from '../src/design/theme-provider';
import { mockPurchaseProvider } from '../src/features/paywall/purchase-provider';

jest.mock('expo-router', () => ({ router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

test('the route shows the provider prices in plain words, with purchases off and no network requests', async () => {
  const http = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network forbidden in preview'));
  const purchase = jest.spyOn(mockPurchaseProvider, 'purchase'), restore = jest.spyOn(mockPurchaseProvider, 'restore');
  try {
    await render(<PaywallRoute />, { wrapper });
    expect(screen.queryByText(/simulator|sample prices|purchases disabled|preview/i)).toBeNull();
    expect(screen.getByText('Purchases are not available in this version of the app yet.')).toBeTruthy();
    expect(mockPurchaseProvider.products.map(product => [product.period, product.priceString])).toEqual([
      ['month', '$4.99'],
      ['year', '$39.99'],
    ]);
    expect(screen.getByText('$4.99 per month')).toBeTruthy();
    expect(screen.getByText('$39.99 per year')).toBeTruthy();
    expect(screen.queryByText(/voice|recipe|menu/i)).toBeNull();
    for (const product of mockPurchaseProvider.products) {
      await fireEvent.press(screen.getByTestId(`paywall-product-${product.id}`));
      const subscribe = screen.getByRole('button', { name: `Subscribe to ${product.title}` });
      expect(subscribe).toBeDisabled();
      await fireEvent.press(subscribe);
    }
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Restore purchases' }));
    expect(purchase).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
    expect(screen.getByText('988 crisis card')).toBeTruthy();
  } finally { http.mockRestore(); purchase.mockRestore(); restore.mockRestore(); }
});

test.each([true, false])('close dismisses the preview when history is %s', async (hasHistory) => {
  jest.clearAllMocks();
  (router.canGoBack as jest.Mock).mockReturnValue(hasHistory);
  await render(<PaywallRoute />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Close Insight Plus' }));
  if (hasHistory) {
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  } else {
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.back).not.toHaveBeenCalled();
  }
});
