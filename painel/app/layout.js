import './globals.css';
import Moldura from './moldura';

export const metadata = {
  title: 'Agente Demo',
  description: 'Disparo de oferta, atendimento e painel de pedidos',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0b0b0f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <Moldura>{children}</Moldura>
      </body>
    </html>
  );
}
