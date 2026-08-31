import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Navbar from '~/components/Navbar';

jest.mock('~/supabaseClient', () => ({
  supabase: {
    auth: { signOut: jest.fn().mockResolvedValue({ error: null }) },
  },
}));

jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// Mock assets so we don’t need the actual image
jest.mock('~/assets/assets', () => ({
  assets: {
    logo: 'mock-logo.png',
  },
}));

describe('Navbar', () => {
  test('renders logo image and logout button', () => {
    const mockSetToken = jest.fn();
    render(<Navbar setToken={mockSetToken} />);

    // Check logo image
    const logoImg = screen.getByRole('img');
    expect(logoImg).toBeInTheDocument();
    expect(logoImg).toHaveAttribute('src', 'mock-logo.png');

    // Check logout button
    const logoutButton = screen.getByRole('button', { name: /logout/i });
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton).toHaveClass('bg-gray-600');
  });

  test('clicking logout clears the application token', async () => {
    const mockSetToken = jest.fn();
    render(<Navbar setToken={mockSetToken} />);

    const logoutButton = screen.getByRole('button', { name: /logout/i });
    fireEvent.click(logoutButton);

    await screen.findByRole('button', { name: /logout/i });
    expect(mockSetToken).toHaveBeenCalledWith('');
  });

  test('renders container with proper layout classes', () => {
    const mockSetToken = jest.fn();
    const { container } = render(<Navbar setToken={mockSetToken} />);

    const rootDiv = container.firstChild;
    expect(rootDiv).toHaveClass('flex');
    expect(rootDiv).toHaveClass('items-center');
    expect(rootDiv).toHaveClass('justify-between');
  });
});
