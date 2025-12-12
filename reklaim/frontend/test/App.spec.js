import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import App from '../App';

jest.mock('../pages/ReturnsDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-component">Returns Dashboard Component</div>,
  ReturnsDashboard: () => <div data-testid="dashboard-component">Returns Dashboard Component</div>
}));

describe('App Component', () => {
  test('Renders ReturnsDashboard component', () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId('dashboard-component')).toBeInTheDocument();
  });
});
