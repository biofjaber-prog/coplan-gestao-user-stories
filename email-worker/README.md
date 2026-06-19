# API segura para envio de PDF

Esta pasta contém um Cloudflare Worker que recebe o formulário da Gestão e envia o PDF pela API da Resend.

## Configuração

1. Crie uma conta na Resend e valide o domínio remetente.
2. Edite `wrangler.toml`:
   - `EMAIL_FROM`: remetente validado, por exemplo `Coplan <documentos@seudominio.gov.br>`.
   - `ALLOWED_ORIGIN`: origem exata do sistema, sem barra final, por exemplo `https://usuario.github.io`.
3. Instale as dependências:

   ```powershell
   npm install
   ```

4. Autentique o Wrangler:

   ```powershell
   npx wrangler login
   ```

5. Grave a chave da Resend como segredo:

   ```powershell
   npx wrangler secret put RESEND_API_KEY
   ```

6. Publique:

   ```powershell
   npm run deploy
   ```

7. Copie a URL final do Worker e cole em **Gestão > Enviar PDF > URL da API de envio**.

## Observações de segurança

- A chave da Resend nunca deve ser colocada no HTML ou em `assets/email-config.js`.
- A validação de origem reduz uso acidental, mas não substitui autenticação real.
- Antes de produção, proteja o sistema com autenticação no servidor e aplique rate limiting no Worker.
- O Worker aceita apenas PDF com assinatura válida e limite de 8 MB.
