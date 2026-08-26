import { Upload } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/lib/settings';
import { ImportWizard } from '@/features/customers/import/components/import-wizard';
import { previewCustomersImportAction } from './preview-action';
import { confirmCustomersImportAction } from './import-action';

export default async function ImportCustomersPage() {
  const [suppliers, settings] = await Promise.all([listActiveSuppliersForSelect(), getSettings()]);

  return (
    <AppShell title="Importar planilha" icon={<Upload size={22} />}>
      <ImportWizard
        suppliers={suppliers}
        timezone={settings.timezone}
        previewImport={previewCustomersImportAction}
        confirmImport={confirmCustomersImportAction}
      />
    </AppShell>
  );
}
