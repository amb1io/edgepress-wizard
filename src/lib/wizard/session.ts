export const WIZARD_STORAGE_KEYS = {
	token: "edgepress-wizard:cf-token",
	validated: "edgepress-wizard:cf-token-validated",
	pending: "edgepress-wizard:cf-token-pending",
	config: "edgepress-wizard:setup-config",
	configCompleted: "edgepress-wizard:setup-config-completed",
	installPending: "edgepress-wizard:install-pending",
	installCompleted: "edgepress-wizard:install-completed",
	installResult: "edgepress-wizard:install-result",
	installError: "edgepress-wizard:install-error",
} as const;

export const WIZARD_ERROR_MESSAGES: Record<string, string> = {
	missing_token: "Informe o token do Cloudflare para continuar.",
	invalid_token:
		"Token inválido ou sem permissão para acessar a API do Cloudflare.",
	token_inactive: "O token informado está inativo ou expirado.",
	network_error:
		"Não foi possível conectar à API do Cloudflare. Verifique sua conexão e tente novamente.",
	invalid_request: "Requisição inválida. Tente novamente.",
	missing_fields:
		"Preencha todos os campos obrigatórios: nome, email e senha.",
	password_too_short: "A senha deve ter no mínimo 8 caracteres.",
	domains_load_failed:
		"Não foi possível carregar os domínios. Verifique as permissões do token (Zone Read).",
	domain_required:
		"Selecione um domínio cadastrado ou desmarque a opção de associação.",
	invalid_prefix: "O prefixo do site deve conter exatamente 3 letras.",
	install_failed: "Falha ao instalar recursos no Cloudflare.",
	install_build_token_missing:
		"Build token não encontrado. Crie um em Workers > Settings > Builds > API token.",
	install_build_setup_failed:
		"Não foi possível configurar o deploy automático via GitHub Builds.",
	install_github_not_connected:
		"Conecte o app GitHub da Cloudflare ao repositório amb1io/edgepress no dashboard antes de instalar.",
	install_github_error: "Erro ao obter dados do repositório GitHub oficial.",
	install_worker_tag_missing:
		"Worker criado, mas não foi possível obter a tag para configurar o build.",
	install_secret_failed:
		"Não foi possível configurar BETTER_AUTH_SECRET no Worker. Verifique a permissão Workers Scripts Edit.",
	install_subdomain_failed:
		"Não foi possível habilitar o subdomínio workers.dev. Verifique Account Settings Read e Workers Scripts Edit.",
	install_build_failed:
		"O build/deploy do Worker falhou ou expirou (migrate, seed ou compile). Verifique os logs no dashboard Cloudflare.",
	install_setup_failed:
		"O Worker foi publicado, mas não foi possível concluir o setup do EdgePress (usuário admin e settings).",
	install_setup_seed_failed:
		"Setup concluído, mas falhou ao atualizar site_url no D1. Verifique permissão D1 Edit.",
	install_queues_unavailable:
		"Cloudflare Queues exigem o plano Workers Paid. Atualize sua conta e verifique a permissão Queues Write no token antes de instalar.",
};

export type WizardSetupConfig = {
	name: string;
	email: string;
	password: string;
	siteName: string;
	siteDescription: string;
	sitePrefix: string;
	associateDomain: boolean;
	zoneId?: string;
	zoneName?: string;
};
