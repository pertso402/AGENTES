import { NextResponse } from 'next/server';

// Senha simples (Basic Auth), e só se PANEL_PASSWORD estiver definida. Deixar
// vazio é uma escolha legítima aqui: parar pra digitar senha na frente do lead
// custa mais do que protege um painel que só contém dados de demonstração.
export function middleware(request) {
  const senha = process.env.PANEL_PASSWORD;
  if (!senha) return NextResponse.next();

  const auth = request.headers.get('authorization');
  if (auth) {
    const [, base64] = auth.split(' ');
    const [, informada] = Buffer.from(base64 || '', 'base64').toString().split(':');
    if (informada === senha) return NextResponse.next();
  }

  return new NextResponse('Acesso restrito', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Agente Demo"' },
  });
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
