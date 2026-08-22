import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from './alert';

describe('Alert', () => {
  it('renderiza o conteúdo passado por children', () => {
    render(<Alert tone="danger">E-mail ou senha incorretos.</Alert>);
    expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument();
  });

  it('tom danger usa role="alert" — interrompe o leitor para erro imediato', () => {
    render(<Alert tone="danger">Erro</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Erro');
  });

  it('tons que não são erro usam role="status" por padrão — não interrompe o leitor', () => {
    render(<Alert tone="info">Aviso</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Aviso');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('role é sobrescrevível independente do tom', () => {
    render(
      <Alert tone="warning" role="alert">
        Precisa interromper
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Precisa interromper');
  });

  it('aceita composição de conteúdo (ex.: texto + ação), não só string', () => {
    render(
      <Alert tone="warning">
        <p>N assinaturas com margem abaixo de 15%</p>
        <a href="/clientes">Ver assinaturas</a>
      </Alert>,
    );
    expect(screen.getByText('N assinaturas com margem abaixo de 15%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver assinaturas' })).toBeInTheDocument();
  });
});
