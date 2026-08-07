import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from './data-table';

type Row = { id: string; name: string };

const columns = [{ header: 'Nome', cell: (row: Row) => row.name }];

describe('DataTable', () => {
  it('renderiza cabeçalho e linhas', () => {
    render(
      <DataTable
        columns={columns}
        rows={[{ id: '1', name: 'João' }]}
        rowKey={(row: Row) => row.id}
        page={1}
        perPage={8}
        total={1}
        onPageChange={() => {}}
        onPerPageChange={() => {}}
        emptyState={<p>vazio</p>}
      />,
    );
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('João')).toBeInTheDocument();
  });

  it('mostra emptyState quando não há linhas', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row: Row) => row.id}
        page={1}
        perPage={8}
        total={0}
        onPageChange={() => {}}
        onPerPageChange={() => {}}
        emptyState={<p>Nenhum registro</p>}
      />,
    );
    expect(screen.getByText('Nenhum registro')).toBeInTheDocument();
  });

  it('botão de próxima página dispara onPageChange', async () => {
    const onPageChange = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');
    render(
      <DataTable
        columns={columns}
        rows={[{ id: '1', name: 'João' }]}
        rowKey={(row: Row) => row.id}
        page={1}
        perPage={8}
        total={20}
        onPageChange={onPageChange}
        onPerPageChange={() => {}}
        emptyState={<p>vazio</p>}
      />,
    );
    await userEvent.click(screen.getByLabelText('Próxima página'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
