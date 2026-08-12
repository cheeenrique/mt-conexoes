import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarginAlertBanner } from './margin-alert-banner';
import type { MarginAlertSummary } from '../queries';

function makeSummary(overrides: Partial<MarginAlertSummary> = {}): MarginAlertSummary {
  return {
    negativeCount: 0,
    belowThresholdCount: 0,
    ...overrides,
  };
}

describe('MarginAlertBanner', () => {
  it('sem assinaturas em alerta não renderiza nada', () => {
    const { container } = render(<MarginAlertBanner summary={makeSummary()} />);
    expect(container.firstChild).toBeNull();
  });

  it('1 assinatura com margem negativa usa singular', () => {
    render(<MarginAlertBanner summary={makeSummary({ negativeCount: 1 })} />);
    expect(screen.getByText('1 assinatura com margem negativa')).toBeInTheDocument();
  });

  it('2 assinaturas com margem negativa usa plural', () => {
    render(<MarginAlertBanner summary={makeSummary({ negativeCount: 2 })} />);
    expect(screen.getByText('2 assinaturas com margem negativa')).toBeInTheDocument();
  });

  it('1 assinatura abaixo do limite usa singular', () => {
    render(<MarginAlertBanner summary={makeSummary({ belowThresholdCount: 1 })} />);
    expect(screen.getByText('1 assinatura com margem abaixo do limite')).toBeInTheDocument();
  });

  it('2 assinaturas abaixo do limite usa plural', () => {
    render(<MarginAlertBanner summary={makeSummary({ belowThresholdCount: 2 })} />);
    expect(screen.getByText('2 assinaturas com margem abaixo do limite')).toBeInTheDocument();
  });
});
