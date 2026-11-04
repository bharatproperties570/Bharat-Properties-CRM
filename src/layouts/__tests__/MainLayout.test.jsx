import React, { act } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../MainLayout';

// Mock child components that have their own external dependencies
vi.mock('../../components/Sidebar', () => ({
    default: () => <nav data-testid="mock-sidebar">Sidebar</nav>
}));

vi.mock('../../components/Header', () => ({
    default: () => <header data-testid="mock-header">Header</header>
}));

vi.mock('../../components/jarvis/JarvisWidget', () => ({
    default: () => <div data-testid="mock-jarvis">Jarvis</div>
}));

vi.mock('../../utils/crmHooks', () => ({
    useAddActivityMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() })
}));

vi.mock('../../context/ImportContext', () => ({
    useImport: () => ({ activeImports: [] })
}));

describe('MainLayout Component & Lazy Modal Architecture', () => {
    test('renders children and structural navigation correctly', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <MainLayout>
                        <div data-testid="main-content">Dashboard Content</div>
                    </MainLayout>
                </MemoryRouter>
            );
        });

        expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument();
        expect(screen.getByTestId('mock-header')).toBeInTheDocument();
        expect(screen.getByTestId('main-content')).toBeInTheDocument();
    });

    test('supports render prop children with injected modal handlers', async () => {
        let capturedHandlers = null;
        await act(async () => {
            render(
                <MemoryRouter>
                    <MainLayout>
                        {(handlers) => {
                            capturedHandlers = handlers;
                            return <div data-testid="render-prop-content">Injected Content</div>;
                        }}
                    </MainLayout>
                </MemoryRouter>
            );
        });

        expect(screen.getByTestId('render-prop-content')).toBeInTheDocument();
        expect(capturedHandlers).toBeDefined();
        expect(typeof capturedHandlers.onAddDeal).toBe('function');
        expect(typeof capturedHandlers.onEditContact).toBe('function');
        expect(typeof capturedHandlers.onAddInventory).toBe('function');
        expect(typeof capturedHandlers.onAddActivity).toBe('function');
    });
});
