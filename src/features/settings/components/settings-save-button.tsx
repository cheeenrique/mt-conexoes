'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Dispara o mesmo `<form id="settings-form">` da aba Negócio via atributo
// HTML `form` — não duplica o handler de submit do react-hook-form, que
// continua sendo a única fonte de validação e envio (`settings-form.tsx`).
// Só a aba Negócio renderiza esse form; por isso `(app)/settings/page.tsx`
// só monta este botão como `primaryAction` quando `aba === 'negocio'`. A aba
// Canais salva por linha ("Salvar e testar conexão" em `ChannelSetupPanel`),
// não tem form único no DOM — o botão do header não pode fingir que salva.
export function SettingsSaveButton() {
  return (
    <Button type="submit" form="settings-form">
      <Check aria-hidden="true" />
      Salvar
    </Button>
  );
}
