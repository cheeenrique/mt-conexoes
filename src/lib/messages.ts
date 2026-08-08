export const messages = {
  common: {
    unexpectedError: 'Algo deu errado. Tente de novo em instantes.',
    invalidInput: 'Dados inválidos.',
  },
  auth: {
    passwordChanged: 'Senha alterada com sucesso.',
    invalidInput: 'Dados inválidos.',
    loginFailed: 'Não foi possível entrar. Tente de novo.',
    passwordChangeFailed: 'Não foi possível trocar a senha. Tente de novo.',
  },
  suppliers: {
    created: 'Fornecedor cadastrado.',
    updated: 'Fornecedor atualizado.',
  },
  plans: {
    created: 'Plano cadastrado.',
    updated: 'Plano atualizado.',
  },
  customers: {
    created: 'Cliente cadastrado.',
    updated: 'Cliente atualizado.',
  },
  subscriptions: {
    created: 'Assinatura cadastrada.',
    updated: 'Assinatura atualizada.',
  },
  charges: {
    paymentRegistered: 'Pagamento registrado.',
    cancelled: 'Cobrança cancelada.',
  },
  settings: {
    saved: 'Alterações salvas.',
  },
  messaging: {
    credentialsSaved: 'Credenciais salvas.',
    testOk: 'Conexão testada com sucesso.',
    testFailed: 'Falha ao testar a conexão.',
    activated: 'Canal ativado.',
    deactivated: 'Canal desativado.',
    defaultSet: 'Canal definido como padrão.',
  },
} as const;
