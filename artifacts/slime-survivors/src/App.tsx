import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Game } from './game/Game';

const queryClient = new QueryClient();

function App() {
  // The Capacitor build uses "./" so its assets can be loaded from the
  // packaged WebView. Wouter still needs a normal URL base, not ".".
  const routerBase = import.meta.env.BASE_URL.startsWith('/')
    ? import.meta.env.BASE_URL.replace(/\/$/, '')
    : '';

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={routerBase}>
        <Switch>
          <Route path="/" component={Game} />
          <Route component={Game} />
        </Switch>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
